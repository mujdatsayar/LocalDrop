const express = require('express');
const multer = require('multer');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const ffmpegPath = require('ffmpeg-static');
const { exec, execFile } = require('child_process');
const { prepareStorageLayout } = require('./storage-layout');

const app = express();
const DEFAULT_PORT = process.env.PORT === undefined ? 0 : Number(process.env.PORT);
const PIN_TTL_MS = 5 * 60 * 1000;
const MAX_FAILED_PIN_ATTEMPTS = 8;
const DEFAULT_STORAGE_ROOT = path.join(__dirname, 'files');
const defaultStorage = (!process.env.LOCALSEND_UPLOAD_DIR && !process.env.LOCALSEND_DOWNLOAD_DIR)
    ? prepareStorageLayout(DEFAULT_STORAGE_ROOT, path.join(__dirname, '..'))
    : null;
const UPLOAD_DIR = process.env.LOCALSEND_UPLOAD_DIR
    ? path.resolve(process.env.LOCALSEND_UPLOAD_DIR)
    : (defaultStorage?.uploadDirectory || path.join(DEFAULT_STORAGE_ROOT, 'uploads'));
const DOWNLOAD_DIR = process.env.LOCALSEND_DOWNLOAD_DIR
    ? path.resolve(process.env.LOCALSEND_DOWNLOAD_DIR)
    : (defaultStorage?.downloadDirectory || path.join(DEFAULT_STORAGE_ROOT, 'download'));
const MANIFEST_FILE = path.join(UPLOAD_DIR, '.localsend-files.json');
const MEDIA_CACHE_DIR = path.join(os.tmpdir(), 'localdrop-media-cache');

let currentPin = createPin();
let runtimePort = DEFAULT_PORT;
let runtimeHost = '127.0.0.1';
let runtimeNetwork = getPrimaryNetwork();
let sessionActive = true;
let pairedClientAddress = null;
let pinExpiresAt = Date.now() + PIN_TTL_MS;
let pinRotationTimer = null;
const storageEventClients = new Set();
let storageEventTimer = null;
let storageWatchers = [];
const mediaConversions = new Map();
const failedPinAttempts = new Map();

if (!Number.isInteger(DEFAULT_PORT) || DEFAULT_PORT < 0 || DEFAULT_PORT > 65535) {
    throw new Error('PORT değeri 0 ile 65535 arasında olmalıdır.');
}

for (const directory of [UPLOAD_DIR, DOWNLOAD_DIR]) {
    fs.mkdirSync(directory, { recursive: true });
    for (const filename of fs.readdirSync(directory)) {
        if (!filename.startsWith('.upload-')) continue;
        try { fs.unlinkSync(path.join(directory, filename)); } catch (error) { /* stale temp file stays hidden */ }
    }
}
fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });

function broadcastStorageChange() {
    if (storageEventTimer) clearTimeout(storageEventTimer);
    storageEventTimer = setTimeout(() => {
        const message = `event: storage-change\ndata: ${JSON.stringify({ changedAt: Date.now() })}\n\n`;
        for (const client of storageEventClients) client.write(message);
    }, 180);
    storageEventTimer.unref?.();
}

function startStorageWatchers() {
    if (process.env.LOCALSEND_NO_WATCH === '1' || storageWatchers.length > 0) return;
    storageWatchers = [UPLOAD_DIR, DOWNLOAD_DIR].map((directory) => {
        const watcher = fs.watch(directory, (eventType, filename) => {
            const changedName = filename ? String(filename) : '';
            if (changedName.startsWith('.upload-') || changedName.startsWith('.localsend-files')) return;
            broadcastStorageChange();
        });
        watcher.on('error', (error) => console.error('Klasör senkronizasyonu durdu:', error.message));
        watcher.unref?.();
        return watcher;
    });
}

function stopStorageWatchers() {
    for (const watcher of storageWatchers) watcher.close();
    storageWatchers = [];
    if (storageEventTimer) clearTimeout(storageEventTimer);
    storageEventTimer = null;
}

app.disable('x-powered-by');
app.use(restrictNetworkAccess);
app.use(validateHostHeader);
app.use((req, res, next) => {
    res.set({
        'Content-Security-Policy': "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'",
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    });
    next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getPrimaryNetwork() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const [name, addresses] of Object.entries(interfaces)) {
        for (const address of addresses || []) {
            if (address.family !== 'IPv4' || address.internal) continue;
            candidates.push({ name, address: address.address, netmask: address.netmask, cidr: address.cidr });
        }
    }
    return candidates.find((item) => isPrivateIpv4(item.address)) || candidates[0] || null;
}

function getNetworkByAddress(address) {
    const normalized = normalizeAddress(address);
    const interfaces = os.networkInterfaces();
    for (const [name, addresses] of Object.entries(interfaces)) {
        const match = (addresses || []).find((item) => item.family === 'IPv4' && item.address === normalized);
        if (match) return { name, address: match.address, netmask: match.netmask, cidr: match.cidr };
    }
    return null;
}

function isPrivateIpv4(address) {
    const parts = String(address).split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168);
}

function normalizeAddress(address) {
    const value = String(address || '').split('%')[0];
    if (value === '::1') return '127.0.0.1';
    return value.startsWith('::ffff:') ? value.slice(7) : value;
}

function ipv4ToInteger(address) {
    const parts = String(address).split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    return parts.reduce((value, part) => ((value << 8) | part) >>> 0, 0);
}

function isSameSubnet(address, network) {
    if (!network) return false;
    const candidate = ipv4ToInteger(address);
    const local = ipv4ToInteger(network.address);
    const mask = ipv4ToInteger(network.netmask);
    if (candidate === null || local === null || mask === null) return false;
    return (candidate & mask) === (local & mask);
}

function isLoopbackAddress(address) {
    return normalizeAddress(address).startsWith('127.');
}

function restrictNetworkAccess(req, res, next) {
    const remoteAddress = normalizeAddress(req.socket.remoteAddress);
    if (isLoopbackAddress(remoteAddress) || isSameSubnet(remoteAddress, runtimeNetwork)) return next();
    res.set('Cache-Control', 'no-store').status(403).end();
}

function getRequestHostname(req) {
    const host = String(req.headers.host || '').trim().toLowerCase();
    if (!host) return '';
    try {
        return new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '');
    } catch (error) {
        return '';
    }
}

function validateHostHeader(req, res, next) {
    const hostname = getRequestHostname(req);
    const allowedHosts = new Set(['localhost', '127.0.0.1', normalizeAddress(runtimeHost)]);
    if (runtimeNetwork?.address) allowedHosts.add(runtimeNetwork.address);
    if (allowedHosts.has(hostname)) return next();
    res.status(421).json({ error: 'Geçersiz sunucu adresi.' });
}

function createPin() {
    return crypto.randomInt(100000, 1000000).toString();
}

function schedulePinRotation() {
    if (pinRotationTimer) clearTimeout(pinRotationTimer);
    if (!sessionActive || !pinExpiresAt) return;

    pinRotationTimer = setTimeout(() => {
        if (!sessionActive) return;
        currentPin = createPin();
        pinExpiresAt = Date.now() + PIN_TTL_MS;
        pairedClientAddress = null;
        failedPinAttempts.clear();
        console.log(`\nBağlantı kodu otomatik yenilendi: ${currentPin}`);
        schedulePinRotation();
    }, Math.max(0, pinExpiresAt - Date.now()));
    pinRotationTimer.unref?.();
}

function renewPin() {
    currentPin = createPin();
    pinExpiresAt = Date.now() + PIN_TTL_MS;
    pairedClientAddress = null;
    failedPinAttempts.clear();
    schedulePinRotation();
}

schedulePinRotation();

function isLocalRequest(req) {
    const remoteAddress = normalizeAddress(req.socket.remoteAddress);
    const localAddress = normalizeAddress(req.socket.localAddress);
    return isLoopbackAddress(remoteAddress) || remoteAddress === localAddress;
}

function requireDesktop(req, res, next) {
    if (!isLocalRequest(req)) {
        return res.status(403).json({ error: 'Bu işlem yalnızca bilgisayardan yapılabilir.' });
    }
    next();
}

function requireDesktopOrPin(req, res, next) {
    if (isLocalRequest(req)) return next();
    verifyPin(req, res, next);
}

function verifyPin(req, res, next) {
    const providedPin = String(req.headers['x-pin'] || req.query.pin || '');
    if (providedPin !== currentPin) {
        return rejectInvalidPin(req, res, { error: 'Oturum geçersiz. Yeni PIN ile yeniden bağlanın.' });
    }
    failedPinAttempts.delete(getClientKey(req));
    if (!sessionActive && !isLocalRequest(req)) {
        return res.status(401).json({ error: 'Bağlantı bilgisayardan kapatıldı. Yeniden bağlanmak için yeni QR kodunu okutun.' });
    }
    if (!isLocalRequest(req) && pairedClientAddress && getClientKey(req) !== pairedClientAddress) {
        return res.status(403).json({ error: 'Bu oturum başka bir telefona bağlı. Bilgisayardan bağlantıyı kesip yeni kod oluşturun.' });
    }
    next();
}

function getClientKey(req) {
    return normalizeAddress(req.socket.remoteAddress) || 'unknown';
}

function rejectInvalidPin(req, res, body) {
    const key = getClientKey(req);
    const now = Date.now();
    let attempt = failedPinAttempts.get(key);
    if (!attempt || now - attempt.startedAt >= PIN_TTL_MS) {
        attempt = { count: 0, startedAt: now };
    }
    attempt.count += 1;
    failedPinAttempts.set(key, attempt);
    if (attempt.count >= MAX_FAILED_PIN_ATTEMPTS) {
        return res.status(429).set('Retry-After', '300').json({ error: 'Çok fazla hatalı deneme yapıldı. Yeni bağlantı kodunu bekleyin.' });
    }
    return res.status(401).json(body);
}

function readManifest() {
    try {
        const data = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
        return Array.isArray(data) ? data : [];
    } catch (error) {
        return [];
    }
}

function writeManifest(entries) {
    const temporaryFile = `${MANIFEST_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(entries, null, 2), 'utf8');
    fs.renameSync(temporaryFile, MANIFEST_FILE);
}

function getStorageName(entry) {
    if (entry.storage === 'download' || entry.target === 'desktop') return 'download';
    return 'uploads';
}

function getStorageDirectory(storageName) {
    return storageName === 'download' ? DOWNLOAD_DIR : UPLOAD_DIR;
}

function resolveStoredFile(entry) {
    const directory = path.resolve(getStorageDirectory(getStorageName(entry)));
    const filePath = path.resolve(directory, entry.storedName);
    if (path.dirname(filePath) !== directory) throw new Error('Geçersiz dosya yolu.');
    return filePath;
}

function sanitizeOriginalName(originalName) {
    let decodedName = originalName;
    try {
        const repaired = Buffer.from(originalName, 'latin1').toString('utf8');
        if (!repaired.includes('\uFFFD')) decodedName = repaired;
    } catch (error) {
        decodedName = originalName;
    }

    const sanitizedName = path.basename(decodedName).replace(/[\u0000-\u001f\u007f]/g, '').trim() || 'dosya';
    if (sanitizedName.startsWith('.localsend-files') || sanitizedName.startsWith('.upload-')) {
        return `dosya-${sanitizedName.replace(/^\.+/, '')}`;
    }
    return sanitizedName;
}

function getMediaInfo(filename) {
    const extension = path.extname(filename).toLowerCase();
    const mediaTypes = {
        '.jpg': ['image', 'image/jpeg'],
        '.jpeg': ['image', 'image/jpeg'],
        '.png': ['image', 'image/png'],
        '.gif': ['image', 'image/gif'],
        '.webp': ['image', 'image/webp'],
        '.heic': ['image', 'image/heic'],
        '.heif': ['image', 'image/heif'],
        '.mp4': ['video', 'video/mp4'],
        '.mov': ['video', 'video/quicktime'],
        '.m4v': ['video', 'video/x-m4v']
    };
    const match = mediaTypes[extension];
    return match ? { kind: match[0], mimeType: match[1] } : null;
}

function createCompatibleVideo(entry) {
    const sourcePath = resolveStoredFile(entry);
    const stats = fs.statSync(sourcePath);
    const cacheKey = `${entry.id}-${stats.size}-${Math.trunc(stats.mtimeMs)}`;
    const outputPath = path.join(MEDIA_CACHE_DIR, `${cacheKey}.mp4`);
    if (fs.existsSync(outputPath)) return Promise.resolve(outputPath);
    if (mediaConversions.has(cacheKey)) return mediaConversions.get(cacheKey);

    const temporaryPath = path.join(MEDIA_CACHE_DIR, `${cacheKey}.working.mp4`);
    const conversion = new Promise((resolve, reject) => {
        const args = [
            '-y', '-i', sourcePath,
            '-map', '0:v:0', '-map', '0:a?',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '160k',
            '-movflags', '+faststart',
            '-f', 'mp4', temporaryPath
        ];
        const executablePath = process.resourcesPath && ffmpegPath.includes('app.asar')
            ? ffmpegPath.replace('app.asar', 'app.asar.unpacked')
            : ffmpegPath;
        execFile(executablePath, args, { windowsHide: true }, (error) => {
            if (error) {
                try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (cleanupError) { /* geçici dosya sonraki açılışta ezilir */ }
                reject(new Error('Video iPhone uyumlu biçime dönüştürülemedi.'));
                return;
            }
            fs.renameSync(temporaryPath, outputPath);
            resolve(outputPath);
        });
    }).finally(() => mediaConversions.delete(cacheKey));
    mediaConversions.set(cacheKey, conversion);
    return conversion;
}

function inferLegacyEntries(entries) {
    let changed = false;
    for (const entry of entries) {
        if (entry.source === 'legacy' && entry.target === 'all') {
            entry.source = 'desktop';
            entry.target = 'mobile';
            changed = true;
        }

        if (!entry.storage) {
            if (entry.target === 'desktop') {
                const oldPath = path.join(UPLOAD_DIR, entry.storedName);
                const newPath = path.join(DOWNLOAD_DIR, entry.storedName);
                if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
                entry.storage = 'download';
            } else {
                entry.storage = 'uploads';
            }
            changed = true;
        }

        const originalName = sanitizeOriginalName(entry.originalName || entry.storedName);
        if (entry.storedName !== originalName && !originalName.startsWith('.localsend-files') && !originalName.startsWith('.upload-')) {
            const currentPath = resolveStoredFile(entry);
            const originalPath = path.join(getStorageDirectory(getStorageName(entry)), originalName);
            if (fs.existsSync(currentPath) && !fs.existsSync(originalPath)) {
                fs.renameSync(currentPath, originalPath);
                entry.storedName = originalName;
                changed = true;
            }
        }

        const storedPath = resolveStoredFile(entry);
        if (fs.existsSync(storedPath)) {
            const currentSize = fs.statSync(storedPath).size;
            if (entry.size !== currentSize) {
                entry.size = currentSize;
                changed = true;
            }
        }
    }

    const storageFiles = new Map();
    for (const storage of ['uploads', 'download']) {
        const directory = getStorageDirectory(storage);
        const files = fs.readdirSync(directory, { withFileTypes: true })
            .filter((item) => item.isFile() && !item.name.startsWith('.localsend-files') && !item.name.startsWith('.upload-'));
        storageFiles.set(storage, files);
    }

    const knownFiles = new Set(entries.map((entry) => `${getStorageName(entry)}:${entry.storedName}`));
    for (const [storage, files] of storageFiles) {
        for (const item of files) {
            const storageKey = `${storage}:${item.name}`;
            if (knownFiles.has(storageKey)) continue;
            const stats = fs.statSync(path.join(getStorageDirectory(storage), item.name));
            entries.push({
                id: `manual-${crypto.createHash('sha256').update(storageKey).digest('hex').slice(0, 20)}`,
                storedName: item.name,
                originalName: item.name,
                size: stats.size,
                createdAt: stats.birthtime.toISOString(),
                source: storage === 'uploads' ? 'desktop' : 'mobile',
                target: storage === 'uploads' ? 'mobile' : 'desktop',
                storage
            });
            changed = true;
        }
    }

    const existingFiles = new Set();
    for (const [storage, files] of storageFiles) {
        for (const item of files) existingFiles.add(`${storage}:${item.name}`);
    }
    const cleanedEntries = entries.filter((entry) => existingFiles.has(`${getStorageName(entry)}:${entry.storedName}`));
    if (cleanedEntries.length !== entries.length) changed = true;
    if (changed) writeManifest(cleanedEntries);
    return cleanedEntries;
}

function getFileEntries() {
    return inferLegacyEntries(readManifest());
}

function removeFileEntry(entry) {
    return removeFileEntries([entry]) > 0;
}

function removeFileEntries(entriesToRemove) {
    const entries = getFileEntries();
    const ids = new Set(entriesToRemove.map((entry) => entry.id));
    const currentEntries = entries.filter((entry) => ids.has(entry.id));
    if (currentEntries.length === 0) return 0;

    for (const entry of currentEntries) {
        const filePath = resolveStoredFile(entry);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    writeManifest(entries.filter((entry) => !ids.has(entry.id)));
    return currentEntries.length;
}

function markFileAsDownloaded(entry) {
    const entries = getFileEntries();
    const currentEntry = entries.find((item) => item.id === entry.id);
    if (!currentEntry || currentEntry.downloadedAt) return;
    currentEntry.downloadedAt = new Date().toISOString();
    writeManifest(entries);
}

function publicFile(entry) {
    const media = getMediaInfo(entry.originalName);
    return {
        id: entry.id,
        filename: entry.storedName,
        displayName: entry.originalName,
        size: entry.size,
        createdAt: entry.createdAt,
        downloadedAt: entry.downloadedAt || null,
        mediaKind: media?.kind || null,
        mimeType: media?.mimeType || null,
        source: entry.source,
        target: entry.target
    };
}

function getLocalUrl() {
    const address = normalizeAddress(runtimeHost) || runtimeNetwork?.address || '127.0.0.1';
    return `http://${address}:${runtimePort}`;
}

function createQrSvg(text) {
    const qr = new QRCode(-1, QRErrorCorrectLevel.M);
    qr.addData(text);
    qr.make();

    const quietZone = 4;
    const count = qr.getModuleCount();
    const size = count + quietZone * 2;
    const cells = [];

    for (let row = 0; row < count; row += 1) {
        for (let col = 0; col < count; col += 1) {
            if (qr.isDark(row, col)) {
                cells.push(`M${col + quietZone} ${row + quietZone}h1v1h-1z`);
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Bağlantı QR kodu"><rect width="100%" height="100%" fill="#ffffff"/><path d="${cells.join('')}" fill="#101412"/></svg>`;
}

app.get('/api/health', (req, res) => {
    res.json({ ok: true, sessionActive });
});

app.get('/api/info', requireDesktop, (req, res) => {
    const url = getLocalUrl();
    res.json({
        url,
        pin: currentPin,
        authUrl: `${url}/?pin=${currentPin}`,
        computerName: os.hostname(),
        sessionActive,
        pinExpiresAt: sessionActive ? pinExpiresAt : null
    });
});

app.get('/api/events', requireDesktop, (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
    });
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    storageEventClients.add(res);

    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    heartbeat.unref?.();
    req.on('close', () => {
        clearInterval(heartbeat);
        storageEventClients.delete(res);
    });
});

app.post('/api/pin/rotate', requireDesktop, (req, res) => {
    sessionActive = true;
    renewPin();
    const url = getLocalUrl();
    console.log(`\nYeni bağlantı PIN'i: ${currentPin}`);
    res.json({ pin: currentPin, authUrl: `${url}/?pin=${currentPin}`, sessionActive, pinExpiresAt });
});

app.post('/api/session/disconnect', requireDesktopOrPin, (req, res) => {
    sessionActive = false;
    pairedClientAddress = null;
    pinExpiresAt = null;
    if (pinRotationTimer) clearTimeout(pinRotationTimer);
    pinRotationTimer = null;
    res.json({ success: true, sessionActive, pinExpiresAt });
});

app.post('/api/session/reconnect', requireDesktop, (req, res) => {
    sessionActive = true;
    renewPin();
    const url = getLocalUrl();
    res.json({
        success: true,
        pin: currentPin,
        authUrl: `${url}/?pin=${currentPin}`,
        sessionActive,
        pinExpiresAt
    });
});

app.get('/api/qr', requireDesktop, (req, res) => {
    const authUrl = `${getLocalUrl()}/?pin=${currentPin}`;
    res.type('image/svg+xml').send(createQrSvg(authUrl));
});

app.post('/api/verify', (req, res) => {
    const pin = String(req.body.pin || '');
    if (!sessionActive) {
        return res.status(401).json({ success: false, error: 'Bağlantı bilgisayardan kapatıldı. Yeni QR kodunu okutun.' });
    }
    if (pin !== currentPin) {
        return rejectInvalidPin(req, res, { success: false, error: 'PIN yanlış veya süresi dolmuş.' });
    }
    const clientKey = getClientKey(req);
    failedPinAttempts.delete(clientKey);
    if (!isLocalRequest(req)) {
        if (pairedClientAddress && pairedClientAddress !== clientKey) {
            return res.status(403).json({ success: false, error: 'Bu kodla başka bir telefon zaten bağlandı.' });
        }
        pairedClientAddress = clientKey;
    }
    res.json({ success: true, computerName: os.hostname() });
});

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        const source = req.headers['x-device-role'] === 'desktop' ? 'desktop' : 'mobile';
        req.uploadDirectory = source === 'desktop' ? UPLOAD_DIR : DOWNLOAD_DIR;
        callback(null, req.uploadDirectory);
    },
    filename: (req, file, callback) => {
        const extension = path.extname(sanitizeOriginalName(file.originalname)).slice(0, 16);
        const temporaryName = `.upload-${Date.now()}-${crypto.randomUUID()}${extension}`;
        req.pendingUploadPaths = req.pendingUploadPaths || [];
        req.pendingUploadPaths.push(path.join(req.uploadDirectory, temporaryName));
        callback(null, temporaryName);
    }
});
const upload = multer({ storage });

function trackPendingUploads(req, res, next) {
    req.pendingUploadPaths = [];
    req.uploadCommitted = false;
    const cleanup = () => {
        if (req.uploadCommitted) return;
        for (const filePath of req.pendingUploadPaths) {
            try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (error) {
                setTimeout(() => {
                    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (retryError) { /* hidden temp file stays unlisted */ }
                }, 500);
            }
        }
    };
    req.on('aborted', cleanup);
    res.on('close', () => { if (!res.writableEnded) cleanup(); });
    next();
}

app.post('/api/upload', verifyPin, trackPendingUploads, upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Gönderilecek dosya bulunamadı.' });
    }

    const source = req.headers['x-device-role'] === 'desktop' ? 'desktop' : 'mobile';
    const target = source === 'desktop' ? 'mobile' : 'desktop';
    const storageName = source === 'desktop' ? 'uploads' : 'download';
    const finalizedFiles = new Map();

    for (const file of req.files) {
        const finalName = sanitizeOriginalName(file.originalname);
        const finalPath = path.join(file.destination, finalName);
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        fs.renameSync(file.path, finalPath);
        file.filename = finalName;
        file.path = finalPath;
        finalizedFiles.set(finalName, file);
    }
    req.files = Array.from(finalizedFiles.values());

    // Multer has already placed the current batch on disk. Reading the raw
    // manifest here prevents those new files from being mistaken for legacy
    // files before their metadata is recorded below.
    const finalizedNames = new Set(req.files.map((file) => file.filename));
    const manifest = readManifest().filter((entry) => (
        getStorageName(entry) !== storageName || !finalizedNames.has(entry.storedName)
    ));
    const createdEntries = req.files.map((file) => ({
        id: crypto.randomUUID(),
        storedName: file.filename,
        originalName: sanitizeOriginalName(file.originalname),
        size: file.size,
        createdAt: new Date().toISOString(),
        source,
        target,
        storage: storageName
    }));

    manifest.push(...createdEntries);
    writeManifest(manifest);
    req.uploadCommitted = true;
    res.status(201).json({
        success: true,
        count: createdEntries.length,
        files: createdEntries.map(publicFile)
    });
});

app.get('/api/files', verifyPin, (req, res) => {
    const target = req.query.target;
    const entries = getFileEntries()
        .filter((entry) => !target || entry.target === target || entry.target === 'all')
        .filter((entry) => target !== 'desktop' || !entry.downloadedAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ files: entries.map(publicFile) });
});

app.delete('/api/files', requireDesktop, verifyPin, (req, res) => {
    const target = req.query.target;
    if (!['mobile', 'desktop'].includes(target)) {
        return res.status(400).json({ error: 'Temizlenecek dosya yönü geçersiz.' });
    }
    const entries = getFileEntries().filter((entry) => entry.target === target || (target === 'mobile' && entry.target === 'all'));
    const removedCount = removeFileEntries(entries);
    res.json({ success: true, removedCount });
});

app.delete('/api/files/:id', requireDesktop, verifyPin, (req, res) => {
    const entries = getFileEntries();
    const entry = entries.find((item) => item.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Dosya bulunamadı.' });
    if (!['mobile', 'desktop', 'all'].includes(entry.target)) {
        return res.status(403).json({ error: 'Bu dosya arayüzden silinemez.' });
    }

    try {
        removeFileEntry(entry);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, removed: publicFile(entry) });
});

app.post('/api/files/:id/received', verifyPin, (req, res) => {
    const entry = getFileEntries().find((item) => item.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Dosya bulunamadı.' });
    if (entry.target !== 'mobile' && entry.target !== 'all') {
        return res.status(403).json({ error: 'Yalnızca telefona gönderilen dosyalar teslim alınabilir.' });
    }

    try {
        removeFileEntry(entry);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, received: publicFile(entry) });
});

app.get('/api/media/:id', verifyPin, async (req, res, next) => {
    const entry = getFileEntries().find((item) => item.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Dosya bulunamadı.' });
    const media = getMediaInfo(entry.originalName);
    if (!media) return res.status(415).json({ error: 'Bu dosya Fotoğraflar önizlemesiyle açılamıyor.' });

    const originalPath = resolveStoredFile(entry);
    if (!fs.existsSync(originalPath)) return res.status(404).json({ error: 'Dosya bulunamadı.' });

    let filePath = originalPath;
    let responseType = media.mimeType;
    try {
        if (media.kind === 'video') {
            filePath = await createCompatibleVideo(entry);
            responseType = 'video/mp4';
        }
    } catch (error) {
        return res.status(422).json({ error: error.message });
    }

    res.set({
        'Content-Type': responseType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(entry.originalName)}`,
        'Cache-Control': 'private, max-age=300'
    });
    res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) next(error);
    });
});

app.get('/api/download/:id', verifyPin, (req, res, next) => {
    const entry = getFileEntries().find((item) => item.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Dosya bulunamadı.' });

    const filePath = resolveStoredFile(entry);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Dosya bulunamadı.' });
    }

    res.download(filePath, entry.originalName, (error) => {
        if (error) {
            if (!res.headersSent) return next(error);
            console.error('Dosya aktarımı tamamlanamadı:', error.message);
            return;
        }

        // Bilgisayardan telefona bırakılan dosyalar tek kullanımlıdır.
        // Telefondan gelen dosya diskte kalır, yalnızca alınanlar listesinden düşer.
        if (entry.target === 'mobile') {
            try {
                removeFileEntry(entry);
            } catch (cleanupError) {
                console.error('İndirilen dosya temizlenemedi:', cleanupError.message);
            }
        } else if (entry.target === 'desktop') {
            try {
                markFileAsDownloaded(entry);
            } catch (markError) {
                console.error('İndirilen dosya alınmış olarak işaretlenemedi:', markError.message);
            }
        }
    });
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API işlemi bulunamadı. Sunucuyu yeniden başlatıp tekrar dene.' });
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: `Yükleme hatası: ${error.message}` });
    }
    console.error(error);
    res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' });
});

function startServer(port = DEFAULT_PORT, host = runtimeNetwork?.address || '127.0.0.1', options = {}) {
    runtimeHost = host;
    runtimeNetwork = getNetworkByAddress(host) || runtimeNetwork;
    startStorageWatchers();
    const server = app.listen(port, host, () => {
        runtimePort = server.address().port;
        const url = getLocalUrl();
        const authUrl = `${url}/?pin=${currentPin}`;
        console.log('\nYerel Dosya Transferi hazır');
        console.log(`Telefon adresi: ${url}`);
        console.log(`PIN: ${currentPin}\n`);
        console.log(`Ağ sınırı: ${runtimeNetwork?.cidr || 'yalnızca bu bilgisayar'}`);
        qrcodeTerminal.generate(authUrl, { small: true });
        console.log('\nDurdurmak için Ctrl+C tuşlarına basın.');

        if (options.openBrowser !== false && process.platform === 'win32') {
            exec(`start "" "${url}/desktop.html"`);
        }
    });
    server.on('close', stopStorageWatchers);
    return server;
}

if (require.main === module) {
    const launchNetwork = getPrimaryNetwork();
    const launchHost = process.env.LOCALSEND_HOST || launchNetwork?.address || '127.0.0.1';
    startServer(DEFAULT_PORT, launchHost, {
        openBrowser: process.env.LOCALSEND_NO_OPEN !== '1'
    });
}

module.exports = { app, startServer, getFileEntries };
