console.log('Google Photo Mosaic Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TOGGLE_EDITOR') {
        initializeEditor();
    }
});

function initializeEditor() {
    // Try to find the main image. 
    // Heuristic: The largest image visible or specific selector if known.
    // Google Photos uses complicated dynamic loading. 
    // We'll look for an img tag that seems to be the main view.

    const images = Array.from(document.querySelectorAll('img'));
    // Filter out tiny icons/thumbnails
    const candidates = images.filter(img => img.width > 200 && img.height > 200);

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
