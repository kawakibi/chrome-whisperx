#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "httpx>=0.28.1",
# ]
# ///
"""
Integration test for WhisperX server
Tests the /process endpoint with real audio files

Usage: uv run integration_test.py <audio_file> <target_language> [source_language]
Example: uv run integration_test.py sample-korean.wav English ko
"""
import httpx
import sys
import asyncio

async def test_whisperx_server(audio_file: str, target_language: str = "English", source_language: str = None):
    """Test the WhisperX server with an audio file"""
    
    server_url = "http://localhost:8000"
    
    print(f"🎵 Testing WhisperX server with audio file: {audio_file}")
    print(f"🌐 Server URL: {server_url}")
    if source_language:
        print(f"🎤 Source language: {source_language}")
    print(f"🎯 Target language: {target_language}\n")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Health check
        print("Checking server health...")
        health_response = await client.get(f"{server_url}/health")
        print(f"✅ Server is healthy: {health_response.json()}\n")
        
        # Process audio
        print("Processing audio...")
        with open(audio_file, "rb") as f:
            files = {"audio": (audio_file, f, "audio/wav")}
            data = {"target_language": target_language}
            
            # Add source_language if provided
            if source_language:
                data["source_language"] = source_language
            
            response = await client.post(
                f"{server_url}/process",
                files=files,
                data=data
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Success!\n")
                print(f"📝 Transcription ({result['transcription']['language']}):")
                print(f"   {result['transcription']['text']}\n")
                print(f"🌍 Translation ({target_language}):")
                print(f"   {result['translation']['text']}")
            else:
                print(f"❌ HTTP error: {response.status_code}")
                print(f"Response: {response.text}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run integration_test.py <audio_file> [target_language] [source_language]")
        sys.exit(1)
    
    audio_file = sys.argv[1]
    target_language = sys.argv[2] if len(sys.argv) > 2 else "English"
    source_language = sys.argv[3] if len(sys.argv) > 3 else None
    
    asyncio.run(test_whisperx_server(audio_file, target_language, source_language))
