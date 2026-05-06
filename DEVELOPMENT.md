# Development Notes

## Project Structure

```
realtime-subs/
├── chrome-extension/       # Chrome extension
│   ├── manifest.json       # Extension configuration
│   ├── background.js       # Service worker (handles tab capture)
│   ├── popup.html/js/css   # Extension UI
│   ├── offscreen.html/js   # Audio processing worker
│   └── icons/              # Extension icons
├── server/                 # FastAPI backend
│   ├── server.py           # WhisperX transcription server
│   ├── pyproject.toml      # Dependencies & configuration
│   └── integration_test.py # Integration testing with real audio
└── README.md               # Main documentation
```

## Testing the Extension

### 1. Load in Chrome

```bash
# Open Chrome and go to:
chrome://extensions/

# Enable Developer Mode (top right)
# Click "Load unpacked"
# Select: /path/to/your/project/chrome-extension
```

### 2. Test with YouTube

1. Open a YouTube video
2. Click the extension icon
3. Configure settings
4. Click "Start Capture"
5. Play the video
6. Watch the extension popup for activity

## Current Implementation Status

### ✅ Working
- Chrome extension structure
- Audio capture from tabs
- FastAPI server with WhisperX transcription
- Word-level timestamps with phoneme alignment
- Built-in English translation
- Real-time processing of 1-second audio chunks (configurable)
- Settings persistence
- Clean UI with status indicators
- GPU acceleration support
- Source language parameter for improved speed
- Audio format compatibility (webm → WhisperX)
- Error handling

### 🔄 To Implement
- Audio format conversion (webm → wav/mp3)
- Better chunk timing and overlap
- Translation history with export
- Subtitle overlay on video
- Multi-tab support
- WebSocket streaming for lower latency
## Audio Format Processing

The server handles audio format conversion automatically using ffmpeg. Chrome captures audio as `audio/webm`, which is converted server-side before being processed by WhisperX.

### Current Flow
1. Extension captures audio as WebM chunks (1 second default, configurable)
2. Server receives chunks via HTTP POST
3. Server uses ffmpeg to convert WebM → format WhisperX accepts
4. WhisperX processes audio with alignment and returns transcription
5. Built-in translation to English
6. Results sent back to extension

## Development Workflow

### Setting Up

```bash
cd server

# Install all dependencies (WhisperX + PyTorch + dependencies)
uv sync
```

### Extension Development

To modify the extension:

1. Make changes to files in `chrome-extension/`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Server Development

To modify the server:

1. Make changes to files in `server/`
2. Restart the server:
   ```bash
   # Production mode
   uv run server.py
   
   # Development mode with auto-reload
   uv run uvicorn server:app --reload
   ```
3. Test with the extension or `curl`
## Testing Checklist

- [x] Extension loads without errors
- [x] Icons display correctly
- [x] Popup UI renders properly
- [x] Settings save and load
- [x] Audio capture starts
- [x] Audio chunks are created and sent
- [x] Server processes WebM audio
- [x] WhisperX transcription works
- [x] Word-level alignment works
- [x] Built-in English translation works
- [x] Source language parameter improves speed
- [x] Results display in popup
- [ ] Long session stability
- [ ] Multiple tab support

## Debug Commands

```bash
# Test the server health
curl http://localhost:8000/health

# Test audio processing with real Korean audio
uv run integration_test.py sample-korean.wav English ko
```

## Known Limitations

- Short chunks might miss context between segments (configurable 1-15 seconds)
- No overlap between chunks
- Single tab capture at a time
- No persistent translation history
- Chrome/Chromium browsers only
- Requires internet for first-time model download (~1.5GB)
