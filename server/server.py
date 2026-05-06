"""
FastAPI server for audio transcription and translation
Uses WhisperX for speech-to-text (faster and more accurate than openai-whisper)
Built-in translation to English via WhisperX
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import whisperx
import tempfile
import os
import logging
from typing import Optional
import time
import torch

# Configure logging with timestamps
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# Global Whisper model
whisper_model = None
device = None
compute_type = None

# Alignment model cache (loaded per language as needed)
align_models = {}  # {language_code: (model, metadata)}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup: Load Whisper model
    global whisper_model, device, compute_type
    logger.info("Loading WhisperX model...")
    try:
        # Detect device
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
            logger.info(f"🚀 GPU detected: {torch.cuda.get_device_name(0)}")
        else:
            device = "cpu"
            compute_type = "int8"
            logger.info("💻 No GPU detected, using CPU")
        
        # Load WhisperX model
        whisper_model = whisperx.load_model(
            "medium",
            device,
            compute_type=compute_type
        )
        logger.info(f"✅ WhisperX model loaded successfully on {device.upper()}")
    except Exception as e:
        logger.error(f"❌ Failed to load WhisperX model: {e}")
        raise
    
    yield  # Server runs here
    
    # Shutdown: cleanup if needed
    logger.info("Shutting down...")


app = FastAPI(title="Realtime Audio Translator API (WhisperX)", lifespan=lifespan)

# Enable CORS for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your extension ID
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """API info endpoint"""
    return {
        "status": "running",
        "service": "Realtime Audio Translator",
        "whisper_model": "medium (whisperx)",
        "endpoint": "/process - Transcribe and translate audio"
    }


@app.post("/process")
async def process_audio(
    audio: UploadFile = File(...),
    target_language: str = Form("English"),
    source_language: Optional[str] = Form(None)
):
    """
    Complete pipeline: Transcribe and translate audio in one call
    
    Args:
        audio: Audio file
        target_language: Target language for translation (currently only English supported)
        source_language: Optional source language code (e.g., 'ko', 'ja', 'es')
    
    Returns:
        JSON with both transcription and translation
    """
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="WhisperX model not loaded")
    
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        start_time = time.time()
        logger.info(f"Processing audio: {audio.filename} ({len(content)} bytes)")
        
        # Step 1: Transcribe with WhisperX
        transcribe_start = time.time()
        
        # Load audio
        audio_data = whisperx.load_audio(temp_path)
        
        # Transcribe
        result = whisper_model.transcribe(
            audio_data,
            language=source_language,
            batch_size=16  # WhisperX batching for speed
        )
        
        detected_language = result.get('language', 'unknown')
        
        # Step 1.5: Align with language-specific model for better accuracy
        # This provides word-level timestamps and improves transcription quality
        try:
            # Check if we have alignment model for this language
            if detected_language not in align_models:
                logger.info(f"Loading alignment model for language: {detected_language}")
                align_model, align_metadata = whisperx.load_align_model(
                    language_code=detected_language,
                    device=device
                )
                align_models[detected_language] = (align_model, align_metadata)
                logger.info(f"✅ Alignment model loaded for {detected_language}")
            else:
                align_model, align_metadata = align_models[detected_language]
            
            # Apply alignment to improve accuracy
            logger.info("Applying alignment for improved accuracy...")
            result = whisperx.align(
                result["segments"],
                align_model,
                align_metadata,
                audio_data,
                device,
                return_char_alignments=False
            )
            logger.info("✅ Alignment applied successfully")
        except Exception as e:
            logger.warning(f"Alignment failed (language may not be supported): {e}")
            logger.info("Continuing with unaligned transcription...")
        
        # Extract text from segments
        transcribed_text = " ".join([segment['text'] for segment in result['segments']]).strip()
        transcribe_time = time.time() - transcribe_start
        
        logger.info(f"✅ Transcribed in {transcribe_time:.2f}s: '{transcribed_text[:100]}...'")
        
        # Step 2: Translate
        translate_start = time.time()
        translated_text = transcribed_text
        
        if target_language.lower() == "english" and detected_language != 'en':
            # Use WhisperX's translation to English
            logger.info("Using WhisperX translation to English")
            # Reload audio and transcribe with task="translate"
            result_en = whisper_model.transcribe(
                audio_data,
                task="translate",
                batch_size=16
            )
            translated_text = " ".join([segment['text'] for segment in result_en['segments']]).strip()
        elif detected_language == 'en' and target_language.lower() == 'english':
            # Already in English, no translation needed
            logger.info("Text already in English, no translation needed")
        else:
            # Non-English target not supported
            logger.warning(f"Target language '{target_language}' not supported, only English is available")
            translated_text = transcribed_text
        
        translate_time = time.time() - translate_start
        total_time = time.time() - start_time
        
        # Clean up
        os.unlink(temp_path)
        
        logger.info(f"✅ Translation complete in {translate_time:.2f}s: '{translated_text[:100]}...'")
        logger.info(f"⏱️  Total processing time: {total_time:.2f}s (transcribe: {transcribe_time:.2f}s, translate: {translate_time:.2f}s)")
        
        return {
            "success": True,
            "transcription": {
                "text": transcribed_text,
                "language": detected_language
            },
            "translation": {
                "text": translated_text,
                "target_language": target_language
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Processing error: {e}")
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "whisper_loaded": whisper_model is not None,
        "model": "whisper-medium (whisperx)",
        "device": device
    }


def main():
    """Entry point for the server"""
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
