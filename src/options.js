const saveOptions = () => {
    const gptUrl = document.getElementById('gptUrl').value;
    const gptKey = document.getElementById('gptKey').value;

    chrome.storage.sync.set(
        { gptUrl: gptUrl, gptKey: gptKey },
        () => {
            // Update status to let user know options were saved.
            const status = document.getElementById('status');
            status.textContent = 'Options saved.';
            setTimeout(() => {
                status.textContent = '';
            }, 750);
        }
    );
};

const restoreOptions = () => {
    chrome.storage.sync.get(
        { gptUrl: '', gptKey: '' },
        (items) => {
            document.getElementById('gptUrl').value = items.gptUrl;
            document.getElementById('gptKey').value = items.gptKey;
        }
    );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);