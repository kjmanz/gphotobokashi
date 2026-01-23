// Basic Service Worker
console.log('Google Photo Mosaic & Blur extension loaded.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'DOWNLOAD_IMAGE') {
        chrome.downloads.download({
            url: request.dataUrl,
            filename: request.filename,
            conflictAction: 'uniquify',
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ ok: true, id: downloadId });
            }
        });
        return true; // Keep the message channel open for async response.
    }
    return undefined;
});
