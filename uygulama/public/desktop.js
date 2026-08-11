document.addEventListener('DOMContentLoaded', () => {
    const dom = {
        loading: document.getElementById('desktopLoading'),
        app: document.getElementById('desktopApp'),
        transferPage: document.getElementById('transferPage'),
        disconnectedState: document.getElementById('disconnectedState'),
        centerReconnectBtn: document.getElementById('centerReconnectBtn'),
        computerName: document.getElementById('computerName'),
        lastChecked: document.getElementById('lastChecked'),
        connectionBadge: document.getElementById('connectionBadge'),
        connectionBadgeText: document.getElementById('connectionBadgeText'),
        openConnectBtn: document.getElementById('openConnectBtn'),
        connectionToggleBtn: document.getElementById('connectionToggleBtn'),
        connectionToggleText: document.getElementById('connectionToggleText'),
        qrImage: document.getElementById('qrImage'),
        displayPin: document.getElementById('displayPin'),
        pinCountdown: document.getElementById('pinCountdown'),
        displayUrl: document.getElementById('displayUrl'),
        copyUrlBtn: document.getElementById('copyUrlBtn'),
        copyLabel: document.getElementById('copyLabel'),
        rotatePinBtn: document.getElementById('rotatePinBtn'),
        dropZone: document.getElementById('pcDropZone'),
        fileInput: document.getElementById('pcFileInput'),
        progress: document.getElementById('pcProgress'),
        progressTitle: document.getElementById('pcProgressTitle'),
        progressDetail: document.getElementById('pcProgressDetail'),
        progressText: document.getElementById('pcProgressText'),
        progressFill: document.getElementById('pcProgressFill'),
        cancelUploadBtn: document.getElementById('pcCancelUploadBtn'),
        uploadSummary: document.getElementById('pcUploadSummary'),
        sharedCount: document.getElementById('pcSharedCount'),
        sharedQueue: document.getElementById('pcSharedQueue'),
        sharedQueueCount: document.getElementById('pcSharedQueueCount'),
        sharedList: document.getElementById('pcSharedList'),
        inboxList: document.getElementById('desktopFileList'),
        clearOutboxBtn: document.getElementById('clearOutboxBtn'),
        clearInboxBtn: document.getElementById('clearInboxBtn'),
        refreshBtn: document.getElementById('desktopRefreshBtn'),
        connectSidebar: document.getElementById('connectSidebar'),
        closeConnectSidebarBtn: document.getElementById('closeConnectSidebarBtn'),
        sidebarScrim: document.getElementById('sidebarScrim'),
        sidebarConnectionContent: document.getElementById('sidebarConnectionContent'),
        sidebarDisconnectedState: document.getElementById('sidebarDisconnectedState'),
        sidebarReconnectBtn: document.getElementById('sidebarReconnectBtn'),
        removeOverlay: document.getElementById('removeOverlay'),
        removeTitle: document.getElementById('removeTitle'),
        removeDescription: document.getElementById('removeDescription'),
        confirmRemoveBtn: document.getElementById('confirmRemoveBtn'),
        disconnectOverlay: document.getElementById('disconnectOverlay'),
        confirmDisconnectBtn: document.getElementById('confirmDisconnectBtn'),
        toast: document.getElementById('toast'),
        toastIcon: document.getElementById('toastIcon'),
        toastMessage: document.getElementById('toastMessage')
    };

    const state = {
        phase: 'loading',
        pageError: '',
        info: null,
        outbox: { status: 'loading', files: [], error: '' },
        inbox: { status: 'loading', files: [], error: '' },
        upload: { status: 'idle', xhr: null, count: 0, percent: 0, loaded: 0, total: 0, message: '' },
        dragActive: false,
        refreshing: false,
        rotating: false,
        copied: false,
        sidebarOpen: true,
        overlay: null,
        pendingRemoval: null,
        removing: false,
        sessionChanging: false,
        lastFocus: null,
        lastChecked: null,
        now: Date.now(),
        inboxSignature: '',
        toast: { open: false, message: '', type: 'success', timer: null },
        pollTimer: null,
        countdownTimer: null,
        eventSource: null
    };

    function render() {
        dom.loading.classList.toggle('hidden', state.phase !== 'loading');
        dom.app.classList.toggle('hidden', state.phase !== 'ready');

        if (state.phase === 'error') {
            dom.loading.classList.remove('hidden');
            dom.loading.replaceChildren(createPageError(state.pageError));
        }

        if (state.info) {
            dom.computerName.textContent = state.info.computerName || 'Bu bilgisayar';
            dom.displayPin.textContent = state.info.pin.split('').join(' ');
            dom.displayUrl.textContent = state.info.url;
            const qrSource = `/api/qr?v=${encodeURIComponent(state.info.pin)}`;
            if (dom.qrImage.getAttribute('src') !== qrSource) dom.qrImage.src = qrSource;
        }

        const sessionActive = state.info?.sessionActive !== false;
        const sidebarVisible = state.phase === 'ready' && state.sidebarOpen;
        dom.connectionBadge.classList.toggle('badge--success', sessionActive);
        dom.connectionBadge.classList.toggle('badge--warning', !sessionActive);
        dom.connectionBadgeText.textContent = sessionActive ? 'Bağlantı açık' : 'Bağlantı kapalı';
        dom.openConnectBtn.classList.toggle('hidden', sidebarVisible);
        dom.openConnectBtn.disabled = state.sessionChanging;
        dom.openConnectBtn.setAttribute('aria-expanded', String(sidebarVisible));
        dom.transferPage.classList.toggle('hidden', !sessionActive);
        dom.disconnectedState.classList.toggle('hidden', sessionActive);
        dom.connectSidebar.classList.toggle('is-open', sidebarVisible);
        dom.connectSidebar.setAttribute('aria-hidden', String(!sidebarVisible));
        dom.connectSidebar.inert = !sidebarVisible;
        dom.sidebarConnectionContent.classList.toggle('hidden', !sessionActive);
        dom.sidebarDisconnectedState.classList.toggle('hidden', sessionActive);
        document.body.classList.toggle('sidebar-open', sidebarVisible);
        dom.connectionToggleBtn.disabled = state.sessionChanging;
        dom.connectionToggleBtn.title = sessionActive ? 'Bağlantıyı kes' : 'Sunucuya yeniden bağlan';
        dom.connectionToggleBtn.classList.toggle('btn--ghost', sessionActive);
        dom.connectionToggleBtn.classList.toggle('btn--primary', !sessionActive);
        dom.connectionToggleText.textContent = state.sessionChanging
            ? (sessionActive ? 'Kesiliyor…' : 'Bağlanıyor…')
            : (sessionActive ? 'Bağlantıyı kes' : 'Yeniden bağlan');
        dom.pinCountdown.textContent = sessionActive ? formatCountdown(state.info?.pinExpiresAt, state.now) : '--:--';

        dom.lastChecked.textContent = state.lastChecked
            ? `Son kontrol ${new Intl.DateTimeFormat(currentLocale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(state.lastChecked)}`
            : 'Bağlantı hazırlanıyor';

        const uploading = state.upload.status === 'uploading';
        dom.dropZone.classList.toggle('is-dragging', state.dragActive);
        dom.dropZone.classList.toggle('is-disabled', uploading);
        dom.fileInput.disabled = uploading;
        dom.progress.classList.toggle('hidden', !uploading);
        dom.uploadSummary.classList.toggle('hidden', !['success', 'error', 'cancelled'].includes(state.upload.status));
        dom.uploadSummary.classList.toggle('inline-feedback--success', state.upload.status === 'success');
        dom.uploadSummary.classList.toggle('inline-feedback--danger', ['error', 'cancelled'].includes(state.upload.status));
        dom.uploadSummary.textContent = state.upload.message;
        dom.progressTitle.textContent = state.upload.count > 1 ? `${formatCount(state.upload.count)} dosya telefona gönderiliyor` : 'Dosya telefona gönderiliyor';
        dom.progressDetail.textContent = state.upload.total ? `${formatBytes(state.upload.loaded)} / ${formatBytes(state.upload.total)}` : 'Hazırlanıyor…';
        dom.progressText.textContent = `${state.upload.percent}%`;
        dom.progressFill.style.width = `${state.upload.percent}%`;
        dom.cancelUploadBtn.disabled = !uploading;

        dom.sharedCount.textContent = `${formatCount(state.outbox.files.length)} dosya`;
        const showSharedQueue = state.outbox.status === 'error' || state.outbox.files.length > 0;
        dom.sharedQueue.classList.toggle('hidden', !showSharedQueue);
        dom.sharedQueueCount.textContent = `${formatCount(state.outbox.files.length)} dosya`;
        dom.clearOutboxBtn.disabled = state.outbox.files.length === 0 || state.removing;
        dom.clearInboxBtn.disabled = state.inbox.files.length === 0 || state.removing;
        if (showSharedQueue) renderFileRegion(dom.sharedList, state.outbox, 'outbox');
        renderFileRegion(dom.inboxList, state.inbox, 'inbox');

        dom.refreshBtn.classList.toggle('is-refreshing', state.refreshing);
        dom.refreshBtn.disabled = state.refreshing;
        dom.rotatePinBtn.disabled = state.rotating || !sessionActive;
        dom.centerReconnectBtn.disabled = state.sessionChanging;
        dom.sidebarReconnectBtn.disabled = state.sessionChanging;
        dom.centerReconnectBtn.textContent = state.sessionChanging ? 'Bağlanıyor…' : 'Yeniden bağlan';
        dom.sidebarReconnectBtn.textContent = state.sessionChanging ? 'Bağlanıyor…' : 'Yeniden bağlan';
        dom.confirmRemoveBtn.disabled = state.removing;
        const removingAll = state.pendingRemoval?.mode === 'all';
        const removalCount = removingAll ? state.pendingRemoval.count : 1;
        const removingFromInbox = state.pendingRemoval?.scope === 'inbox';
        const locationText = removingFromInbox ? 'bilgisayardan' : 'telefondan';
        dom.removeTitle.textContent = removingAll
            ? `Tüm dosyaları ${locationText} sil?`
            : `Dosyayı ${locationText} sil?`;
        dom.confirmRemoveBtn.textContent = state.removing ? 'Siliniyor…' : `${formatCount(removalCount)} dosyayı sil`;
        dom.removeDescription.textContent = removingAll
            ? `${formatCount(removalCount)} dosya ${locationText} kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : state.pendingRemoval?.file
                ? `“${state.pendingRemoval.file.displayName}” ${locationText} kalıcı olarak silinecek. Bu işlem geri alınamaz.`
                : '1 dosya kalıcı olarak kaldırılacak.';

        dom.removeOverlay.classList.toggle('is-open', state.overlay === 'remove');
        dom.removeOverlay.setAttribute('aria-hidden', String(state.overlay !== 'remove'));
        dom.disconnectOverlay.classList.toggle('is-open', state.overlay === 'disconnect');
        dom.disconnectOverlay.setAttribute('aria-hidden', String(state.overlay !== 'disconnect'));
        dom.confirmDisconnectBtn.disabled = state.sessionChanging;
        dom.confirmDisconnectBtn.textContent = state.sessionChanging ? 'Kesiliyor…' : 'Bağlantıyı kes';
        document.body.style.overflow = state.overlay ? 'hidden' : '';

        const copyTextNode = dom.copyLabel.lastChild;
        if (copyTextNode) copyTextNode.textContent = state.copied ? ' Kopyalandı' : ' Kopyala';

        dom.toast.classList.toggle('is-open', state.toast.open);
        dom.toast.classList.toggle('is-error', state.toast.type === 'error');
        dom.toastIcon.classList.toggle('hidden', state.toast.type === 'error');
        dom.toastMessage.textContent = state.toast.message;
    }

    function renderFileRegion(container, region, type) {
        const renderSignature = JSON.stringify({
            status: region.status,
            error: region.error,
            files: region.files.map((file) => [file.id, file.displayName, file.size, file.createdAt])
        });
        if (container.dataset.renderSignature === renderSignature) return;
        container.dataset.renderSignature = renderSignature;

        const fragment = document.createDocumentFragment();
        if (region.status === 'loading') {
            fragment.append(createFileSkeleton(), createFileSkeleton());
        } else if (region.status === 'error') {
            fragment.append(createErrorState(
                type === 'outbox' ? 'Gönderilenler alınamadı' : 'Gelen kutusu alınamadı',
                region.error,
                type === 'outbox' ? 'retry-outbox' : 'retry-inbox'
            ));
        } else if (region.files.length === 0) {
            fragment.append(type === 'outbox'
                ? createEmptyState('Telefona henüz dosya bırakmadın', 'Seçtiğin dosyalar burada görünür ve telefon indirdiğinde otomatik kalkar.', 'Dosya seç', 'select-files')
                : createEmptyState('Henüz gelen dosya yok', 'Telefonundan gönderdiğin dosyalar otomatik olarak burada görünür.', 'Telefonu bağla', 'open-connect'));
        } else {
            region.files.forEach((file, index) => fragment.append(createFileRow(file, type, index)));
        }
        container.replaceChildren(fragment);
    }

    function createFileRow(file, type, index) {
        const row = document.createElement('article');
        row.className = 'file-item';
        row.style.animationDelay = `${Math.min(index, 5) * 30}ms`;

        const fileType = document.createElement('span');
        fileType.className = 'file-type';
        fileType.textContent = getFileType(file.displayName);

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

        const actions = document.createElement('div');
        actions.className = 'file-actions';
        if (type === 'inbox') {
            const download = document.createElement('a');
            download.className = 'file-action file-action--download';
            download.href = `/api/download/${encodeURIComponent(file.id)}?pin=${encodeURIComponent(state.info.pin)}`;
            download.download = file.displayName;
            download.setAttribute('aria-label', `${file.displayName} dosyasını indir`);
            download.title = 'Bilgisayara indir';
            download.append(createIcon('download'));
            download.addEventListener('click', () => {
                download.classList.add('is-downloading');
                download.title = 'İndiriliyor';
                setTimeout(async () => {
                    await loadList('inbox', 'desktop');
                    render();
                }, 1200);
            });
            actions.append(download);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'file-action file-action--danger';
        remove.dataset.action = 'remove-file';
        remove.dataset.scope = type;
        remove.dataset.id = file.id;
        remove.setAttribute('aria-label', `${file.displayName} dosyasını ${type === 'inbox' ? 'bilgisayardan' : 'telefondan'} sil`);
        remove.title = type === 'inbox' ? 'Bilgisayardan sil' : 'Telefondan sil';
        remove.append(createIcon('x'));
        actions.append(remove);

        row.append(fileType, copy, actions);
        return row;
    }

    function createEmptyState(title, text, actionLabel, action) {
        const wrapper = document.createElement('div');
        wrapper.className = 'empty';
        const icon = document.createElement('span');
        icon.className = 'empty__icon';
        icon.append(createIcon('file'));
        const heading = document.createElement('h3');
        heading.className = 'empty__title';
        heading.textContent = title;
        const copy = document.createElement('p');
        copy.className = 'empty__text';
        copy.textContent = text;
        const actions = document.createElement('div');
        actions.className = 'empty__actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--secondary btn--sm';
        button.dataset.action = action;
        button.textContent = actionLabel;
        actions.append(button);
        wrapper.append(icon, heading, copy, actions);
        return wrapper;
    }

    function createErrorState(title, text, action) {
        const wrapper = document.createElement('div');
        wrapper.className = 'error-state';
        const icon = document.createElement('span');
        icon.className = 'error-state__icon';
        icon.append(createIcon('alert'));
        const heading = document.createElement('h3');
        heading.className = 'error-state__title';
        heading.textContent = title;
        const copy = document.createElement('p');
        copy.className = 'error-state__text';
        copy.textContent = text || 'Bağlantıyı kontrol edip tekrar dene.';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--secondary btn--sm';
        button.dataset.action = action;
        button.textContent = 'Tekrar dene';
        wrapper.append(icon, heading, copy, button);
        return wrapper;
    }

    function createPageError(message) {
        const wrapper = createErrorState('Panel açılamadı', message || 'Bu panel yalnızca sunucunun çalıştığı bilgisayarda açılabilir.', 'reload-page');
        wrapper.classList.add('app-loading__content');
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
            x: ['M18 6 6 18', 'm6 6 12 12'],
            download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
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

    function getOverlay(name) {
        if (name === 'disconnect') return dom.disconnectOverlay;
        return dom.removeOverlay;
    }

    function openConnectSidebar() {
        state.sidebarOpen = true;
        render();
        requestAnimationFrame(() => dom.closeConnectSidebarBtn.focus());
    }

    function closeConnectSidebar() {
        state.sidebarOpen = false;
        render();
        dom.openConnectBtn.focus();
    }

    function openOverlay(name, removal = null) {
        state.lastFocus = document.activeElement;
        state.overlay = name;
        state.pendingRemoval = removal;
        render();
        requestAnimationFrame(() => {
            const overlay = getOverlay(name);
            const focusTarget = overlay.querySelector('button, [tabindex]');
            if (focusTarget) focusTarget.focus();
        });
    }

    function closeOverlay() {
        if (state.removing || state.sessionChanging) return;
        const focusTarget = state.lastFocus;
        state.overlay = null;
        state.pendingRemoval = null;
        render();
        if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
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

    async function initialize() {
        try {
            const response = await fetch('/api/info');
            if (!response.ok) throw new Error('Bu panel yalnızca sunucunun çalıştığı bilgisayarda açılabilir.');
            state.info = await response.json();
            state.info.sessionActive = state.info.sessionActive !== false;
            state.phase = 'ready';
            render();
            await refreshLists(true);
            state.pollTimer = setInterval(() => {
                if (!document.hidden) refreshLists(false);
            }, 2000);
            state.countdownTimer = setInterval(() => {
                state.now = Date.now();
                render();
            }, 1000);
            state.eventSource = new EventSource('/api/events');
            state.eventSource.addEventListener('storage-change', async () => {
                await Promise.all([loadList('outbox', 'mobile'), loadList('inbox', 'desktop')]);
                state.lastChecked = new Date();
                render();
            });
        } catch (error) {
            state.phase = 'error';
            state.pageError = error.message;
            render();
        }
    }

    async function refreshLists(showLoading) {
        if (!state.info) return;
        if (showLoading) {
            state.outbox.status = 'loading';
            state.inbox.status = 'loading';
        }
        render();
        await loadSessionStatus();
        await Promise.all([loadList('outbox', 'mobile'), loadList('inbox', 'desktop')]);
        state.lastChecked = new Date();
        render();
    }

    async function loadSessionStatus() {
        try {
            const response = await fetch('/api/info');
            if (!response.ok) return;
            const data = await response.json();
            const wasActive = state.info.sessionActive !== false;
            const previousPin = state.info.pin;
            state.info.pin = data.pin;
            state.info.url = data.url;
            state.info.pinExpiresAt = data.pinExpiresAt;
            state.info.sessionActive = data.sessionActive !== false;
            if (wasActive && !state.info.sessionActive) {
                showToast('Telefon bağlantıyı kesti. Yeniden bağlanana kadar sunucu kapalı.', 'error');
            } else if (wasActive && state.info.sessionActive && previousPin !== data.pin) {
                showToast('5 dakikalık süre doldu. Yeni QR kodu ve bağlantı kodu hazır.');
            }
        } catch (error) {
            /* Dosya listesi kendi bağlantı hatasını gösterir. */
        }
    }

    async function loadList(key, target) {
        try {
            const response = await fetch(`/api/files?target=${target}`, { headers: { 'x-pin': state.info.pin } });
            if (!response.ok) throw new Error('Yerel sunucuya ulaşılamadı.');
            const data = await response.json();
            const signature = data.files.map((file) => file.id).join('|');
            if (key === 'inbox' && state.inboxSignature && signature !== state.inboxSignature && data.files.length > state.inbox.files.length) {
                showToast('Telefondan yeni dosya geldi.');
            }
            if (key === 'inbox') state.inboxSignature = signature;
            state[key] = { status: 'ready', files: data.files, error: '' };
        } catch (error) {
            state[key] = { ...state[key], status: 'error', error: error.message };
        }
    }

    function uploadFiles(files) {
        if (!files || files.length === 0 || state.upload.status === 'uploading') return;
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append('files', file));
        const xhr = new XMLHttpRequest();
        state.upload = { status: 'uploading', xhr, count: files.length, percent: 0, loaded: 0, total: 0, message: '' };
        render();

        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('x-pin', state.info.pin);
        xhr.setRequestHeader('x-device-role', 'desktop');
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
                state.upload = { ...state.upload, status: 'success', xhr: null, message: `${formatCount(count)} dosya telefonda indirilmeye hazır.` };
                await loadList('outbox', 'mobile');
                showToast(`${formatCount(count)} dosya telefona bırakıldı.`);
            } else {
                state.upload = { ...state.upload, status: 'error', xhr: null, message: getRequestError(xhr) };
                showToast(getRequestError(xhr), 'error');
            }
            render();
        });
        xhr.addEventListener('error', () => {
            state.upload = { ...state.upload, status: 'error', xhr: null, message: 'Aktarım kesildi. Aynı Wi-Fi ağında olduğunu kontrol et.' };
            showToast(state.upload.message, 'error');
            render();
        });
        xhr.addEventListener('abort', () => {
            state.upload = { ...state.upload, status: 'cancelled', xhr: null, message: 'Aktarım iptal edildi; dosyalar telefona bırakılmadı.' };
            showToast('Aktarım iptal edildi.', 'error');
            render();
        });
        xhr.send(formData);
    }

    async function removePendingFile() {
        if (!state.pendingRemoval || state.removing) return;
        state.removing = true;
        render();
        try {
            const removal = state.pendingRemoval;
            const isAll = removal.mode === 'all';
            const file = removal.file;
            const target = removal.scope === 'inbox' ? 'desktop' : 'mobile';
            const region = removal.scope === 'inbox' ? state.inbox : state.outbox;
            const endpoint = isAll ? `/api/files?target=${target}` : `/api/files/${encodeURIComponent(file.id)}`;
            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: { 'x-pin': state.info.pin }
            });
            const responseType = response.headers.get('content-type') || '';
            const responseText = await response.text();
            const data = safeJson(responseText);
            if (!responseType.includes('application/json')) {
                throw new Error('Silme servisi henüz aktif değil. Sunucuyu kapatıp start.bat ile yeniden başlat.');
            }
            if (!isAll && response.status === 404 && data.error === 'Dosya bulunamadı.') {
                region.files = region.files.filter((item) => item.id !== file.id);
                state.removing = false;
                state.overlay = null;
                state.pendingRemoval = null;
                await loadList(removal.scope, target);
                showToast('Dosya zaten kaldırılmış; liste güncellendi.');
                render();
                return;
            }
            if (!response.ok) throw new Error(data.error || 'Dosya kaldırılamadı.');
            region.files = isAll ? [] : region.files.filter((item) => item.id !== file.id);
            state.removing = false;
            state.overlay = null;
            state.pendingRemoval = null;
            showToast(isAll
                ? `${formatCount(data.removedCount || removal.count)} dosya ${target === 'desktop' ? 'bilgisayardan' : 'telefondan'} silindi.`
                : `${file.displayName} ${target === 'desktop' ? 'bilgisayardan' : 'telefondan'} silindi.`);
        } catch (error) {
            state.removing = false;
            showToast(error.message, 'error');
        }
        render();
    }

    async function rotatePin() {
        if (state.rotating) return;
        state.rotating = true;
        render();
        try {
            const response = await fetch('/api/pin/rotate', { method: 'POST' });
            if (!response.ok) throw new Error('Bağlantı kodu yenilenemedi.');
            const data = await response.json();
            state.info.pin = data.pin;
            state.info.pinExpiresAt = data.pinExpiresAt;
            state.info.sessionActive = data.sessionActive !== false;
            state.inboxSignature = '';
            await refreshLists(false);
            showToast('Yeni bağlantı kodu hazır. Eski telefon bağlantıları kapatıldı.');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            state.rotating = false;
            render();
        }
    }

    async function disconnectSession() {
        if (state.sessionChanging) return;
        state.sessionChanging = true;
        render();
        try {
            const response = await fetch('/api/session/disconnect', { method: 'POST' });
            const responseType = response.headers.get('content-type') || '';
            const data = safeJson(await response.text());
            if (!responseType.includes('application/json')) {
                throw new Error('Bağlantı servisi henüz aktif değil. Sunucuyu yeniden başlat.');
            }
            if (!response.ok) throw new Error(data.error || 'Bağlantı kesilemedi.');
            state.info.sessionActive = false;
            state.info.pinExpiresAt = null;
            state.overlay = null;
            state.pendingRemoval = null;
            showToast('Telefon bağlantısı kesildi. Dosyaların korunuyor.');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            state.sessionChanging = false;
            render();
        }
    }

    async function reconnectSession() {
        if (state.sessionChanging) return;
        state.sessionChanging = true;
        render();
        try {
            const response = await fetch('/api/session/reconnect', { method: 'POST' });
            const responseType = response.headers.get('content-type') || '';
            const data = safeJson(await response.text());
            if (!responseType.includes('application/json')) {
                throw new Error('Bağlantı servisi henüz aktif değil. Sunucuyu yeniden başlat.');
            }
            if (!response.ok) throw new Error(data.error || 'Sunucuya yeniden bağlanılamadı.');
            state.info.pin = data.pin;
            state.info.pinExpiresAt = data.pinExpiresAt;
            state.info.sessionActive = data.sessionActive !== false;
            state.inboxSignature = '';
            await refreshLists(false);
            state.sessionChanging = false;
            state.sidebarOpen = true;
            render();
            showToast('Bağlantı açıldı. Yeni QR kodu hazır.');
        } catch (error) {
            state.sessionChanging = false;
            showToast(error.message, 'error');
            render();
        }
    }

    function copyWithSelection(text) {
        const input = document.createElement('textarea');
        input.value = text;
        input.readOnly = true;
        input.setAttribute('aria-hidden', 'true');
        input.style.position = 'fixed';
        input.style.top = '0';
        input.style.left = '0';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        input.style.fontSize = '16px';
        document.body.append(input);
        input.focus({ preventScroll: true });
        input.select();
        input.setSelectionRange(0, input.value.length);
        const copied = document.execCommand('copy');
        input.remove();
        return copied;
    }

    async function copyUrl() {
        const url = state.info.url;
        let copied = false;
        if (window.isSecureContext && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(url);
                copied = true;
            } catch (error) { /* HTTP/izin engelinde seçim tabanlı yönteme geç */ }
        }
        if (!copied) copied = copyWithSelection(url);
        if (!copied) {
            window.prompt('Adresi kopyalamak için basılı tut:', url);
            return;
        }
        state.copied = true;
        render();
        showToast('Bağlantı adresi kopyalandı.');
        setTimeout(() => { state.copied = false; render(); }, 1800);
    }

    function handleAction(action, target) {
        if (action === 'open-connect') {
            if (state.info?.sessionActive === false) reconnectSession();
            else openConnectSidebar();
        }
        if (action === 'close-overlay') closeOverlay();
        if (action === 'select-files') dom.fileInput.click();
        if (action === 'remove-file') {
            const scope = target.dataset.scope === 'inbox' ? 'inbox' : 'outbox';
            const file = state[scope].files.find((item) => item.id === target.dataset.id);
            if (file) openOverlay('remove', { mode: 'single', scope, file });
        }
        if (action === 'clear-files') {
            const scope = target.dataset.scope === 'inbox' ? 'inbox' : 'outbox';
            const count = state[scope].files.length;
            if (count > 0) openOverlay('remove', { mode: 'all', scope, count });
        }
        if (action === 'retry-outbox') loadList('outbox', 'mobile').then(render);
        if (action === 'retry-inbox') loadList('inbox', 'desktop').then(render);
        if (action === 'reload-page') window.location.reload();
    }

    document.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (actionTarget) handleAction(actionTarget.dataset.action, actionTarget);
        if (event.target === dom.removeOverlay || event.target === dom.disconnectOverlay) closeOverlay();
    });

    dom.openConnectBtn.addEventListener('click', openConnectSidebar);
    dom.closeConnectSidebarBtn.addEventListener('click', closeConnectSidebar);
    dom.sidebarScrim.addEventListener('click', closeConnectSidebar);
    dom.centerReconnectBtn.addEventListener('click', reconnectSession);
    dom.sidebarReconnectBtn.addEventListener('click', reconnectSession);
    dom.connectionToggleBtn.addEventListener('click', () => {
        if (state.info?.sessionActive === false) reconnectSession();
        else openOverlay('disconnect');
    });
    dom.refreshBtn.addEventListener('click', async () => {
        state.refreshing = true;
        render();
        await refreshLists(false);
        state.refreshing = false;
        render();
    });
    dom.rotatePinBtn.addEventListener('click', rotatePin);
    dom.copyUrlBtn.addEventListener('click', copyUrl);
    dom.confirmRemoveBtn.addEventListener('click', removePendingFile);
    dom.confirmDisconnectBtn.addEventListener('click', disconnectSession);
    dom.cancelUploadBtn.addEventListener('click', () => state.upload.xhr?.abort());
    dom.fileInput.addEventListener('change', () => uploadFiles(dom.fileInput.files));

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
        dom.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
    });
    ['dragenter', 'dragover'].forEach((eventName) => dom.dropZone.addEventListener(eventName, () => { state.dragActive = true; render(); }));
    ['dragleave', 'drop'].forEach((eventName) => dom.dropZone.addEventListener(eventName, () => { state.dragActive = false; render(); }));
    dom.dropZone.addEventListener('drop', (event) => uploadFiles(event.dataTransfer.files));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.overlay) closeOverlay();
        else if (event.key === 'Escape' && state.sidebarOpen) closeConnectSidebar();
        if (event.key === 'Tab' && state.overlay) trapFocus(event, getOverlay(state.overlay));
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && state.phase === 'ready') refreshLists(false);
    });

    window.addEventListener('beforeunload', () => {
        clearInterval(state.pollTimer);
        clearInterval(state.countdownTimer);
        state.eventSource?.close();
    });
    window.addEventListener('localdrop:languagechange', render);
    render();
    initialize();
});

function trapFocus(event, overlay) {
    const focusable = Array.from(overlay.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function currentLocale() {
    return window.LocalDropI18n?.locale || 'tr-TR';
}

function formatCount(value) {
    return new Intl.NumberFormat(currentLocale()).format(value);
}

function formatCountdown(expiresAt, now = Date.now()) {
    const expiry = Number(expiresAt);
    if (!Number.isFinite(expiry)) return '--:--';
    const remainingSeconds = Math.max(0, Math.ceil((expiry - now) / 1000));
    const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
    const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function formatBytes(bytes) {
    if (!Number(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: index === 0 ? 0 : 1 }).format(value)} ${units[index]}`;
}

function formatRelativeTime(dateValue) {
    const time = new Date(dateValue).getTime();
    if (!Number.isFinite(time)) return 'Az önce';
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${formatCount(minutes)} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${formatCount(hours)} sa önce`;
    return new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time));
}

function formatFullDate(dateValue) {
    const date = new Date(dateValue);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'long', timeStyle: 'short' }).format(date) : '';
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
