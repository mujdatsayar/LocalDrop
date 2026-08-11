const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const messages = require('../public/i18n-core');

test('TR and EN controls are available on desktop, mobile login, and mobile dashboard', () => {
    const desktop = fs.readFileSync(path.join(__dirname, '..', 'public', 'desktop.html'), 'utf8');
    const mobile = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

    assert.equal((desktop.match(/data-language="tr"/g) || []).length, 1);
    assert.equal((desktop.match(/data-language="en"/g) || []).length, 1);
    assert.equal((mobile.match(/data-language="tr"/g) || []).length, 2);
    assert.equal((mobile.match(/data-language="en"/g) || []).length, 2);
    assert.match(desktop, /<script src="i18n-core\.js"><\/script>/);
    assert.match(desktop, /<script src="i18n\.js"><\/script>/);
    assert.match(mobile, /<script src="i18n-core\.js"><\/script>/);
    assert.match(mobile, /<script src="i18n\.js"><\/script>/);
});

test('English translations cover static, dynamic, and accessibility copy', () => {
    assert.equal(messages.translate('Bağlan', 'en'), 'Connect');
    assert.equal(messages.translate('Dosya aktarımı', 'en'), 'File transfer');
    assert.equal(messages.translate('2 dosya', 'en'), '2 files');
    assert.equal(messages.translate('1 dosya', 'en'), '1 file');
    assert.equal(messages.translate('3 dosya telefona gönderiliyor', 'en'), 'Sending 3 files to the phone');
    assert.equal(messages.translate('rapor.pdf dosyasını indir', 'en'), 'Download rapor.pdf');
    assert.equal(messages.translate('  Bağlantı açık  ', 'en'), '  Connection open  ');
    assert.equal(messages.translate('Bağlantı açık', 'tr'), 'Bağlantı açık');
    assert.equal(messages.translate('user-file-name.txt', 'en'), 'user-file-name.txt');
});
