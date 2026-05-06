let isCapturing = false;
let processingInterval = null;
let offscreenDocumentCreated = false;
let chunkSequence = 0; // Track chunk order for FIFO display

// Log available APIs on startup
console.log('=== Extension Service Worker Started ===');
console.log('Chrome APIs available:');
console.log('- chrome.runtime:', !!chrome.runtime);
console.log('- chrome.storage:', !!chrome.storage);  
console.log('- chrome.tabs:', !!chrome.tabs);
console.log('- chrome.tabCapture:', !!chrome.tabCapture);
if (chrome.tabCapture) {
    console.log('- chrome.tabCapture methods:', Object.keys(chrome.tabCapture));
}
console.log('- chrome.offscreen:', !!chrome.offscreen);
console.log('=======================================');

// Create offscreen document for audio capture
async function setupOffscreenDocument() {
    try {
        // Close existing offscreen document if it exists (to get fresh code)
        if (offscreenDocumentCreated) {
            try {
                await chrome.offscreen.closeDocument();
                console.log('Closed old offscreen document');
            } catch (e) {
                // Ignore errors if document doesn't exist
            }
            offscreenDocumentCreated = false;
        }
        
        // Create new offscreen document
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Audio capture from tab for transcription'
        });
        offscreenDocumentCreated = true;
        console.log('Offscreen document created (fresh)');
    } catch (error) {
        console.error('Error creating offscreen document:', error);
        throw error;
    }
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    if (message.action === 'startCapture') {
        // Check if tabCapture API is available
        if (!chrome.tabCapture) {
            console.error('tabCapture API not available!');
            sendResponse({ 
                success: false, 
                error: 'tabCapture API not available. Make sure the extension has proper permissions.' 
            });
            return true;
        }
        
        startAudioCapture(message.tabId)
            .then(() => {
                console.log('Capture started successfully');
                sendResponse({ success: true });
            })
            .catch(error => {
                console.error('Failed to start capture:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Required for async response
    } else if (message.action === 'stopCapture') {
        stopAudioCapture();
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'audioChunkReady') {
        // Offscreen document notifying that 10-second audio chunk is ready
        console.log('Audio chunk ready! Size:', message.size, 'bytes, chunks:', message.count);
        
        // Process the chunk immediately
        processAudioChunk().catch(err => {
            console.error('Error processing chunk:', err);
        });
    }
});

async function startAudioCapture(tabId) {
    try {
        console.log('Starting audio capture for tab:', tabId);
        
        // Reset sequence counter when starting new capture
        chunkSequence = 0;
        
        // Get settings for chunk duration
        const settings = await chrome.storage.local.get(['chunkDuration']);
        const chunkDuration = (settings.chunkDuration || 1) * 1000; // Convert to ms
        console.log(`Using chunk duration: ${chunkDuration}ms`);
        
        // Ensure offscreen document exists
        await setupOffscreenDocument();
        
        // Get stream ID using getMediaStreamId
        const streamId = await new Promise((resolve, reject) => {
            chrome.tabCapture.getMediaStreamId(
                { targetTabId: tabId },
                (streamId) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (!streamId) {
                        reject(new Error('Failed to get stream ID'));
                    } else {
                        resolve(streamId);
                    }
                }
            );
        });
        
        console.log('Got stream ID:', streamId);
        
        // Send stream ID to offscreen document to start recording
        await chrome.runtime.sendMessage({
            action: 'startCapture',
            streamId: streamId
        });
        
        console.log('Offscreen document started recording');
        isCapturing = true;
        await chrome.storage.local.set({ isCapturing: true });
        
        console.log('Audio capture started - waiting for 10-second chunks');
        
    } catch (error) {
        console.error('Error starting capture:', error);
        throw error;
    }
}

function stopAudioCapture() {
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }
    
    // Tell offscreen document to stop
    chrome.runtime.sendMessage({ action: 'stopCapture' }).catch(() => {
        // Offscreen document might not exist, that's ok
    });
    
    isCapturing = false;
    chrome.storage.local.set({ isCapturing: false });
    
    console.log('Audio capture stopped');
}

async function processAudioChunk() {
    try {
        // Assign sequence number to this chunk
        const currentSequence = chunkSequence++;
        console.log(`Processing chunk #${currentSequence}`);
        
        // Get audio chunks from offscreen document
        const response = await chrome.runtime.sendMessage({ action: 'getChunks' });
        
        if (!response || !response.chunks || response.chunks.length === 0) {
            console.log('No audio chunks available');
            return;
        }
        
        console.log('Received', response.chunks.length, 'chunks');
        
        // Convert arrays back to Uint8Array and create blob
        const uint8Arrays = response.chunks.map(arr => new Uint8Array(arr));
        const audioBlob = new Blob(uint8Arrays, { type: 'audio/webm' });
        
        console.log('Processing audio chunk, size:', audioBlob.size);
        
        // Skip very small chunks (likely no audio)
        if (audioBlob.size < 1000) {
            console.log('Chunk too small, skipping');
            return;
        }
        
        // Send to FastAPI server with sequence number
        await sendToAPIServer(audioBlob, currentSequence);
        
    } catch (error) {
        console.error('Error processing audio chunk:', error);
        sendStatusUpdate('Error processing audio: ' + error.message);
    }
}

async function sendToAPIServer(audioBlob, sequence) {
    try {
        // Get settings from storage
        const settings = await chrome.storage.local.get([
            'serverUrl',
            'sourceLanguage',
            'targetLanguage'
        ]);
        
        const serverUrl = settings.serverUrl || 'http://localhost:8000';
        const sourceLanguage = settings.sourceLanguage || '';
        const targetLanguage = settings.targetLanguage || 'English';
        
        console.log('Sending to API server:', serverUrl);
        
        // Create FormData with audio and settings
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');
        formData.append('target_language', targetLanguage);
        
        // Add source language if specified (skip auto-detection for faster processing)
        if (sourceLanguage) {
            formData.append('source_language', sourceLanguage);
            console.log('Using source language:', sourceLanguage);
        }
        
        // Send to /process endpoint for complete pipeline
        const response = await fetch(`${serverUrl}/process`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Server error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Processing failed');
        }
        
        console.log(`Chunk #${sequence} - Transcription:`, data.transcription.text);
        console.log(`Chunk #${sequence} - Translation:`, data.translation.text);
        
        // Save translation to storage (more reliable than runtime messages for unfocused popups)
        const timestamp = new Date().toLocaleTimeString();
        chrome.storage.local.get(['translationHistory'], (result) => {
            let history = result.translationHistory || [];
            history.push({
                timestamp,
                sequence,
                original: data.transcription.text,
                translated: data.translation.text,
                language: data.transcription.language
            });
            
            // Keep only last 50 translations
            if (history.length > 50) {
                history = history.slice(-50);
            }
            
            chrome.storage.local.set({ translationHistory: history });
        });
        
        // Also send runtime message for immediate updates when popup is focused
        chrome.runtime.sendMessage({
            type: 'translation',
            sequence: sequence,
            original: data.transcription.text,
            translated: data.translation.text,
            language: data.transcription.language
        });
        
    } catch (error) {
        console.error('Error sending to API server:', error);
        sendStatusUpdate('Error: ' + error.message);
    }
}

function sendStatusUpdate(text) {
    chrome.runtime.sendMessage({
        type: 'status',
        text: text
    });
}

// Clean up on extension unload
chrome.runtime.onSuspend.addListener(() => {
    stopAudioCapture();
});
