const fs = require('fs');
const path = require('path');

function moveEntry(source, target) {
    try {
        fs.renameSync(source, target);
    } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        fs.cpSync(source, target, { recursive: true });
        fs.rmSync(source, { recursive: true, force: true });
    }
}

function uniqueLegacyPath(target) {
    const parsed = path.parse(target);
    let suffix = 1;
    let candidate;
    do {
        candidate = path.join(parsed.dir, `${parsed.name}-eski-${suffix}${parsed.ext}`);
        suffix += 1;
    } while (fs.existsSync(candidate));
    return candidate;
}

function migrateDirectoryContents(legacyDirectory, targetDirectory) {
    if (!legacyDirectory || !fs.existsSync(legacyDirectory)) return;
    if (path.resolve(legacyDirectory) === path.resolve(targetDirectory)) return;

    fs.mkdirSync(targetDirectory, { recursive: true });
    for (const entry of fs.readdirSync(legacyDirectory, { withFileTypes: true })) {
        const source = path.join(legacyDirectory, entry.name);
        const target = path.join(targetDirectory, entry.name);

        if (!fs.existsSync(target)) {
            moveEntry(source, target);
            continue;
        }

        if (entry.isDirectory() && fs.statSync(target).isDirectory()) {
            migrateDirectoryContents(source, target);
            continue;
        }

        moveEntry(source, uniqueLegacyPath(target));
    }

    try { fs.rmdirSync(legacyDirectory); } catch (error) {
        if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
    }
}

function prepareStorageLayout(storageRoot, legacyRoot) {
    const uploadDirectory = path.join(storageRoot, 'uploads');
    const downloadDirectory = path.join(storageRoot, 'download');

    if (legacyRoot) {
        migrateDirectoryContents(path.join(legacyRoot, 'uploads'), uploadDirectory);
        migrateDirectoryContents(path.join(legacyRoot, 'download'), downloadDirectory);
    }

    fs.mkdirSync(uploadDirectory, { recursive: true });
    fs.mkdirSync(downloadDirectory, { recursive: true });
    return { storageRoot, uploadDirectory, downloadDirectory };
}

module.exports = { prepareStorageLayout };
