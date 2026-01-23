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
        console.error(e);
        statusDiv.textContent = '初期化に失敗しました。ページをリロードして再試行してください。';
        statusDiv.className = 'error';
    }
});
