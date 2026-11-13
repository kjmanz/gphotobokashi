document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const actionArea = document.getElementById('action-area');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const showOpenGooglePhotos = (message, isError = false) => {
        statusDiv.textContent = message;
        statusDiv.className = isError ? 'status error' : 'status';
        actionArea.innerHTML = '';
        const btn = document.createElement('button');
        btn.textContent = 'Googleフォトを開く';
        btn.onclick = () => {
            chrome.tabs.create({ url: 'https://photos.google.com/' });
            window.close();
        };
        actionArea.appendChild(btn);
    };

    if (!tab || !tab.url) {
        showOpenGooglePhotos('Googleフォトで画像を開いてください。', true);
        return;
    }

    let isSupported = false;
    try {
        const url = new URL(tab.url);
        isSupported =
            url.hostname === 'photos.google.com' ||
            url.protocol === 'file:' ||
            url.hostname === 'localhost' ||
            url.hostname === '127.0.0.1';
    } catch {
        isSupported = false;
    }

    if (!isSupported) {
        showOpenGooglePhotos('Googleフォト（またはモック画面）で写真を開いた状態でクリックしてください。');
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
        statusDiv.className = 'status error';
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
            files: ['lib/auto-detector.js', 'lib/image-processor.js', 'content/editor.js', 'content/content.js']
        });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}
