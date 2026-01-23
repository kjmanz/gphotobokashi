document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url) {
        statusDiv.textContent = 'Googleフォトで画像を開いてください。';
        statusDiv.className = 'error';
        return;
    }

    let isGooglePhotos = false;
    try {
        const url = new URL(tab.url);
        isGooglePhotos = url.hostname === 'photos.google.com';
    } catch {
        isGooglePhotos = false;
    }

    if (!isGooglePhotos) {
        statusDiv.textContent = 'Googleフォトで画像を開いてください。';
        statusDiv.className = 'error';
        return;
    }

    try {
        await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_EDITOR' });
        window.close();
    } catch (e) {
        const injected = await ensureInjected(tab.id);
        if (injected) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_EDITOR' });
                window.close();
                return;
            } catch (retryError) {
                console.error(retryError);
            }
        } else {
            console.error(e);
        }

        statusDiv.textContent = '初期化に失敗しました。ページをリロードして再試行してください。';
        statusDiv.className = 'error';
    }
});

async function ensureInjected(tabId) {
    try {
        await chrome.tabs.sendMessage(tabId, { action: 'PING' });
        return true;
    } catch (e) {
        // Continue to inject below.
    }

    if (!chrome.scripting) return false;

    try {
        await chrome.scripting.insertCSS({
            target: { tabId },
            files: ['content/editor.css']
        });
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['lib/image-processor.js', 'content/editor.js', 'content/content.js']
        });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}
