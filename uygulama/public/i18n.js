(function initializeLocalDropI18n() {
    const STORAGE_KEY = 'localdrop_language';
    const ATTRIBUTE_NAMES = ['aria-label', 'alt', 'placeholder', 'title'];
    const originalText = new WeakMap();
    const originalAttributes = new WeakMap();
    let language = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'tr';
    let applying = false;
    let observer = null;

    function shouldIgnore(node) {
        const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        return !parent || Boolean(parent.closest('script, style, code, [data-i18n-ignore], .file-name, .file-type'));
    }

    function translated(value) {
        return window.LocalDropMessages?.translate(value, language) ?? value;
    }

    function processTextNode(node, switching = false) {
        if (shouldIgnore(node)) return;
        const current = node.nodeValue;
        if (!originalText.has(node)) originalText.set(node, current);
        else if (!switching && !applying) {
            const original = originalText.get(node);
            const expected = language === 'en' ? window.LocalDropMessages.translate(original, 'en') : original;
            if (current !== expected) originalText.set(node, current);
        }
        const original = originalText.get(node);
        const next = language === 'en' ? window.LocalDropMessages.translate(original, 'en') : original;
        if (node.nodeValue !== next) node.nodeValue = next;
    }

    function processAttributes(element, switching = false) {
        if (shouldIgnore(element)) return;
        let stored = originalAttributes.get(element);
        if (!stored) {
            stored = new Map();
            originalAttributes.set(element, stored);
        }
        for (const name of ATTRIBUTE_NAMES) {
            if (!element.hasAttribute(name)) continue;
            const current = element.getAttribute(name);
            if (!stored.has(name)) stored.set(name, current);
            else if (!switching && !applying) {
                const original = stored.get(name);
                const expected = language === 'en' ? window.LocalDropMessages.translate(original, 'en') : original;
                if (current !== expected) stored.set(name, current);
            }
            const original = stored.get(name);
            const next = language === 'en' ? window.LocalDropMessages.translate(original, 'en') : original;
            if (current !== next) element.setAttribute(name, next);
        }
    }

    function processTree(root, switching = false) {
        if (root.nodeType === Node.TEXT_NODE) {
            processTextNode(root, switching);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
        if (root.nodeType === Node.ELEMENT_NODE) processAttributes(root, switching);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) processTextNode(node, switching);
            else processAttributes(node, switching);
            node = walker.nextNode();
        }
    }

    function updateControls() {
        document.querySelectorAll('[data-language]').forEach((button) => {
            const active = button.dataset.language === language;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function applyLanguage(switching = false) {
        applying = true;
        document.documentElement.lang = language;
        processTree(document.head, switching);
        processTree(document.body, switching);
        updateControls();
        applying = false;
    }

    function setLanguage(nextLanguage) {
        if (!['tr', 'en'].includes(nextLanguage) || nextLanguage === language) return;
        language = nextLanguage;
        localStorage.setItem(STORAGE_KEY, language);
        applyLanguage(true);
        window.dispatchEvent(new CustomEvent('localdrop:languagechange', { detail: { language } }));
    }

    window.LocalDropI18n = {
        get language() { return language; },
        get locale() { return language === 'en' ? 'en-US' : 'tr-TR'; },
        setLanguage,
        translate(value) { return translated(value); }
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('click', (event) => {
            const option = event.target.closest('[data-language]');
            if (option) setLanguage(option.dataset.language);
        });
        applyLanguage(true);
        observer = new MutationObserver((mutations) => {
            if (applying) return;
            applying = true;
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') processTextNode(mutation.target);
                if (mutation.type === 'attributes') processAttributes(mutation.target);
                mutation.addedNodes?.forEach((node) => processTree(node));
            }
            updateControls();
            applying = false;
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ATTRIBUTE_NAMES
        });
    });
}());
