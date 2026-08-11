const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');

const temporaryUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localdrop-test-'));
const temporaryDownloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localdrop-download-test-'));
process.env.LOCALSEND_UPLOAD_DIR = temporaryUploadDir;
process.env.LOCALSEND_DOWNLOAD_DIR = temporaryDownloadDir;
process.env.LOCALSEND_NO_OPEN = '1';
process.env.LOCALSEND_NO_WATCH = '1';

const { startServer } = require('../server');

let server;
let baseUrl;
let pin;

test.before(async () => {
    server = startServer(0, '127.0.0.1', { openBrowser: false });
    await once(server, 'listening');
    assert.ok(server.address().port > 0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/info`);
    assert.equal(response.status, 200);
    const info = await response.json();
    pin = info.pin;
    assert.ok(info.pinExpiresAt > Date.now());
    assert.ok(info.pinExpiresAt <= Date.now() + (5 * 60 * 1000));
});

test.after(async () => {
    if (server) {
        server.close();
        await once(server, 'close');
    }
    fs.rmSync(temporaryUploadDir, { recursive: true, force: true });
    fs.rmSync(temporaryDownloadDir, { recursive: true, force: true });
});

test('bilgisayar ve telefon dosyaları doğru gelen kutularına yönlendirilir', async () => {
    const desktopForm = new FormData();
    desktopForm.append('files', new Blob(['telefona giden içerik']), 'telefona-giden.txt');
    const desktopUpload = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'desktop' },
        body: desktopForm
    });
    assert.equal(desktopUpload.status, 201);
    const desktopUploadFile = (await desktopUpload.json()).files[0];
    assert.equal(desktopUploadFile.filename, 'telefona-giden.txt');
    assert.equal(fs.existsSync(path.join(temporaryUploadDir, desktopUploadFile.filename)), true);
    assert.equal(fs.existsSync(path.join(temporaryDownloadDir, desktopUploadFile.filename)), false);

    const mobileForm = new FormData();
    mobileForm.append('files', new Blob(['bilgisayara giden içerik']), 'bilgisayara-giden.txt');
    const mobileUpload = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'mobile' },
        body: mobileForm
    });
    assert.equal(mobileUpload.status, 201);
    const mobileUploadFile = (await mobileUpload.json()).files[0];
    assert.equal(mobileUploadFile.filename, 'bilgisayara-giden.txt');
    assert.equal(fs.existsSync(path.join(temporaryDownloadDir, mobileUploadFile.filename)), true);
    assert.equal(fs.existsSync(path.join(temporaryUploadDir, mobileUploadFile.filename)), false);

    const mobileInboxResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    const mobileInbox = (await mobileInboxResponse.json()).files;
    assert.deepEqual(mobileInbox.map((file) => file.displayName), ['telefona-giden.txt']);

    const desktopInboxResponse = await fetch(`${baseUrl}/api/files?target=desktop`, {
        headers: { 'x-pin': pin }
    });
    const desktopInbox = (await desktopInboxResponse.json()).files;
    assert.deepEqual(desktopInbox.map((file) => file.displayName), ['bilgisayara-giden.txt']);

    const desktopDownload = await fetch(`${baseUrl}/api/download/${encodeURIComponent(desktopInbox[0].id)}?pin=${pin}`);
    assert.equal(desktopDownload.status, 200);
    assert.equal(await desktopDownload.text(), 'bilgisayara giden içerik');
    assert.equal(fs.existsSync(path.join(temporaryDownloadDir, desktopInbox[0].filename)), true);

    const desktopInboxAfterDownload = await fetch(`${baseUrl}/api/files?target=desktop`, {
        headers: { 'x-pin': pin }
    });
    assert.deepEqual((await desktopInboxAfterDownload.json()).files, []);

    const download = await fetch(`${baseUrl}/api/download/${encodeURIComponent(mobileInbox[0].id)}?pin=${pin}`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'telefona giden içerik');

    const inboxAfterRemoval = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    assert.deepEqual((await inboxAfterRemoval.json()).files, []);

    const cancelledForm = new FormData();
    cancelledForm.append('files', new Blob(['vazgeçilen içerik']), 'vazgec.txt');
    await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'desktop' },
        body: cancelledForm
    });
    const cancellableFilesResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    const cancellableFiles = (await cancellableFilesResponse.json()).files;
    const removeFromPhone = await fetch(`${baseUrl}/api/files/${encodeURIComponent(cancellableFiles[0].id)}`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(removeFromPhone.status, 200);

    const removeIncomingFile = await fetch(`${baseUrl}/api/files/${encodeURIComponent(desktopInbox[0].id)}`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(removeIncomingFile.status, 200);
    assert.equal(fs.existsSync(path.join(temporaryDownloadDir, desktopInbox[0].filename)), false);
});

test('yanlış PIN dosya listesine erişemez', async () => {
    const response = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': '000000' }
    });
    assert.equal(response.status, 401);
});

test('geçersiz Host başlığı ve çerçeveleme girişimleri engellenir', async () => {
    const invalidHostStatus = await new Promise((resolve, reject) => {
        const request = http.get({
            hostname: '127.0.0.1',
            port: server.address().port,
            path: '/api/health',
            headers: { Host: 'zararli.example' }
        }, (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode));
        });
        request.on('error', reject);
    });
    assert.equal(invalidHostStatus, 421);

    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('hatalı PIN denemeleri sınırlandırılır, doğru PIN kilitlenmez', async () => {
    const rotateResponse = await fetch(`${baseUrl}/api/pin/rotate`, { method: 'POST' });
    assert.equal(rotateResponse.status, 200);
    pin = (await rotateResponse.json()).pin;

    const statuses = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ pin: '000000' })
        });
        statuses.push(response.status);
    }
    assert.deepEqual(statuses.slice(0, 7), Array(7).fill(401));
    assert.equal(statuses[7], 429);

    const correctResponse = await fetch(`${baseUrl}/api/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin })
    });
    assert.equal(correctResponse.status, 200);
});

test('bulunamayan API işlemleri HTML yerine JSON hatası döndürür', async () => {
    const missingFileResponse = await fetch(`${baseUrl}/api/files/bulunmayan-dosya`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(missingFileResponse.status, 404);
    assert.match(missingFileResponse.headers.get('content-type'), /application\/json/);
    assert.equal((await missingFileResponse.json()).error, 'Dosya bulunamadı.');

    const missingApiResponse = await fetch(`${baseUrl}/api/bilinmeyen-islem`);
    assert.equal(missingApiResponse.status, 404);
    assert.match(missingApiResponse.headers.get('content-type'), /application\/json/);
});

test('telefona bırakılan tüm dosyalar tek işlemde temizlenir', async () => {
    const form = new FormData();
    form.append('files', new Blob(['birinci']), 'birinci.txt');
    form.append('files', new Blob(['ikinci']), 'ikinci.txt');
    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'desktop' },
        body: form
    });
    assert.equal(uploadResponse.status, 201);

    const clearResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(clearResponse.status, 200);
    assert.equal((await clearResponse.json()).removedCount, 2);

    const listResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    assert.deepEqual((await listResponse.json()).files, []);
});

test('telefondan gelen tüm dosyalar tek işlemde bilgisayardan temizlenir', async () => {
    const form = new FormData();
    form.append('files', new Blob(['birinci gelen']), 'birinci-gelen.txt');
    form.append('files', new Blob(['ikinci gelen']), 'ikinci-gelen.txt');
    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'mobile' },
        body: form
    });
    assert.equal(uploadResponse.status, 201);

    const clearResponse = await fetch(`${baseUrl}/api/files?target=desktop`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(clearResponse.status, 200);
    assert.equal((await clearResponse.json()).removedCount, 2);

    const listResponse = await fetch(`${baseUrl}/api/files?target=desktop`, {
        headers: { 'x-pin': pin }
    });
    assert.deepEqual((await listResponse.json()).files, []);
    assert.equal(fs.existsSync(path.join(temporaryDownloadDir, 'birinci-gelen.txt')), false);
    assert.equal(fs.existsSync(path.join(temporaryDownloadDir, 'ikinci-gelen.txt')), false);
});

test('uploads klasöründen elle silinen dosya arayüz listesinden uzlaştırılır', async () => {
    const form = new FormData();
    form.append('files', new Blob(['elle silinecek']), 'elle-silinecek.txt');
    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'desktop' },
        body: form
    });
    assert.equal(uploadResponse.status, 201);
    const uploadedFile = (await uploadResponse.json()).files[0];

    fs.unlinkSync(path.join(temporaryUploadDir, uploadedFile.filename));
    const listResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    assert.deepEqual((await listResponse.json()).files, []);
});

test('uploads klasörüne elle eklenen dosya yalnızca telefona gidenlerde görünür', async () => {
    fs.writeFileSync(path.join(temporaryUploadDir, 'filter.png'), 'png');

    const mobileResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    const mobileFiles = (await mobileResponse.json()).files;
    const manualFile = mobileFiles.find((file) => file.displayName === 'filter.png');
    assert.ok(manualFile);

    const desktopResponse = await fetch(`${baseUrl}/api/files?target=desktop`, {
        headers: { 'x-pin': pin }
    });
    const desktopFiles = (await desktopResponse.json()).files;
    assert.equal(desktopFiles.some((file) => file.displayName === 'filter.png'), false);

    const cleanupResponse = await fetch(`${baseUrl}/api/files/${encodeURIComponent(manualFile.id)}`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(cleanupResponse.status, 200);
});

test('klasör değişiklikleri masaüstüne canlı bildirilir', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const firstMessage = await response.body.getReader().read();
    assert.match(Buffer.from(firstMessage.value).toString('utf8'), /event: ready/);
    controller.abort();
});

test('yüklenen dosyanın özgün adı diskte korunur ve aynı ad yenisiyle güncellenir', async () => {
    for (const content of ['eski', 'yeni']) {
        const form = new FormData();
        form.append('files', new Blob([content]), 'ABC.png');
        const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
            method: 'POST',
            headers: { 'x-pin': pin, 'x-device-role': 'desktop' },
            body: form
        });
        assert.equal(uploadResponse.status, 201);
        assert.equal((await uploadResponse.json()).files[0].filename, 'ABC.png');
    }

    assert.equal(fs.readFileSync(path.join(temporaryUploadDir, 'ABC.png'), 'utf8'), 'yeni');
    const listResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': pin }
    });
    const matchingFiles = (await listResponse.json()).files.filter((file) => file.displayName === 'ABC.png');
    assert.equal(matchingFiles.length, 1);

    const cleanupResponse = await fetch(`${baseUrl}/api/files/${encodeURIComponent(matchingFiles[0].id)}`, {
        method: 'DELETE',
        headers: { 'x-pin': pin }
    });
    assert.equal(cleanupResponse.status, 200);
});

test('fotoğraf ve videolar iPhone paylaşımı için satır içinde açılır', async () => {
    const form = new FormData();
    form.append('files', new Blob(['png-content'], { type: 'image/png' }), 'Galeri.png');
    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'x-pin': pin, 'x-device-role': 'desktop' },
        body: form
    });
    assert.equal(uploadResponse.status, 201);
    const mediaFile = (await uploadResponse.json()).files[0];
    assert.equal(mediaFile.mediaKind, 'image');
    assert.equal(mediaFile.mimeType, 'image/png');

    const mediaResponse = await fetch(`${baseUrl}/api/media/${encodeURIComponent(mediaFile.id)}?pin=${pin}`);
    assert.equal(mediaResponse.status, 200);
    assert.match(mediaResponse.headers.get('content-type'), /image\/png/);
    assert.match(mediaResponse.headers.get('content-disposition'), /^inline/);
    assert.equal(await mediaResponse.text(), 'png-content');

    const stillPending = await fetch(`${baseUrl}/api/files?target=mobile`, { headers: { 'x-pin': pin } });
    assert.equal((await stillPending.json()).files.some((file) => file.id === mediaFile.id), true);

    const receivedResponse = await fetch(`${baseUrl}/api/files/${encodeURIComponent(mediaFile.id)}/received`, {
        method: 'POST',
        headers: { 'x-pin': pin }
    });
    assert.equal(receivedResponse.status, 200);
    assert.equal(fs.existsSync(path.join(temporaryUploadDir, mediaFile.filename)), false);
});

test('sunucu bağlantısı kesilir ve yeni kodla yeniden açılır', async () => {
    const oldPin = pin;
    const disconnectResponse = await fetch(`${baseUrl}/api/session/disconnect`, {
        method: 'POST',
        headers: { 'x-pin': pin }
    });
    assert.equal(disconnectResponse.status, 200);
    assert.equal((await disconnectResponse.json()).sessionActive, false);

    const healthWhileDisconnected = await fetch(`${baseUrl}/api/health`);
    assert.equal((await healthWhileDisconnected.json()).sessionActive, false);

    const verifyWhileDisconnected = await fetch(`${baseUrl}/api/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: oldPin })
    });
    assert.equal(verifyWhileDisconnected.status, 401);

    const reconnectResponse = await fetch(`${baseUrl}/api/session/reconnect`, { method: 'POST' });
    assert.equal(reconnectResponse.status, 200);
    const reconnected = await reconnectResponse.json();
    assert.equal(reconnected.sessionActive, true);
    assert.notEqual(reconnected.pin, oldPin);
    pin = reconnected.pin;
});

test('telefon ve bilgisayar arayüzleri yerel font ve QR ile dış CDN olmadan sunulur', async () => {
    const [mobileResponse, desktopResponse, cssResponse, fontResponse, qrResponse] = await Promise.all([
        fetch(`${baseUrl}/`),
        fetch(`${baseUrl}/desktop.html`),
        fetch(`${baseUrl}/style.css`),
        fetch(`${baseUrl}/fonts/InterVariable.woff2`),
        fetch(`${baseUrl}/api/qr`)
    ]);
    assert.equal(mobileResponse.status, 200);
    assert.equal(desktopResponse.status, 200);
    assert.equal(cssResponse.status, 200);
    assert.equal(fontResponse.status, 200);
    assert.equal(qrResponse.status, 200);

    const mobileHtml = await mobileResponse.text();
    const desktopHtml = await desktopResponse.text();
    assert.match(mobileHtml, /Bilgisayara gönderdiklerin/);
    assert.match(mobileHtml, /Fotoğraflar’a aktar/);
    assert.match(mobileHtml, /id="mediaViewer"/);
    assert.match(mobileHtml, /Paylaş \/ Fotoğraflar’a Kaydet/);
    assert.match(mobileHtml, /Dosyalara indir/);
    assert.match(desktopHtml, /id="connectSidebar"/);
    assert.match(desktopHtml, /id="disconnectedState"/);
    assert.match(desktopHtml, /Telefona gönderilecekler/);
    assert.match(desktopHtml, /id="clearOutboxBtn"/);
    assert.match(desktopHtml, /id="clearInboxBtn"/);
    assert.doesNotMatch(desktopHtml, /QR kodunu göster/);
    assert.doesNotMatch(desktopHtml, /Telefona bıraktıkların/);
    assert.doesNotMatch(mobileHtml, /(cdnjs|fonts\.googleapis|fonts\.gstatic)/i);
    assert.doesNotMatch(desktopHtml, /(cdnjs|fonts\.googleapis|fonts\.gstatic)/i);
    assert.ok((await fontResponse.arrayBuffer()).byteLength > 300000);
    assert.match(await qrResponse.text(), /^<svg/);
});

test('PIN yenileme eski telefon oturumunu kapatır', async () => {
    const oldPin = pin;
    const rotateResponse = await fetch(`${baseUrl}/api/pin/rotate`, { method: 'POST' });
    assert.equal(rotateResponse.status, 200);
    pin = (await rotateResponse.json()).pin;
    assert.notEqual(pin, oldPin);

    const oldSessionResponse = await fetch(`${baseUrl}/api/files?target=mobile`, {
        headers: { 'x-pin': oldPin }
    });
    assert.equal(oldSessionResponse.status, 401);
});
