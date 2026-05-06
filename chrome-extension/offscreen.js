// Offscreen document for audio capture
// Service workers can't access navigator.mediaDevices, so we need this

let mediaRecorder = null;
let audioChunks = [];
let chunkInterval = null;
let audioContext = null;
let mediaStreamSource = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    startCapture(message.streamId, message.chunkDuration)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.action === 'stopCapture') {
    stopCapture();
    sendResponse({ success: true });
  } else if (message.action === 'getChunks') {
    // Convert Blobs to ArrayBuffers for transfer
    Promise.all(audioChunks.map(blob => blob.arrayBuffer()))
      .then(arrayBuffers => {
        const chunks = arrayBuffers.map(buffer => new Uint8Array(buffer));
        audioChunks = []; // Clear after sending
        sendResponse({ chunks: chunks.map(arr => Array.from(arr)) });
      })
      .catch(error => {
        console.error('Error converting chunks:', error);
        sendResponse({ chunks: [] });
      });
    return true;
  }
});

async function startCapture(streamId, chunkDuration = 5000) {
  try {
    console.log('Offscreen: Starting capture with stream ID:', streamId);
    console.log('Offscreen: Chunk duration:', chunkDuration, 'ms');
    
    // Get media stream using the stream ID
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
    
    console.log('Offscreen: Got media stream');
    console.log('Audio tracks:', stream.getAudioTracks().map(t => ({
      label: t.label,
      enabled: t.enabled,
      settings: t.getSettings()
    })));
    
    // Preserve system audio - Chrome mutes tab by default when capturing
    // Create AudioContext to play audio through speakers while recording
    try {
      audioContext = new AudioContext();
      mediaStreamSource = audioContext.createMediaStreamSource(stream);
      mediaStreamSource.connect(audioContext.destination);
      console.log('Offscreen: Audio playback preserved (tab audio will continue playing)');
    } catch (e) {
      console.warn('Offscreen: Could not preserve audio playback:', e);
    }
    
    // Check supported MIME types and choose the best
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus'
    ];
    
    let selectedMime = 'audio/webm';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        console.log('Selected MIME type:', mime);
        break;
      }
    }
    
    // Set up MediaRecorder with high quality settings
    const options = { 
      mimeType: selectedMime,
      audioBitsPerSecond: 128000  // 128 kbps
    };
    console.log('Offscreen: Creating MediaRecorder with options:', options);
    mediaRecorder = new MediaRecorder(stream, options);
    console.log('Offscreen: MediaRecorder state:', mediaRecorder.state);
    console.log('Offscreen: MediaRecorder mimeType:', mediaRecorder.mimeType);
    
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        console.log('Offscreen: Audio chunk received, size:', event.data.size);
      }
    };
    
    mediaRecorder.onstop = () => {
      console.log('Offscreen: MediaRecorder stopped, chunks:', audioChunks.length);
      
      // Notify background script that chunk is ready (don't clear yet!)
      if (audioChunks.length > 0) {
        const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
        chrome.runtime.sendMessage({ 
          type: 'audioChunkReady',
          size: totalSize,
          count: audioChunks.length
        });
      }
      
      // Restart recording for next chunk
      if (mediaRecorder) {
        mediaRecorder.start();
        console.log('Offscreen: Recording restarted for next chunk');
      }
    };
    
    // Start recording
    mediaRecorder.start();
    console.log('Offscreen: Recording started');
    
    // Record in configurable chunks
    if (chunkInterval) {
      clearInterval(chunkInterval);
    }
    chunkInterval = setInterval(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        console.log(`Offscreen: Stopping recorder to collect ${chunkDuration/1000}-second chunk`);
        mediaRecorder.stop();
      }
    }, chunkDuration);
    
  } catch (error) {
    console.error('Offscreen: Error starting capture:', error);
    throw error;
  }
}

function stopCapture() {
  console.log('Offscreen: Stopping capture');
  
  // Clear chunk interval
  if (chunkInterval) {
    clearInterval(chunkInterval);
    chunkInterval = null;
  }
  
  // Stop audio context
  if (mediaStreamSource) {
    mediaStreamSource.disconnect();
    mediaStreamSource = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  mediaRecorder = null;
  console.log('Offscreen: Capture stopped');
}
