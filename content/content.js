console.log('Google Photo Mosaic Content Script Loaded');

if (!window.__gphotoContentInitialized) {
    window.__gphotoContentInitialized = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'PING') {
            sendResponse({ ok: true });
            return;
        }
        if (request.action === 'TOGGLE_EDITOR') {
            initializeEditor();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupQuickLaunchObserver, { once: true });
    } else {
        setupQuickLaunchObserver();
    }
}

function findTargetImage() {
    const images = Array.from(document.querySelectorAll('img'));
    const candidates = images
        .map((img) => {
            if (img.closest('#gphoto-editor-overlay')) return null;
            const rect = img.getBoundingClientRect();
            if (rect.width < 200 || rect.height < 200) return null;

            const style = getComputedStyle(img);
            const inViewport =
                rect.top < window.innerHeight &&
                rect.bottom > 0 &&
                rect.left < window.innerWidth &&
                rect.right > 0;

            const isVisible =
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                parseFloat(style.opacity || '1') > 0.1;

            if (!inViewport || !isVisible) return null;
            return { img, area: rect.width * rect.height };
        })
        .filter(Boolean);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.area - a.area);
    return candidates[0];
}

function initializeEditor() {
    const best = findTargetImage();
    if (!best) {
        alert('Googleフォトで画像を開いてください。');
        return;
    }

    const targetImage = best.img;

    if (window.GPhotoEditor) {
        window.GPhotoEditor.toggle(targetImage);
    } else {
        window.GPhotoEditor = new Editor(targetImage);
        window.GPhotoEditor.init();
    }
    updateQuickLaunchVisibility();
}

function ensureQuickLaunchButton() {
    if (!document.body) return null;
    let btn = document.getElementById('gphoto-quick-launch-btn');
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = 'gphoto-quick-launch-btn';
    btn.type = 'button';
    btn.title = '表示中の写真をモザイク・ぼかし編集';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1"></rect>
        <rect x="14" y="3" width="7" height="7" rx="1"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1"></rect>
        <circle cx="17.5" cy="17.5" r="3.5"></circle>
      </svg>
      <span>モザイク・ぼかし編集</span>
    `;
    btn.style.display = 'none';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        initializeEditor();
    });

    document.body.appendChild(btn);
    return btn;
}

function shouldShowQuickLaunchButton() {
    if (window.GPhotoEditor && window.GPhotoEditor.overlay) {
        return false;
    }
    const best = findTargetImage();
    if (!best) return false;

    if (location.hostname === 'photos.google.com') {
        return location.pathname.includes('/photo/') || best.area >= 400 * 300;
    }
    return true;
}

function updateQuickLaunchVisibility() {
    const btn = ensureQuickLaunchButton();
    if (!btn) return;
    btn.style.display = shouldShowQuickLaunchButton() ? 'inline-flex' : 'none';
}

function setupQuickLaunchObserver() {
    let timer = null;
    const scheduleUpdate = () => {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            updateQuickLaunchVisibility();
        }, 250);
    };

    updateQuickLaunchVisibility();

    if (document.body) {
        const observer = new MutationObserver(scheduleUpdate);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class']
        });
    }

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('popstate', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
}

window.gphotoUpdateQuickLaunch = updateQuickLaunchVisibility;
