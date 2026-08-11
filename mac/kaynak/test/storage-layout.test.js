const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { prepareStorageLayout } = require('../storage-layout');

test('eski upload ve download klasörleri files altında kayıpsız birleştirilir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localdrop-storage-test-'));
    const storageRoot = path.join(root, 'files');

    try {
        fs.mkdirSync(path.join(root, 'uploads'));
        fs.mkdirSync(path.join(root, 'download'));
        fs.writeFileSync(path.join(root, 'uploads', 'telefona.txt'), 'telefon');
        fs.writeFileSync(path.join(root, 'download', 'bilgisayara.txt'), 'bilgisayar');

        const layout = prepareStorageLayout(storageRoot, root);

        assert.equal(layout.uploadDirectory, path.join(storageRoot, 'uploads'));
        assert.equal(layout.downloadDirectory, path.join(storageRoot, 'download'));
        assert.equal(fs.readFileSync(path.join(layout.uploadDirectory, 'telefona.txt'), 'utf8'), 'telefon');
        assert.equal(fs.readFileSync(path.join(layout.downloadDirectory, 'bilgisayara.txt'), 'utf8'), 'bilgisayar');
        assert.equal(fs.existsSync(path.join(root, 'uploads')), false);
        assert.equal(fs.existsSync(path.join(root, 'download')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
