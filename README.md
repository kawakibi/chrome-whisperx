# Chrome-WhisperX

A complete solution for capturing audio from browser tabs (like YouTube videos, live streaming or any other audio source) and translating it in real-time using [WhisperX](https://github.com/m-bain/whisperX).


## 🎯 Background

Watching live streams or videos in foreign languages can be challenging without proper subtitles. Existing solutions often require downloading videos, manual transcription, or relying on auto-generated captions that may not exist or are inaccurate. This project was created (vibe coded) to solve that problem by:

- **Real-time processing**: Get translations as the audio plays, no need to wait for the entire video
- **Universal compatibility**: Works with any browser tab - YouTube, Twitch, podcasts, video calls, or any audio source
- **Local and private**: All processing happens on your machine, no third-party services required
- **High accuracy**: Uses WhisperX for state-of-the-art speech recognition with word-level alignment

Whether you're watching international content, following live streams, or trying to understand foreign language media, this tool makes it instantly accessible. 

Tested using the WhisperX medium model on an NVIDIA GeForce RTX 2060, it can transcribe and translate in real-time with low latency.

## 🏗️ Architecture

```
Browser Tab (YouTube, etc.)
      ↓ (audio capture)
Chrome Extension
      ↓ (HTTP POST audio chunks)
FastAPI Server
      ↓ (WhisperX transcription)
Text Transcription
      ↓ (translation)
English Translation (built-in WhisperX)
      ↓ (WebSocket/HTTP)
Chrome Extension Display
```

## ✨ Features

- 🎵 **Audio Capture**: Capture audio from any browser tab
- 🗣️ **Speech-to-Text**: WhisperX (medium model) with alignment for accurate transcription
- 🌐 **Translation**: Built-in English translation
- ⚡ **Real-time**: Process audio in 1-second chunks (default, configurable)
- 🎨 **Clean UI**: Chrome extension with easy-to-use interface
- 🖥️ **GPU Accelerated**: 2-3x faster with NVIDIA GPU support

## 📋 Prerequisites

- **Python 3.12** (specifically >=3.12, <3.13)
- **uv** - Fast Python package installer ([install guide](https://github.com/astral-sh/uv))
- **System libraries** for audio processing (see installation below)
- **Chrome** or Chromium-based browser

## 🚀 Quick Start

### Step 1: Install uv

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Step 2: Set Up the API Server

```bash
cd server

# Install dependencies
uv sync

# Install system dependencies (required for audio processing)
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS:
brew install ffmpeg
```

**GPU Support**: WhisperX automatically detects and uses NVIDIA GPU if available for 2-3x faster processing.

### Step 3: Start the Server

```bash
# From server directory
uv run server.py
```

Server will start on `http://localhost:8000`

**Auto-detection**: Server automatically uses GPU if available, falls back to CPU otherwise.
- 🚀 GPU mode: "GPU detected: NVIDIA GeForce RTX 2060"
- 💻 CPU mode: "PyTorch not found, using CPU"

### Step 4: Install Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this project
5. Extension icon should appear in toolbar

### Step 5: Configure Settings

1. Click the extension icon
2. Configure settings:
   - **Server URL**: `http://localhost:8000`
   - **Target Language**: `English`
3. Click **Save Settings**

### Step 6: Test It!

1. Open a YouTube video
2. Click the extension icon
3. Click **Start Capture**
4. Play the video/audio
5. Watch translations appear in the popup!

## 📁 Project Structure

```
realtime-subs/
├── chrome-extension/   # Chrome extension (68KB)
│   ├── manifest.json   # Extension manifest
│   ├── background.js   # Service worker
│   ├── popup.html/js/css # Extension UI
│   ├── offscreen.html/js # Audio processing
│   └── icons/          # Extension icons
├── server/             # FastAPI server
│   ├── server.py       # FastAPI application with WhisperX
│   ├── pyproject.toml  # Dependencies & configuration
│   └── integration_test.py # Integration testing utility
├── README.md           # This file
└── DEVELOPMENT.md      # Development notes
```

## 🔌 API Endpoints

The server provides the following endpoints:

### `GET /`
API information and status

### `GET /health`
Health check endpoint

### `POST /process` ⭐ Main Endpoint
Complete pipeline: transcribe and translate audio in one call.

**Parameters:**
- `audio` (file): Audio file (webm, mp3, wav, etc.)
- `target_language` (form): Target language (default: "English")
- `source_language` (form): Source language hint (optional, improves speed)

**Example:**
```bash
curl -X POST http://localhost:8000/process \
  -F "audio=@recording.webm" \
  -F "target_language=English"
```

**Interactive API Docs**: Visit http://localhost:8000/docs for Swagger UI

## 🎯 How It Works

### Audio Capture
The Chrome extension uses the `chrome.tabCapture` API to capture audio from the active tab. Audio is recorded in 1-second (default, configurable) chunks and sent to the API server.

### Transcription
The FastAPI server receives audio chunks and uses **WhisperX** (medium model) to convert speech to text. WhisperX provides:
- Fast GPU-accelerated transcription (2-4x faster than original Whisper)
- Automatic language detection
- Word-level timestamps with phoneme alignment
- 10% faster when source language is specified

### Translation

WhisperX includes built-in translation to English:
- Fast and efficient
- Runs on the same GPU/CPU as transcription
- No additional models or services required
- Best results with clear audio

## 🔧 Advanced Usage

### Improving Performance

**GPU Acceleration**
- WhisperX automatically detects and uses NVIDIA GPU
- 2-3x faster than CPU-only mode
- Server logs will show: "🚀 GPU detected: [GPU name]"

**Source Language Hint**
- Specify source language in extension settings (e.g., "ko" for Korean, "ja" for Japanese)
- Improves transcription speed by ~10%
- Improves accuracy for the specified language

**Chunk Duration**
- Default: 1 second per chunk (configurable 1-15 seconds in extension settings)
- Longer chunks: More context but slower processing
- Shorter chunks: Faster updates but may cut words mid-sentence

## ⚡ Performance

### WhisperX Model: medium
- **Implementation**: Optimized Whisper with word-level alignment
- **Size**: ~1.5GB download on first run
- **Accuracy**: Excellent for most languages with phoneme-based alignment

### Hardware Requirements
- **Tested GPU**: NVIDIA GeForce RTX 2060

### Testing the API

```bash
cd server

# Health check
curl http://localhost:8000/health

# Process audio
curl -X POST http://localhost:8000/process \
  -F "audio=@test.webm" \
  -F "target_language=English"

# Test with integration script
uv run integration_test.py sample-korean.wav English ko
```

## 🐛 Troubleshooting

### Server Issues

**"Whisper model not loaded"**
- Server is loading the model (wait 30-60 seconds)
- First run downloads WhisperX model (~1.5GB)
- Ensure enough RAM (~4GB for medium model)

**"ffmpeg not found" or audio processing errors**
- Install complete dependencies:
  ```bash
  # Ubuntu/Debian:
  sudo apt-get install -y ffmpeg libavformat-dev libavcodec-dev \
    libavdevice-dev libavutil-dev libavfilter-dev libswscale-dev \
    libswresample-dev pkg-config
  
  # macOS:
  brew install ffmpeg pkg-config
  ```
- Restart terminal and server

**Server won't start**
- Check if port 8000 is in use: `lsof -i :8000`
- Kill existing process: `kill -9 <PID>`
- Or change port in server.py (default: 8000)

### Extension Issues

**"Failed to capture tab audio"**
- Ensure audio is playing BEFORE clicking "Start Capture"
- Grant permissions when prompted
- Try refreshing the page

**"API Server error"**
- Verify server is running: `curl http://localhost:8000/health`
- Check server URL in extension settings
- Look at browser console (F12) for detailed errors

**No translations appearing**
- Check if audio is actually playing
- Verify audio chunks are being sent (check console logs)
- Ensure server is processing (check server logs)
- Test with a YouTube video with clear speech

### Translation Quality Issues

**Poor transcription quality**
- Audio might be too quiet or noisy
- Try with clearer audio source
- Specify source language for better accuracy
- Consider using larger WhisperX model (large vs medium)

**Incorrect translations**
- Built-in translation is optimized for English
- Ensure audio quality is good for best results
- Word-level alignment improves accuracy automatically

## 🚧 Known Limitations

- Short chunks (1 second) may cut words mid-sentence
- No overlap between chunks (might miss context)
- Single tab capture at a time
- Translation only supports English as target language
- Chrome/Chromium browsers only

## 💡 Use Cases

- **Learning**: Watch foreign language videos with translations
- **Accessibility**: Real-time captions for hearing impaired
- **Content Creation**: Quick transcripts of videos
- **Research**: Analyze foreign language content
- **Entertainment**: Watch content in any language

## Development

To modify the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## Acknowledgements

- **[WhisperX](https://github.com/m-bain/whisperX)** - Fast automatic speech recognition with word-level timestamps and speaker diarization
- **[OpenAI Whisper](https://github.com/openai/whisper)** - Robust speech recognition model that started it all
- **[FastAPI](https://fastapi.tiangolo.com/)** - Modern, fast web framework for building the API server
- **[PyTorch](https://pytorch.org/)** - Deep learning framework powering the transcription models
- **[Chrome Extensions API](https://developer.chrome.com/docs/extensions/)** - Especially the tabCapture API for audio streaming
- **[uv](https://github.com/astral-sh/uv)** - Blazing fast Python package installer and resolver
- **[ffmpeg](https://ffmpeg.org/)** - Essential multimedia framework for audio processing

## License

MIT License - Feel free to modify and use as needed.

## Contributing

Contributions welcome! Areas for improvement:
- Better chunk overlap strategies
- UI/UX enhancements
- Performance optimizations
- Translation history and export features
