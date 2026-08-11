const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Arch, Platform, build } = require('electron-builder');

const projectRoot = path.resolve(__dirname, '..');
const macRoot = path.resolve(projectRoot, '..');
// Build outside cloud-synced folders. Sync clients may attach Finder metadata
// while electron-builder is signing, which makes macOS reject the bundle.
const buildRoot = path.join(os.tmpdir(), 'localdrop-macos-release');
const outputRoot = path.join(buildRoot, 'output');
const releaseDirectory = path.join(macRoot, 'kurulum');

function assertBuildPath(target) {
    const resolved = path.resolve(target);
    if (resolved !== buildRoot && !resolved.startsWith(`${buildRoot}${path.sep}`)) {
        throw new Error(`Güvenli olmayan derleme yolu reddedildi: ${resolved}`);
    }
    return resolved;
}

function resetBuildDirectory() {
    const resolved = assertBuildPath(buildRoot);
    fs.rmSync(resolved, { recursive: true, force: true });
    fs.mkdirSync(outputRoot, { recursive: true });
}

function createMacIcon() {
    const sourceIcon = path.join(projectRoot, 'assets', 'localdrop-icon.png');
    const iconset = path.join(buildRoot, 'LocalDrop.iconset');
    const result = path.join(buildRoot, 'localdrop-icon.icns');
    const sizes = [
        ['icon_16x16.png', 16],
        ['icon_16x16@2x.png', 32],
        ['icon_32x32.png', 32],
        ['icon_32x32@2x.png', 64],
        ['icon_128x128.png', 128],
        ['icon_128x128@2x.png', 256],
        ['icon_256x256.png', 256],
        ['icon_256x256@2x.png', 512],
        ['icon_512x512.png', 512],
        ['icon_512x512@2x.png', 1024]
    ];

    fs.mkdirSync(iconset, { recursive: true });
    for (const [filename, size] of sizes) {
        execFileSync('sips', ['-z', String(size), String(size), sourceIcon, '--out', path.join(iconset, filename)], {
            stdio: 'ignore'
        });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', result], { stdio: 'inherit' });
    return result;
}

function findArtifact(predicate, description) {
    const pending = [outputRoot];
    while (pending.length) {
        const directory = pending.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const candidate = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (predicate(candidate, entry)) return candidate;
                pending.push(candidate);
            } else if (predicate(candidate, entry)) {
                return candidate;
            }
        }
    }
    throw new Error(`Derleme çıktısı bulunamadı: ${description}`);
}

async function main() {
    if (process.platform !== 'darwin') {
        throw new Error('macOS paketi yalnızca bir Mac üzerinde üretilebilir.');
    }

    const architecture = process.arch === 'arm64'
        ? { electron: Arch.arm64, name: 'arm64' }
        : process.arch === 'x64'
            ? { electron: Arch.x64, name: 'x64' }
            : null;
    if (!architecture) throw new Error(`Desteklenmeyen Mac işlemci mimarisi: ${process.arch}`);

    resetBuildDirectory();
    const macIcon = createMacIcon();
    console.log(`LocalDrop macOS (${architecture.name}) paketleri oluşturuluyor…`);

    await build({
        targets: Platform.MAC.createTarget(['dmg', 'zip'], architecture.electron),
        config: {
            appId: 'com.localdrop.desktop',
            productName: 'LocalDrop',
            asar: true,
            asarUnpack: ['node_modules/ffmpeg-static/**/*'],
            afterPack: async (context) => {
                // Cloud-synced workspaces can attach Finder metadata/resource forks.
                // macOS rejects those attributes during code-signature verification.
                execFileSync('xattr', ['-cr', context.appOutDir], { stdio: 'inherit' });
            },
            directories: {
                output: outputRoot,
                buildResources: path.join(projectRoot, 'assets')
            },
            files: [
                'electron-main.js',
                'server.js',
                'storage-layout.js',
                'package.json',
                'public/**/*',
                'assets/localdrop-icon.png',
                '!files/**/*',
                '!build/**/*',
                '!out/**/*',
                '!test/**/*',
                '!scripts/**/*'
            ],
            mac: {
                icon: macIcon,
                category: 'public.app-category.utilities',
                identity: '-',
                hardenedRuntime: false,
                artifactName: `LocalDrop-mac-${architecture.name}.\${ext}`
            },
            dmg: {
                title: 'LocalDrop Kurulum'
            }
        }
    });

    const appBundle = findArtifact(
        (candidate, entry) => entry.isDirectory() && entry.name === 'LocalDrop.app',
        'LocalDrop.app'
    );
    const dmgArtifact = findArtifact(
        (candidate, entry) => entry.isFile() && entry.name.endsWith('.dmg'),
        '.dmg'
    );
    const zipArtifact = findArtifact(
        (candidate, entry) => entry.isFile() && entry.name.endsWith('.zip'),
        '.zip'
    );

    fs.mkdirSync(releaseDirectory, { recursive: true });
    const releaseApp = path.join(releaseDirectory, 'LocalDrop.app');
    const releaseDmg = path.join(releaseDirectory, `LocalDrop-Setup-mac-${architecture.name}.dmg`);
    const releaseZip = path.join(releaseDirectory, `LocalDrop-Portable-mac-${architecture.name}.zip`);

    fs.rmSync(releaseApp, { recursive: true, force: true });
    // Framework paketleri göreli sembolik bağlantılar kullanır. Node'un varsayılan
    // kopyalama davranışı bu bağlantıları kaynak derleme klasörüne işaret eden
    // mutlak yollara çevirebilir; bu da hem codesign'i hem de son uygulamayı bozar.
    fs.cpSync(appBundle, releaseApp, {
        recursive: true,
        verbatimSymlinks: true
    });
    fs.copyFileSync(dmgArtifact, releaseDmg);
    fs.copyFileSync(zipArtifact, releaseZip);
    execFileSync('xattr', ['-cr', releaseApp], { stdio: 'inherit' });
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', releaseApp], { stdio: 'inherit' });
    fs.rmSync(assertBuildPath(buildRoot), { recursive: true, force: true });

    console.log(`Uygulama: ${releaseApp}`);
    console.log(`Kurulum: ${releaseDmg}`);
    console.log(`Taşınabilir: ${releaseZip}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
