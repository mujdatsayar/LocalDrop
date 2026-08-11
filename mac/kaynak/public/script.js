document.addEventListener('DOMContentLoaded', () => {
    const dom = {
        loginScreen: document.getElementById('loginScreen'),
        dashboardScreen: document.getElementById('dashboardScreen'),
        loginForm: document.getElementById('loginForm'),
        pinInput: document.getElementById('pinInput'),
        loginError: document.getElementById('loginError'),
        loginBtn: document.getElementById('loginBtn'),
        loginBtnText: document.getElementById('loginBtnText'),
        logoutBtn: document.getElementById('logoutBtn'),
        connectedDevice: document.getElementById('connectedDevice'),
        sendTargetName: document.getElementById('sendTargetName'),
        tabs: Array.from(document.querySelectorAll('.tabs__item')),
        sendPanel: document.getElementById('sendPanel'),
        receivePanel: document.getElementById('receivePanel'),
        fileCount: document.getElementById('mobileFileCount'),
        dropZone: document.getElementById('dropZone'),
        fileInput: document.getElementById('fileInput'),
        progress: document.getElementById('uploadProgress'),
        progressTitle: document.getElementById('progressTitle'),
        progressDetail: document.getElementById('progressDetail'),
        progressText: document.getElementById('progressText'),
        progressFill: document.getElementById('progressFill'),
        cancelUploadBtn: document.getElementById('cancelUploadBtn'),
        uploadSummary: document.getElementById('uploadSummary'),
        sentQueue: document.getElementById('sentQueue'),
        sentFileCount: document.getElementById('sentFileCount'),
        sentFileList: document.getElementById('sentFileList'),
        fileList: document.getElementById('fileList'),
        refreshBtn: document.getElementById('refreshBtn'),
        mediaViewer: document.getElementById('mediaViewer'),
        mediaViewerTitle: document.getElementById('mediaViewerTitle'),
        mediaViewerKind: document.getElementById('mediaViewerKind'),
        mediaViewerStage: document.getElementById('mediaViewerStage'),
        mediaViewerStatus: document.getElementById('mediaViewerStatus'),
        closeMediaViewerBtn: document.getElementById('closeMediaViewerBtn'),
        mediaShareBtn: document.getElementById('mediaShareBtn'),
        mediaShareText: document.getElementById('mediaShareText'),
        mediaDownloadBtn: document.getElementById('mediaDownloadBtn'),
        toast: document.getElementById('toast'),
        toastIcon: document.getElementById('toastIcon'),
        toastMessage: document.getElementById('toastMessage'),
        brand: document.querySelector('.mobile-topbar .brand')
    };

    const state = {
        phase: 'login',
        pinInput: '',
        pin: localStorage.getItem('localdrop_pin') || '',
        loginError: '',
        deviceName: 'Bilgisayar',
        activeTab: localStorage.getItem('localdrop_tab') === 'receivePanel' ? 'receivePanel' : 'sendPanel',
        files: { status: 'loading', items: [], error: '' },
        sentFiles: { status: 'loading', items: [], error: '' },
        upload: { status: 'idle', xhr: null, count: 0, percent: 0, loaded: 0, total: 0, message: '' },
        downloading: new Set(),
        sharing: new Set(),
        mediaViewerFile: null,
        preparedMediaFile: null,
        mediaPreparing: false,
        mediaError: '',
        dragActive: false,
        refreshing: false,
        disconnecting: false,
        fileSignature: '',
        toast: { open: false, message: '', type: 'success', timer: null },
        pollTimer: null
    };

    function render() {
        const connected = state.phase === 'ready';
        dom.loginScreen.classList.toggle('active', !connected);
        dom.dashboardScreen.classList.toggle('active', connected);
        dom.pinInput.value = state.pinInput;
        dom.pinInput.disabled = state.phase === 'verifying';
        dom.pinInput.setAttribute('aria-invalid', String(Boolean(state.loginError)));
        dom.loginBtn.disabled = state.phase === 'verifying';
        dom.loginBtnText.textContent = state.phase === 'verifying' ? 'Bağlanıyor…' : 'Bağlan';
        dom.loginError.textContent = state.loginError;
        dom.logoutBtn.disabled = state.disconnecting;
        dom.logoutBtn.textContent = state.disconnecting ? 'Kesiliyor…' : 'Bağlantıyı kes';

        dom.connectedDevice.textContent = state.deviceName;
        dom.sendTargetName.textContent = state.deviceName;
        dom.tabs.forEach((tab) => {
            const selected = tab.dataset.tab === state.activeTab;
            tab.classList.toggle('is-active', selected);
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });
        dom.sendPanel.classList.toggle('hidden', state.activeTab !== 'sendPanel');
        dom.receivePanel.classList.toggle('hidden', state.activeTab !== 'receivePanel');
        dom.fileCount.textContent = formatCount(state.files.items.length);
        dom.fileCount.classList.toggle('hidden', state.files.items.length === 0);

        const uploading = state.upload.status === 'uploading';
        dom.dropZone.classList.toggle('is-dragging', state.dragActive);
        dom.dropZone.classList.toggle('is-disabled', uploading);
        dom.fileInput.disabled = uploading;
        dom.progress.classList.toggle('hidden', !uploading);
        dom.uploadSummary.classList.toggle('hidden', !['success', 'error', 'cancelled'].includes(state.upload.status));
        dom.uploadSummary.classList.toggle('inline-feedback--success', state.upload.status === 'success');
        dom.uploadSummary.classList.toggle('inline-feedback--danger', ['error', 'cancelled'].includes(state.upload.status));
        dom.uploadSummary.textContent = state.upload.message;
        dom.progressTitle.textContent = state.upload.count > 1 ? `${formatCount(state.upload.count)} dosya bilgisayara gönderiliyor` : 'Dosya bilgisayara gönderiliyor';
        dom.progressDetail.textContent = state.upload.total ? `${formatBytes(state.upload.loaded)} / ${formatBytes(state.upload.total)}` : 'Hazırlanıyor…';
        dom.progressText.textContent = `${state.upload.percent}%`;
        dom.progressFill.style.width = `${state.upload.percent}%`;
        dom.cancelUploadBtn.disabled = !uploading;

        dom.sentQueue.classList.toggle('hidden', state.sentFiles.items.length === 0);
        dom.sentFileCount.textContent = `${formatCount(state.sentFiles.items.length)} dosya`;
        renderSentFiles();
        renderFiles();
        dom.refreshBtn.classList.toggle('is-refreshing', state.refreshing);
        dom.refreshBtn.disabled = state.refreshing;
        renderMediaViewer();

        dom.toast.classList.toggle('is-open', state.toast.open);
        dom.toast.classList.toggle('is-error', state.toast.type === 'error');
        dom.toastIcon.classList.toggle('hidden', state.toast.type === 'error');
        dom.toastMessage.textContent = state.toast.message;
    }

    function renderMediaViewer() {
        const file = state.mediaViewerFile;
        const open = Boolean(file);
        dom.mediaViewer.classList.toggle('is-open', open);
        dom.mediaViewer.setAttribute('aria-hidden', String(!open));
        document.body.classList.toggle('media-viewer-open', open);
        if (!open) return;

        const shareAvailable = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
        dom.mediaViewerTitle.textContent = file.displayName;
        dom.mediaViewerKind.textContent = file.mediaKind === 'video' ? 'Video' : 'Görsel';
        dom.mediaDownloadBtn.href = `/api/download/${encodeURIComponent(file.id)}?pin=${encodeURIComponent(state.pin)}`;
        dom.mediaDownloadBtn.download = file.displayName;
        dom.mediaShareBtn.disabled = state.mediaPreparing || state.sharing.has(file.id);
        dom.mediaShareText.textContent = state.mediaPreparing
            ? 'Paylaşım hazırlanıyor…'
            : shareAvailable && state.preparedMediaFile
                ? 'Paylaş / Fotoğraflar’a Kaydet'
                : 'Native görüntüleyicide aç';
        dom.mediaViewerStatus.textContent = state.mediaError || (state.mediaPreparing
            ? 'Medya iPhone uyumlu biçimde hazırlanıyor. Büyük videolarda bu işlem biraz sürebilir.'
            : shareAvailable && state.preparedMediaFile
                ? 'Hazır. Açılan iPhone menüsünden “Görüntüyü Kaydet” veya “Videoyu Kaydet” seçeneğini kullan.'
                : 'Chrome bu HTTP bağlantısında galeriye doğrudan yazamaz. Native görüntüleyiciyi açıp sistem paylaşım menüsünü kullan.');

        if (dom.mediaViewerStage.dataset.fileId === file.id) return;
        dom.mediaViewerStage.dataset.fileId = file.id;
        const loading = document.createElement('div');
        loading.className = 'media-viewer__loading';
        loading.append(createIcon('refresh'));
        const loadingText = document.createElement('span');
        loadingText.textContent = file.mediaKind === 'video' ? 'Video player hazırlanıyor…' : 'Görsel yükleniyor…';
        loading.append(loadingText);

        const media = document.createElement(file.mediaKind === 'video' ? 'video' : 'img');
        media.className = 'hidden';
        media.src = getMediaUrl(file);
        if (file.mediaKind === 'video') {
            media.controls = true;
            media.playsInline = true;
            media.preload = 'metadata';
        } else {
            media.alt = file.displayName;
        }
        const readyEvent = file.mediaKind === 'video' ? 'loadedmetadata' : 'load';
        media.addEventListener(readyEvent, () => {
            loading.remove();
            media.classList.remove('hidden');
        }, { once: true });
        media.addEventListener('error', () => {
            loadingText.textContent = 'Medya oynatılamadı. Dosyalara indirerek açmayı deneyebilirsin.';
            state.mediaError = 'Bu medya tarayıcıda açılamadı. İndirme seçeneği hâlâ kullanılabilir.';
            dom.mediaViewerStatus.textContent = state.mediaError;
        }, { once: true });
        dom.mediaViewerStage.replaceChildren(loading, media);
    }

    function renderFiles() {
        const fragment = document.createDocumentFragment();
        if (state.files.status === 'loading') {
            fragment.append(createFileSkeleton(), createFileSkeleton());
        } else if (state.files.status === 'error') {
            fragment.append(createErrorState('Dosyalar alınamadı', state.files.error));
        } else if (state.files.items.length === 0) {
            fragment.append(createEmptyState());
        } else {
            state.files.items.forEach((file, index) => fragment.append(createFileRow(file, index)));
        }
        dom.fileList.replaceChildren(fragment);
    }

    function renderSentFiles() {
        const signature = JSON.stringify(state.sentFiles.items.map((file) => [file.id, file.displayName, file.size, file.createdAt]));
        if (dom.sentFileList.dataset.renderSignature === signature) return;
        dom.sentFileList.dataset.renderSignature = signature;
        const fragment = document.createDocumentFragment();
        state.sentFiles.items.forEach((file, index) => fragment.append(createSentFileRow(file, index)));
        dom.sentFileList.replaceChildren(fragment);
    }

    function createSentFileRow(file, index) {
        const row = document.createElement('article');
        row.className = 'file-item';
        row.style.animationDelay = `${Math.min(index, 5) * 30}ms`;

        const type = document.createElement('span');
        type.className = 'file-type';
        type.textContent = getFileType(file.displayName);

        const copy = document.createElement('div');
        copy.className = 'file-copy';
        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = file.displayName;
        name.title = file.displayName;
        const meta = document.createElement('div');
        meta.className = 'file-meta';
        meta.textContent = `${formatBytes(file.size)} · ${formatRelativeTime(file.createdAt)}`;
        meta.title = formatFullDate(file.createdAt);
        copy.append(name, meta);

        const status = document.createElement('span');
        status.className = 'file-status';
        status.setAttribute('aria-label', 'Bilgisayara ulaştı');
        status.title = 'Bilgisayara ulaştı';
        status.append(createIcon('check'));

        row.append(type, copy, status);
        return row;
    }

    function createFileRow(file, index) {
        const row = document.createElement('article');
        row.className = 'file-item';
        row.style.animationDelay = `${Math.min(index, 5) * 30}ms`;
        if (file.mediaKind) {
            row.classList.add('file-item--media');
            row.dataset.action = 'open-media';
            row.dataset.id = file.id;
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            row.setAttribute('aria-label', `${file.displayName} önizlemesini aç`);
        }

        const type = document.createElement('span');
        type.className = 'file-type';
        type.textContent = getFileType(file.displayName);

        const copy = document.createElement('div');
        copy.className = 'file-copy';
        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = file.displayName;
        name.title = file.displayName;
        const meta = document.createElement('div');
        meta.className = 'file-meta';
        meta.textContent = `${formatBytes(file.size)} · ${formatRelativeTime(file.createdAt)}${file.mediaKind ? ' · Önizlemek için dokun' : ''}`;
        meta.title = formatFullDate(file.createdAt);
        copy.append(name, meta);

        const actions = document.createElement('div');
        actions.className = 'file-actions';
        const download = document.createElement('a');
        download.className = 'file-action file-action--download';
        download.classList.toggle('is-downloading', state.downloading.has(file.id));
        download.href = `/api/download/${encodeURIComponent(file.id)}?pin=${encodeURIComponent(state.pin)}`;
        download.download = file.displayName;
        download.dataset.action = 'download-file';
        download.dataset.id = file.id;
        download.setAttribute('aria-label', `${file.displayName} dosyasını indir`);
        download.setAttribute('aria-disabled', String(state.downloading.has(file.id)));
        download.title = state.downloading.has(file.id) ? 'İndiriliyor' : 'Telefona indir';
        download.append(createIcon(state.downloading.has(file.id) ? 'refresh' : 'download'));
        actions.append(download);

        row.append(type, copy, actions);
        return row;
    }

    function createEmptyState() {
        const wrapper = document.createElement('div');
        wrapper.className = 'empty';
        const icon = document.createElement('span');
        icon.className = 'empty__icon';
        icon.append(createIcon('file'));
        const title = document.createElement('h3');
        title.className = 'empty__title';
        title.textContent = 'Henüz dosya bırakılmadı';
        const copy = document.createElement('p');
        copy.className = 'empty__text';
        copy.textContent = 'Bilgisayardan gönderilen dosyalar burada görünür. İndirdiğinde otomatik kaldırılır.';
        const actions = document.createElement('div');
        actions.className = 'empty__actions';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn--secondary btn--sm';
        retry.dataset.action = 'retry-files';
        retry.textContent = 'Yenile';
        actions.append(retry);
        wrapper.append(icon, title, copy, actions);
        return wrapper;
    }

    function createErrorState(titleText, detailText) {
        const wrapper = document.createElement('div');
        wrapper.className = 'error-state';
        const icon = document.createElement('span');
        icon.className = 'error-state__icon';
        icon.append(createIcon('alert'));
        const title = document.createElement('h3');
        title.className = 'error-state__title';
        title.textContent = titleText;
        const copy = document.createElement('p');
        copy.className = 'error-state__text';
        copy.textContent = detailText || 'Wi-Fi bağlantını kontrol edip yeniden dene.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn--secondary btn--sm';
        retry.dataset.action = 'retry-files';
        retry.textContent = 'Tekrar dene';
        wrapper.append(icon, title, copy, retry);
        return wrapper;
    }

    function createFileSkeleton() {
        const row = document.createElement('div');
        row.className = 'file-skeleton';
        ['skel skel--file-icon', 'skel skel--text skel--wide', 'skel skel--action'].forEach((className) => {
            const item = document.createElement('span');
            item.className = className;
            row.append(item);
        });
        return row;
    }

    function createIcon(name) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const paths = {
            download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
            share: ['M12 16V4', 'M7 9l5-5 5 5', 'M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4'],
            check: ['m5 12 4 4L19 6'],
            refresh: ['M20 7h-5V2', 'M5.1 9a8 8 0 0 1 13.2-3L20 7'],
            file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
            alert: ['M12 9v4', 'M12 17h.01', 'M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z']
        };
        (paths[name] || paths.file).forEach((value) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', value);
            svg.append(path);
        });
        return svg;
    }

    function showToast(message, type = 'success') {
        clearTimeout(state.toast.timer);
        state.toast = { open: true, message, type, timer: null };
        render();
        state.toast.timer = setTimeout(() => {
            state.toast.open = false;
            render();
        }, 5000);
    }

    function switchTab(tabId, focus = false) {
        state.activeTab = tabId;
        localStorage.setItem('localdrop_tab', tabId);
        render();
        if (tabId === 'receivePanel') loadFiles(false);
        if (focus) dom.tabs.find((tab) => tab.dataset.tab === tabId)?.focus();
    }

    async function verifyPin(pin, silent = false) {
        state.phase = 'verifying';
        state.loginError = '';
        render();
        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Bağlantı kodu doğrulanamadı.');
            state.pin = pin;
            state.deviceName = data.computerName || 'Bilgisayar';
            state.phase = 'ready';
            localStorage.setItem('localdrop_pin', pin);
            render();
            await Promise.all([loadFiles(true), loadSentFiles(true)]);
            startPolling();
            if (!silent) showToast(`${state.deviceName} ile bağlantı kuruldu.`);
        } catch (error) {
            state.phase = 'login';
            state.pin = '';
            state.loginError = error.message || 'Bağlantı kurulamadı. Aynı Wi-Fi ağında olduğunu kontrol et.';
            localStorage.removeItem('localdrop_pin');
            render();
            requestAnimationFrame(() => {
                dom.pinInput.focus();
                dom.pinInput.select();
            });
        }
    }

    function endSession(expired = false) {
        clearInterval(state.pollTimer);
        localStorage.removeItem('localdrop_pin');
        state.phase = 'login';
        state.pin = '';
        state.pinInput = '';
        state.disconnecting = false;
        state.loginError = expired ? 'Bağlantı kodu yenilendi. Bilgisayardaki yeni kodu gir.' : '';
        state.files = { status: 'loading', items: [], error: '' };
        state.sentFiles = { status: 'loading', items: [], error: '' };
        closeMediaViewer(false);
        render();
    }

    async function disconnectFromServer() {
        if (!state.pin || state.disconnecting) return;
        state.disconnecting = true;
        render();
        try {
            const response = await fetch('/api/session/disconnect', {
                method: 'POST',
                headers: { 'x-pin': state.pin }
            });
            const data = safeJson(await response.text());
            if (!response.ok) throw new Error(data.error || 'Bağlantı kesilemedi.');
            endSession(false);
        } catch (error) {
            state.disconnecting = false;
            showToast(error.message, 'error');
            render();
        }
    }

    async function loadFiles(showLoading) {
        if (!state.pin) return;
        if (showLoading) state.files.status = 'loading';
        render();
        try {
            const response = await fetch('/api/files?target=mobile', { headers: { 'x-pin': state.pin } });
            if (response.status === 401) return endSession(true);
            if (!response.ok) throw new Error('Bilgisayara ulaşılamadı.');
            const data = await response.json();
            const signature = data.files.map((file) => file.id).join('|');
            if (state.fileSignature && signature !== state.fileSignature && data.files.length > state.files.items.length) {
                showToast('Bilgisayardan yeni dosya geldi.');
            }
            state.fileSignature = signature;
            state.files = { status: 'ready', items: data.files, error: '' };
            Array.from(state.downloading).forEach((id) => {
                if (!data.files.some((item) => item.id === id)) state.downloading.delete(id);
            });
        } catch (error) {
            state.files = { ...state.files, status: 'error', error: error.message };
        }
        render();
    }

    async function loadSentFiles(showLoading) {
        if (!state.pin) return;
        if (showLoading) state.sentFiles.status = 'loading';
        try {
            const response = await fetch('/api/files?target=desktop', { headers: { 'x-pin': state.pin } });
            if (response.status === 401) return endSession(true);
            if (!response.ok) throw new Error('Gönderilen dosyalar alınamadı.');
            const data = await response.json();
            state.sentFiles = { status: 'ready', items: data.files, error: '' };
        } catch (error) {
            state.sentFiles = { ...state.sentFiles, status: 'error', error: error.message };
        }
        render();
    }

    function getMediaUrl(file) {
        return `/api/media/${encodeURIComponent(file.id)}?pin=${encodeURIComponent(state.pin)}`;
    }

    function openMediaViewer(file) {
        if (!file?.mediaKind) return;
        state.mediaViewerFile = file;
        state.preparedMediaFile = null;
        state.mediaPreparing = false;
        state.mediaError = '';
        render();
        requestAnimationFrame(() => dom.closeMediaViewerBtn.focus());
        if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
            prepareMediaForShare(file);
        }
    }

    function closeMediaViewer(restoreFocus = true) {
        const closingFile = state.mediaViewerFile;
        const media = dom.mediaViewerStage.querySelector('video, img');
        if (media?.tagName === 'VIDEO') media.pause();
        if (media) {
            media.removeAttribute('src');
            media.load?.();
        }
        dom.mediaViewerStage.replaceChildren();
        delete dom.mediaViewerStage.dataset.fileId;
        state.mediaViewerFile = null;
        state.preparedMediaFile = null;
        state.mediaPreparing = false;
        state.mediaError = '';
        render();
        if (restoreFocus && closingFile) {
            document.querySelector(`[data-action="open-media"][data-id="${CSS.escape(closingFile.id)}"]`)?.focus();
        }
    }

    function getSharedFileName(file, mimeType) {
        if (mimeType === 'video/mp4' && /\.(mov|m4v)$/i.test(file.displayName)) {
            return file.displayName.replace(/\.(mov|m4v)$/i, '.mp4');
        }
        return file.displayName;
    }

    async function prepareMediaForShare(file) {
        if (!file || state.mediaPreparing || state.preparedMediaFile) return;
        state.mediaPreparing = true;
        state.mediaError = '';
        render();
        try {
            const response = await fetch(getMediaUrl(file));
            if (response.status === 401) return endSession(true);
            if (!response.ok) {
                const data = safeJson(await response.text());
                throw new Error(data.error || 'Medya paylaşım için hazırlanamadı.');
            }
            const blob = await response.blob();
            const mimeType = blob.type || file.mimeType || 'application/octet-stream';
            const sharedFile = new File([blob], getSharedFileName(file, mimeType), { type: mimeType });
            if (!navigator.canShare({ files: [sharedFile] })) {
                throw new Error('Bu tarayıcı medya dosyasını doğrudan paylaşamıyor.');
            }
            if (state.mediaViewerFile?.id === file.id) state.preparedMediaFile = sharedFile;
        } catch (error) {
            if (state.mediaViewerFile?.id === file.id) state.mediaError = error.message;
        } finally {
            if (state.mediaViewerFile?.id === file.id) state.mediaPreparing = false;
            render();
        }
    }

    function openMediaFallback(file) {
        const mediaUrl = getMediaUrl(file);
        showToast(file.mediaKind === 'video'
            ? 'Native oynatıcı açılıyor. Paylaş menüsünden “Videoyu Kaydet” seçeneğini kullan.'
            : 'Görsel açılıyor. Paylaş menüsünden “Görüntüyü Kaydet” seçeneğini kullan.');
        const preview = window.open(mediaUrl, '_blank');
        if (preview) preview.opener = null;
        else window.location.assign(mediaUrl);
    }

    async function shareMedia(file) {
        if (!file || state.sharing.has(file.id)) return;
        if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || !state.preparedMediaFile) {
            openMediaFallback(file);
            return;
        }

        state.sharing.add(file.id);
        render();
        try {
            await navigator.share({ title: file.displayName, files: [state.preparedMediaFile] });
            const received = await fetch(`/api/files/${encodeURIComponent(file.id)}/received`, {
                method: 'POST',
                headers: { 'x-pin': state.pin }
            });
            if (!received.ok && received.status !== 404) throw new Error('Dosya paylaşıldı ancak listeden kaldırılamadı.');
            state.files.items = state.files.items.filter((item) => item.id !== file.id);
            state.fileSignature = state.files.items.map((item) => item.id).join('|');
            closeMediaViewer(false);
            showToast('Paylaşım tamamlandı; dosya telefona gönderilecekler listesinden kaldırıldı.');
        } catch (error) {
            if (error.name !== 'AbortError') {
                state.mediaError = 'Paylaşım menüsü açılamadı. Native görüntüleyicide açmayı deneyebilirsin.';
                showToast(state.mediaError, 'error');
            }
        } finally {
            state.sharing.delete(file.id);
            render();
        }
    }

    function startPolling() {
        clearInterval(state.pollTimer);
        state.pollTimer = setInterval(() => {
            if (!document.hidden && state.pin) Promise.all([loadFiles(false), loadSentFiles(false)]);
        }, 3000);
    }

    function uploadFiles(files) {
        if (!files || files.length === 0 || state.upload.status === 'uploading') return;
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append('files', file));
        const xhr = new XMLHttpRequest();
        state.upload = { status: 'uploading', xhr, count: files.length, percent: 0, loaded: 0, total: 0, message: '' };
        render();

        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('x-pin', state.pin);
        xhr.setRequestHeader('x-device-role', 'mobile');
        xhr.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable) return;
            state.upload.loaded = event.loaded;
            state.upload.total = event.total;
            state.upload.percent = Math.round((event.loaded / event.total) * 100);
            render();
        });
        xhr.addEventListener('load', async () => {
            dom.fileInput.value = '';
            if (xhr.status === 201) {
                const count = safeJson(xhr.responseText).count || files.length;
                state.upload = { ...state.upload, status: 'success', xhr: null, message: `${formatCount(count)} dosya bilgisayarın gelen kutusuna ulaştı.` };
                await loadSentFiles(false);
                showToast(`${formatCount(count)} dosya bilgisayara gönderildi.`);
            } else if (xhr.status === 401) {
                endSession(true);
            } else {
                state.upload = { ...state.upload, status: 'error', xhr: null, message: getRequestError(xhr) };
                showToast(getRequestError(xhr), 'error');
            }
            render();
        });
        xhr.addEventListener('error', () => {
            state.upload = { ...state.upload, status: 'error', xhr: null, message: 'Aktarım kesildi. Wi-Fi bağlantını kontrol et.' };
            showToast(state.upload.message, 'error');
            render();
        });
        xhr.addEventListener('abort', () => {
            state.upload = { ...state.upload, status: 'cancelled', xhr: null, message: 'Aktarım iptal edildi; dosyalar bilgisayara gönderilmedi.' };
            showToast('Aktarım iptal edildi.', 'error');
            render();
        });
        xhr.send(formData);
    }

    dom.loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (state.phase === 'verifying') return;
        if (state.pinInput.length !== 6) {
            state.loginError = 'Bilgisayar ekranındaki 6 haneli kodu gir.';
            render();
            dom.pinInput.focus();
            return;
        }
        verifyPin(state.pinInput);
    });
    dom.pinInput.addEventListener('input', (event) => {
        state.pinInput = event.target.value.replace(/\D/g, '').slice(0, 6);
        state.loginError = '';
        if (state.pinInput.length === 6 && state.phase !== 'verifying') {
            verifyPin(state.pinInput);
            return;
        }
        render();
    });
    dom.logoutBtn.addEventListener('click', disconnectFromServer);
    dom.brand.addEventListener('click', (event) => { event.preventDefault(); switchTab('sendPanel'); });
    dom.tabs.forEach((tab) => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        tab.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault();
            switchTab(tab.dataset.tab === 'sendPanel' ? 'receivePanel' : 'sendPanel', true);
        });
    });
    dom.refreshBtn.addEventListener('click', async () => {
        state.refreshing = true;
        render();
        await loadFiles(false);
        state.refreshing = false;
        render();
    });
    dom.cancelUploadBtn.addEventListener('click', () => state.upload.xhr?.abort());
    dom.fileInput.addEventListener('change', () => uploadFiles(dom.fileInput.files));
    dom.fileList.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        if (target.dataset.action === 'retry-files') {
            event.preventDefault();
            loadFiles(true);
        }
        if (target.dataset.action === 'open-media') {
            event.preventDefault();
            const file = state.files.items.find((item) => item.id === target.dataset.id);
            openMediaViewer(file);
        }
        if (target.dataset.action === 'download-file') {
            if (state.downloading.has(target.dataset.id)) {
                event.preventDefault();
                return;
            }
            const fileId = target.dataset.id;
            setTimeout(() => {
                state.downloading.add(fileId);
                showToast('İndirme başladı. Tamamlanınca dosya listeden kalkacak.');
                render();
                setTimeout(() => loadFiles(false), 1500);
            }, 0);
        }
    });
    dom.fileList.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        const target = event.target.closest('[data-action="open-media"]');
        if (!target) return;
        event.preventDefault();
        openMediaViewer(state.files.items.find((item) => item.id === target.dataset.id));
    });
    dom.closeMediaViewerBtn.addEventListener('click', () => closeMediaViewer());
    dom.mediaViewer.addEventListener('click', (event) => {
        if (event.target === dom.mediaViewer) closeMediaViewer();
    });
    dom.mediaShareBtn.addEventListener('click', () => shareMedia(state.mediaViewerFile));
    dom.mediaDownloadBtn.addEventListener('click', () => {
        showToast('Dosya indiriliyor. iPhone’da Dosyalar > İndirilenler altında bulabilirsin.');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.mediaViewerFile) closeMediaViewer();
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
        dom.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach((eventName) => dom.dropZone.addEventListener(eventName, () => { state.dragActive = true; render(); }));
    ['dragleave', 'drop'].forEach((eventName) => dom.dropZone.addEventListener(eventName, () => { state.dragActive = false; render(); }));
    dom.dropZone.addEventListener('drop', (event) => uploadFiles(event.dataTransfer.files));

    const urlPin = new URLSearchParams(window.location.search).get('pin');
    if (urlPin) {
        window.history.replaceState({}, document.title, window.location.pathname);
        state.pinInput = urlPin.replace(/\D/g, '').slice(0, 6);
        verifyPin(state.pinInput);
    } else if (state.pin) {
        state.pinInput = state.pin;
        verifyPin(state.pin, true);
    } else {
        render();
    }
});

function formatCount(value) {
    return new Intl.NumberFormat('tr-TR').format(value);
}

function formatBytes(bytes) {
    if (!Number(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: index === 0 ? 0 : 1 }).format(value)} ${units[index]}`;
}

function formatRelativeTime(dateValue) {
    const time = new Date(dateValue).getTime();
    if (!Number.isFinite(time)) return 'Az önce';
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${formatCount(minutes)} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${formatCount(hours)} sa önce`;
    return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time));
}

function formatFullDate(dateValue) {
    const date = new Date(dateValue);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short' }).format(date) : '';
}

function getFileType(filename) {
    const parts = filename.split('.');
    return (parts.length > 1 ? parts.pop() : 'DOS').toUpperCase().slice(0, 4);
}

function safeJson(text) {
    try { return JSON.parse(text); } catch (error) { return {}; }
}

function getRequestError(request) {
    return safeJson(request.responseText).error || 'Dosya gönderilemedi. Tekrar dene.';
}
