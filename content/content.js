console.log('Google Photo Mosaic Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ ok: true });
        return;
    }
    if (request.action === 'TOGGLE_EDITOR') {
        initializeEditor();
    }
});

function initializeEditor() {
    // Try to find the main image.
    // Heuristic: The largest visible image in the viewport.
    // Google Photos uses complicated dynamic loading and preloads next/prev images.
    // We need to filter out hidden/offscreen images to avoid selecting the wrong one.

    const images = Array.from(document.querySelectorAll('img'));
    // Filter out tiny icons/thumbnails and non-visible images
    const candidates = images.filter(img => {
        if (img.width <= 200 || img.height <= 200) return false;

        // Visibility check - ensure the image is actually visible on screen
        const rect = img.getBoundingClientRect();
        const style = getComputedStyle(img);

        // Check if image is within viewport
        const inViewport = rect.top < window.innerHeight &&
                           rect.bottom > 0 &&
                           rect.left < window.innerWidth &&
                           rect.right > 0;

        // Check if image is visible (not hidden by CSS)
        const isVisible = style.visibility !== 'hidden' &&
                          style.opacity !== '0' &&
                          style.display !== 'none';

        return inViewport && isVisible;
    });

    if (candidates.length === 0) {
        alert('Googleフォトで画像を開いてください。');
        return;
    }

    // Sort by area, descending
    candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    const targetImage = candidates[0];

    if (window.GPhotoEditor) {
        window.GPhotoEditor.toggle(targetImage);
    } else {
        window.GPhotoEditor = new Editor(targetImage);
        window.GPhotoEditor.init();
    }
}
