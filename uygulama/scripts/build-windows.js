const fs = require('fs');
const path = require('path');
const { Arch, Platform, build } = require('electron-builder');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const buildRoot = path.join(projectRoot, 'build', 'windows-release');
const releaseDirectory = path.join(workspaceRoot, 'kurulum');
const releaseSetup = path.join(releaseDirectory, 'LocalDrop-Setup.exe');
const releasePortable = path.join(releaseDirectory, 'LocalDrop-Portable-win32-x64.zip');

function assertBuildPath(target) {
    const resolved = path.resolve(target);
    const allowedRoot = path.join(projectRoot, 'build');
    if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
        throw new Error(`Güvenli olmayan derleme yolu reddedildi: ${resolved}`);
    }
    return resolved;
}

function resetBuildDirectory() {
    const resolved = assertBuildPath(buildRoot);
    fs.rmSync(resolved, { recursive: true, force: true });
    fs.mkdirSync(resolved, { recursive: true });
}

function findArtifact(filename) {
    const direct = path.join(buildRoot, filename);
    if (fs.existsSync(direct)) return direct;

    const pending = [buildRoot];
    while (pending.length) {
        const directory = pending.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const candidate = path.join(directory, entry.name);
            if (entry.isDirectory()) pending.push(candidate);
            if (entry.isFile() && entry.name === filename) return candidate;
        }
    }
    throw new Error(`Derleme çıktısı bulunamadı: ${filename}`);
}

async function main() {
    resetBuildDirectory();
    console.log('LocalDrop Windows uygulaması ve seçenekli kurulum sihirbazı oluşturuluyor…');

    await build({
        targets: Platform.WINDOWS.createTarget(['nsis', 'zip'], Arch.x64),
        config: {
            appId: 'com.localdrop.desktop',
            productName: 'LocalDrop',
            asar: true,
            asarUnpack: ['node_modules/ffmpeg-static/**/*'],
            directories: {
                output: buildRoot,
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
            win: {
                icon: path.join(projectRoot, 'assets', 'localdrop-icon.ico'),
                executableName: 'LocalDrop',
                artifactName: 'LocalDrop-Portable-win32-x64.${ext}'
            },
            nsis: {
                oneClick: false,
                allowToChangeInstallationDirectory: true,
                allowElevation: true,
                perMachine: false,
                createDesktopShortcut: false,
                createStartMenuShortcut: true,
                shortcutName: 'LocalDrop',
                runAfterFinish: true,
                installerLanguages: ['tr_TR'],
                language: '1055',
                include: path.join(projectRoot, 'assets', 'installer-options.nsh'),
                installerIcon: path.join(projectRoot, 'assets', 'localdrop-icon.ico'),
                uninstallerIcon: path.join(projectRoot, 'assets', 'localdrop-icon.ico'),
                artifactName: 'LocalDrop-Setup.${ext}'
            }
        }
    });

    fs.mkdirSync(releaseDirectory, { recursive: true });
    fs.copyFileSync(findArtifact('LocalDrop-Setup.exe'), releaseSetup);
    fs.copyFileSync(findArtifact('LocalDrop-Portable-win32-x64.zip'), releasePortable);
    fs.rmSync(assertBuildPath(buildRoot), { recursive: true, force: true });

    console.log(`Kurulum: ${releaseSetup}`);
    console.log(`Taşınabilir: ${releasePortable}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
