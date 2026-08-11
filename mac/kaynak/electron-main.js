const { app, BrowserWindow, dialog, session } = require('electron');
const path = require('path');
const { once } = require('events');
const { prepareStorageLayout } = require('./storage-layout');

let mainWindow = null;
let localServer = null;
let localOrigin = '';

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function configureStorage() {
    const localDropRoot = path.join(app.getPath('documents'), 'LocalDrop');
    const storageRoot = path.join(localDropRoot, 'files');
    const { uploadDirectory, downloadDirectory } = prepareStorageLayout(storageRoot, localDropRoot);
    process.env.LOCALSEND_UPLOAD_DIR = uploadDirectory;
    process.env.LOCALSEND_DOWNLOAD_DIR = downloadDirectory;
    process.env.LOCALSEND_NO_OPEN = '1';
}

function configureBrowserSecurity() {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
}

function createMainWindow(url) {
    localOrigin = new URL(url).origin;
    mainWindow = new BrowserWindow({
        title: 'LocalDrop',
        width: 1440,
        height: 900,
        minWidth: 980,
        minHeight: 680,
        show: false,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', 'localdrop-icon.png'),
        backgroundColor: '#F7F8FA',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
        }
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
        if (new URL(targetUrl).origin !== localOrigin) event.preventDefault();
    });
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadURL(url);
}

async function startApplication() {
    configureStorage();
    configureBrowserSecurity();
    const { startServer } = require('./server');
    localServer = startServer(0, undefined, { openBrowser: false });
    await once(localServer, 'listening');
    const address = localServer.address();
    const url = `http://${address.address}:${address.port}/desktop.html`;
    createMainWindow(url);
}

app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
});

app.whenReady().then(startApplication).catch((error) => {
    dialog.showErrorBox('LocalDrop başlatılamadı', error.message || String(error));
    app.quit();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
    if (localServer?.listening) localServer.close();
});
