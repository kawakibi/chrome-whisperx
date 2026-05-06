// Track displayed translations to avoid duplicates
let displayedCount = 0;

// Load and display translations from storage
async function loadTranslations() {
    try {
        const result = await chrome.storage.local.get(['translationHistory']);
        const history = result.translationHistory || [];
        
        console.log(`Loading ${history.length} translations from history`);
        
        const outputBox = document.getElementById('translationOutput');
        
        if (history.length === 0) {
            outputBox.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Translations will appear here...</div>';
            displayedCount = 0;
            return;
        }
        
        // Display only new translations (those after displayedCount)
        if (history.length > displayedCount) {
            // Clear placeholder on first translation
            if (displayedCount === 0) {
                outputBox.innerHTML = '';
            }
            
            // Display new translations
            for (let i = displayedCount; i < history.length; i++) {
                const item = history[i];
                displayTranslationInDOM(item.original, item.translated, item.language, item.timestamp);
            }
            
            displayedCount = history.length;
            outputBox.scrollTop = outputBox.scrollHeight;
        }
    } catch (error) {
        console.error('Error loading translations:', error);
    }
}

function displayTranslationInDOM(original, translated, language, timestamp) {
    const outputBox = document.getElementById('translationOutput');
    
    outputBox.innerHTML += `
        <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
            <div style="color: #999; font-size: 10px;">${timestamp} [${language}]</div>
            <div style="color: #666; margin: 5px 0;"><strong>Original:</strong> ${original}</div>
            <div style="color: #2196F3;"><strong>Translated:</strong> ${translated}</div>
        </div>
    `;
}

// Load translations on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Detached window loaded');
    loadTranslations();
});

// Listen for storage changes to update translations in real-time
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.translationHistory) {
        console.log('Translation history updated, reloading...');
        loadTranslations();
    }
});

// Also listen for runtime messages (alternative update mechanism)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'translation') {
        console.log('Received new translation, reloading...');
        // Wait a bit for storage to be updated
        setTimeout(loadTranslations, 100);
    }
});
