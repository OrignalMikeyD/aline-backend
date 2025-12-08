# Aline Voice Backend

WebSocket server powering Aline's voice chat for Persona iO.

## Stack
- **Deepgram** - Speech-to-text (Nova-2)
- **Anthropic Claude** - AI responses
- **ElevenLabs** - Text-to-speech

## Deploy to Railway

### 1. Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub and select this repo

### 2. Add Environment Variables
In Railway dashboard → Variables tab, add:

| Variable | Value |
|----------|-------|
| `DEEPGRAM_API_KEY` | Your Deepgram API key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | `knPeAXsHZ6FVdoLHMtRJ` |
| `MODEL_NAME` | `claude-sonnet-4-20250514` |
| `SYSTEM_PROMPT` | See .env.example |

### 3. Deploy
Railway auto-deploys on push. Your WebSocket URL will be:
```
wss://your-project-name.up.railway.app
```

## API Endpoints

- `GET /` - Service info
- `GET /health` - Health check
- `WebSocket /` - Voice chat connection

## WebSocket Protocol

### Client → Server
- Binary audio data (PCM 16kHz mono or WebM)
- `{ "type": "ping" }` - Keep-alive

### Server → Client
- `{ "type": "status", "message": "listening|thinking" }`
- `{ "type": "transcript", "text": "...", "isFinal": bool }`
- `{ "type": "response_text", "text": "..." }`
- `{ "type": "response_complete" }`
- Binary audio data (MP3)

## Local Development

```bash
npm install
cp .env.example .env
# Fill in your API keys
npm start
```

Server runs on `ws://localhost:3002`
