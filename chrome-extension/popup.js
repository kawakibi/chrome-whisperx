// Load saved settings
let nextExpectedSequence = 0;
let translationQueue = new Map(); // Store out-of-order translations

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Loading saved settings...');
        const settings = await chrome.storage.local.get([
            'serverUrl',
            'sourceLanguage',
            'targetLanguage',
            'chunkDuration',
            'translationHistory'
        ]);
        
        console.log('Loaded settings:', settings);
        
        document.getElementById('serverUrl').value = settings.serverUrl || 'http://localhost:8000';
        document.getElementById('sourceLanguage').value = settings.sourceLanguage || '';
        document.getElementById('targetLanguage').value = settings.targetLanguage || 'English';
        document.getElementById('chunkDuration').value = settings.chunkDuration || 1;
        
        // Load capture status
        const status = await chrome.storage.local.get(['isCapturing']);
        updateUI(status.isCapturing || false);
        
        // Restore translation history
        const translationHistory = settings.translationHistory || [];
        if (translationHistory.length > 0) {
            console.log(`Restoring ${translationHistory.length} translations from history`);
            const outputBox = document.getElementById('translationOutput');
            outputBox.innerHTML = '';
            translationHistory.forEach(item => {
                displayTranslationInDOM(item.original, item.translated, item.language, item.timestamp);
                // Track restored sequences to avoid duplicates
                if (typeof item.sequence === 'number') {
                    displayedSequences.add(item.sequence);
                }
            });
            // Update nextExpectedSequence to continue from where we left off
            if (translationHistory.length > 0) {
                const lastSequence = translationHistory[translationHistory.length - 1].sequence;
                if (typeof lastSequence === 'number') {
                    nextExpectedSequence = lastSequence + 1;
                }
            }
        }
        
        console.log('Settings loaded successfully');
    } catch (error) {
        console.error('Error loading settings:', error);
        updateStatus('Error loading settings: ' + error.message);
    }
});

// Save settings
document.getElementById('saveSettings').addEventListener('click', async () => {
    try {
        const serverUrl = document.getElementById('serverUrl').value;
        const sourceLanguage = document.getElementById('sourceLanguage').value;
        const targetLanguage = document.getElementById('targetLanguage').value;
        const chunkDuration = parseInt(document.getElementById('chunkDuration').value, 10);
        
        console.log('Saving settings:', {
            serverUrl,
            sourceLanguage,
            targetLanguage,
            chunkDuration
        });
        
        await chrome.storage.local.set({
            serverUrl,
            sourceLanguage,
            targetLanguage,
            chunkDuration
        });
        
        console.log('Settings saved successfully');
        updateStatus('✅ Settings saved!');
        setTimeout(() => updateStatus('Ready'), 2000);
    } catch (error) {
        console.error('Error saving settings:', error);
        updateStatus('❌ Error saving: ' + error.message);
    }
});

// Start capture
document.getElementById('startCapture').addEventListener('click', async () => {
    try {
        console.log('Start capture clicked');
        
        // Reset sequence tracking when starting new capture
        nextExpectedSequence = 0;
        translationQueue.clear();
        
        // Clear translation output and storage
        const outputBox = document.getElementById('translationOutput');
        outputBox.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Translations will appear here...</div>';
        
        // Clear translation history from storage
        await chrome.storage.local.set({ translationHistory: [] });
        console.log('Translation history cleared');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            throw new Error('No active tab found');
        }
        
        console.log('Sending startCapture message for tab:', tab.id);
        
        // Send message to background script to start capture
        chrome.runtime.sendMessage({ 
            action: 'startCapture',
            tabId: tab.id 
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                updateStatus('❌ Error: ' + chrome.runtime.lastError.message);
                return;
            }
            
            if (response && response.success) {
                console.log('Capture started successfully');
                updateStatus('🎵 Capturing audio...');
                updateUI(true);
            } else {
                console.error('Start capture failed:', response);
                updateStatus('❌ Error: ' + (response?.error || 'Failed to start capture'));
            }
        });
    } catch (error) {
        console.error('Error starting capture:', error);
        updateStatus('❌ Error: ' + error.message);
    }
});

// Stop capture
document.getElementById('stopCapture').addEventListener('click', () => {
    console.log('Stop capture clicked');
    chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            updateStatus('❌ Error: ' + chrome.runtime.lastError.message);
            return;
        }
        
        if (response && response.success) {
            console.log('Capture stopped successfully');
            updateStatus('⏹️ Stopped');
            updateUI(false);
        }
    });
});

// Pop out window
document.getElementById('popOutWindow').addEventListener('click', () => {
    console.log('Pop out window clicked');
    chrome.windows.create({
        url: chrome.runtime.getURL('popup_detached.html'),
        type: 'popup',
        width: 500,
        height: 600,
        focused: true
    }, (window) => {
        console.log('Detached window created:', window.id);
    });
});

// Track displayed translations to avoid duplicates when syncing from storage
let displayedSequences = new Set();

// Listen for storage changes to sync translations (works even when popup is unfocused)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.translationHistory) {
        console.log('Translation history updated in storage, syncing...');
        const newHistory = changes.translationHistory.newValue || [];
        
        // Display any new translations that we haven't shown yet
        newHistory.forEach(item => {
            if (!displayedSequences.has(item.sequence)) {
                displayedSequences.add(item.sequence);
                displayTranslationInDOM(item.original, item.translated, item.language, item.timestamp);
            }
        });
    }
});

// Listen for translation updates (for immediate updates when popup is focused)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    
    if (message.type === 'translation') {
        console.log(`Received translation #${message.sequence}:`, message.original, '->', message.translated);
        
        // Add to queue
        translationQueue.set(message.sequence, {
            original: message.original,
            translated: message.translated,
            language: message.language
        });
        
        // Process queue in order
        processTranslationQueue();
        
    } else if (message.type === 'status') {
        console.log('Status update:', message.text);
        updateStatus(message.text);
    }
});

function processTranslationQueue() {
    // Display all sequential translations starting from nextExpectedSequence
    while (translationQueue.has(nextExpectedSequence)) {
        const translation = translationQueue.get(nextExpectedSequence);
        console.log(`Displaying translation #${nextExpectedSequence} in order`);
        
        displayTranslation(
            translation.original, 
            translation.translated, 
            translation.language,
            nextExpectedSequence
        );
        
        translationQueue.delete(nextExpectedSequence);
        nextExpectedSequence++;
    }
    
    // Log if we're waiting for missing sequences
    if (translationQueue.size > 0) {
        const waitingFor = Array.from(translationQueue.keys()).sort((a, b) => a - b);
        console.log(`Queue has ${translationQueue.size} pending translation(s). Waiting for sequence #${nextExpectedSequence}. Have: ${waitingFor.join(', ')}`);
    }
}

function updateUI(isCapturing) {
    document.getElementById('startCapture').disabled = isCapturing;
    document.getElementById('stopCapture').disabled = !isCapturing;
}

function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}

function displayTranslation(original, translated, language, sequence) {
    const timestamp = new Date().toLocaleTimeString();
    
    // Track that we've displayed this sequence
    displayedSequences.add(sequence);
    
    // Display in DOM
    displayTranslationInDOM(original, translated, language, timestamp);
    
    // Note: background.js now saves to storage, so we don't need to duplicate that here
    // The storage change listener will handle syncing for unfocused windows
}

function displayTranslationInDOM(original, translated, language, timestamp) {
    const outputBox = document.getElementById('translationOutput');
    
    // Clear placeholder text on first translation
    if (outputBox.textContent.includes('Translations will appear')) {
        outputBox.innerHTML = '';
    }
    
    outputBox.innerHTML += `
        <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">
            <div style="color: #999; font-size: 10px;">${timestamp} [${language}]</div>
            <div style="color: #666; margin: 5px 0;"><strong>Original:</strong> ${original}</div>
            <div style="color: #2196F3;"><strong>Translated:</strong> ${translated}</div>
        </div>
    `;
    outputBox.scrollTop = outputBox.scrollHeight;
}
