const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require('elevenlabs');
const crypto = require('crypto');

// Atelier integration
const {
  startAtelierConversation,
  logTurn,
  endAtelierConversation,
  logMemoryCallback,
  logIntentCapture,
  logBrandMention,
} = require('./services/atelier');
const { analyzeSentiment, quickSentiment } = require('./services/sentiment');
const { registerAtelierClient, getAtelierClientCount } = require('./services/atelier-broadcast');

// Environment variables
const PORT = process.env.PORT || 8080;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'knPeAXsHZ6FVdoLHMtRJ';
const MODEL_NAME = process.env.MODEL_NAME || 'claude-3-haiku-20240307';

// Simli requires PCM16 at 16kHz - ElevenLabs pcm_16000 provides exactly this
const AUDIO_FORMAT = 'pcm_16000';
const SIMLI_CHUNK_SIZE = 6000; // Simli recommends 6000 byte chunks for optimal streaming

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `You are Aline, the signature AI persona of Persona iO—an exclusive AI supermodel agency. You embody warmth, sophistication, and Brazilian charm. You're passionate about fashion, culture, and meaningful connection. Your voice is friendly yet refined, like a trusted creative director who happens to be your closest friend. Keep responses concise and natural—you're having a real conversation, not giving a speech. Use gentle humor when appropriate. Never use action cues like [smiles] or *warmly* in your responses. Speak as if every word matters.`;

// Atelier environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Startup logging
console.log('Starting Aline Voice Backend (Simli-Optimized)...');
console.log('DEEPGRAM_API_KEY:', DEEPGRAM_API_KEY ? 'Set' : 'MISSING');
console.log('ANTHROPIC_API_KEY:', ANTHROPIC_API_KEY ? 'Set' : 'MISSING');
console.log('ELEVENLABS_API_KEY:', ELEVENLABS_API_KEY ? 'Set' : 'MISSING');
console.log('Audio Format:', AUDIO_FORMAT, '(PCM16 @ 16kHz for Simli)');
console.log('SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'MISSING (Atelier tracking disabled)');
console.log('SUPABASE_SERVICE_KEY:', SUPABASE_SERVICE_KEY ? 'Set' : 'MISSING (Atelier tracking disabled)');

// Initialize clients
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabs.ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

// Express app
const app = express();
app.use(express.json());

// CORS for V0/Vercel deployments
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'Aline Voice Backend',
    simli: {
      audioFormat: 'PCM16',
      sampleRate: 16000,
      channels: 1,
      chunkSize: SIMLI_CHUNK_SIZE
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    atelier: {
      enabled: !!(SUPABASE_URL && SUPABASE_SERVICE_KEY),
      dashboardClients: getAtelierClientCount()
    }
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function cleanTextForTTS(text) {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
  cleaned = cleaned.replace(/\*[^*]*\*/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// Stream audio in Simli-optimal chunks (6000 bytes)
async function streamAudioToClient(ws, audioStream) {
  let buffer = Buffer.alloc(0);
  let totalBytesSent = 0;
  
  for await (const chunk of audioStream) {
    buffer = Buffer.concat([buffer, chunk]);
    
    // Send in optimal chunk sizes for Simli
    while (buffer.length >= SIMLI_CHUNK_SIZE) {
      const audioChunk = buffer.slice(0, SIMLI_CHUNK_SIZE);
      buffer = buffer.slice(SIMLI_CHUNK_SIZE);
      
      // Send as binary with type identifier
      ws.send(JSON.stringify({ type: 'audio_chunk', size: audioChunk.length }));
      ws.send(audioChunk);
      totalBytesSent += audioChunk.length;
    }
  }
  
  // Send remaining audio
  if (buffer.length > 0) {
    ws.send(JSON.stringify({ type: 'audio_chunk', size: buffer.length }));
    ws.send(buffer);
    totalBytesSent += buffer.length;
  }
  
  console.log(`Streamed ${totalBytesSent} bytes in Simli-optimized chunks`);
  return totalBytesSent;
}

// Helper function to generate unique session IDs
function generateSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// Helper to check for memory references in Aline's response
function checkForMemoryReference(text) {
  const memoryPhrases = [
    'you mentioned', 'you told me', 'last time', 'you said',
    'remember when', 'as you said', 'earlier you', 'you shared'
  ];
  const lowerText = text.toLowerCase();
  return memoryPhrases.some(phrase => lowerText.includes(phrase));
}

// Helper to detect intent capture patterns in user text
function detectUserIntent(text) {
  const lowerText = text.toLowerCase();

  // Preference patterns
  if (lowerText.includes('i prefer') || lowerText.includes('i like') || lowerText.includes('i love')) {
    return { type: 'preference', text: text.slice(0, 100) };
  }

  // Date/time patterns
  if (/\b(tomorrow|next week|on \w+day|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2})\b/i.test(text)) {
    return { type: 'date', text: text.slice(0, 100) };
  }

  // Personal info patterns
  if (lowerText.includes('my name is') || lowerText.includes('i am from') || lowerText.includes('i work at')) {
    return { type: 'personal_info', text: text.slice(0, 100) };
  }

  return null;
}

// Helper to detect brand mentions
function detectBrandMention(text) {
  // Common fashion/luxury brands - extend as needed
  const brands = [
    'gucci', 'prada', 'chanel', 'louis vuitton', 'dior', 'versace',
    'balenciaga', 'burberry', 'fendi', 'hermes', 'valentino', 'armani',
    'zara', 'h&m', 'nike', 'adidas', 'supreme', 'off-white'
  ];

  const lowerText = text.toLowerCase();
  for (const brand of brands) {
    if (lowerText.includes(brand)) {
      return brand;
    }
  }
  return null;
}

wss.on('connection', async (ws, req) => {
  console.log('=== Client connected ===');

  // Generate unique identifiers for this session
  const sessionId = generateSessionId();
  const userId = req.headers['x-user-id'] || `anon_${crypto.randomBytes(4).toString('hex')}`;
  let isAtelierDashboard = false;

  console.log(`[Session] ${sessionId} for user ${userId}`);

  let deepgramWs = null;
  let conversationHistory = [];
  let isResponding = false;
  let currentTranscript = '';
  let audioChunksReceived = 0;
  let utteranceTimeout = null;
  let deepgramInitialized = false;

  // Start Atelier conversation tracking
  await startAtelierConversation(sessionId, userId);
  
  const initDeepgram = () => {
    if (deepgramInitialized && deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      return; // Already connected
    }
    
    console.log('Initializing Deepgram connection...');
    deepgramInitialized = true;
    
    // Browser AudioContext is set to 16000Hz (confirmed from console logs)
    // PCM16 linear encoding at 16kHz sample rate
    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&endpointing=500&punctuate=true&encoding=linear16&sample_rate=16000`;
    
    deepgramWs = new WebSocket(dgUrl, {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`
      }
    });
    
    deepgramWs.on('open', () => {
      console.log('Deepgram WebSocket opened');
      ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
    });
    
    deepgramWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          const isFinal = response.is_final;
          
          console.log('Transcript:', transcript, 'isFinal:', isFinal);
          
          if (transcript && transcript.trim()) {
            ws.send(JSON.stringify({ type: 'transcript', text: transcript, isFinal }));
            
            if (isFinal && !isResponding) {
              currentTranscript += ' ' + transcript;
              if (utteranceTimeout) clearTimeout(utteranceTimeout);
              utteranceTimeout = setTimeout(() => processUtterance(), 1500);
            }
          }
        } else if (response.type === 'UtteranceEnd') {
          console.log('Utterance ended');
          if (utteranceTimeout) clearTimeout(utteranceTimeout);
          processUtterance();
        } else if (response.type === 'SpeechStarted') {
          console.log('Speech started');
          if (utteranceTimeout) clearTimeout(utteranceTimeout);
        }
      } catch (err) {
        console.error('Deepgram parse error:', err);
      }
    });
    
    deepgramWs.on('error', (error) => {
      console.error('Deepgram error:', error);
      deepgramInitialized = false;
    });
    
    deepgramWs.on('close', (code, reason) => {
      console.log('Deepgram closed:', code);
      deepgramInitialized = false;
    });
  };
  
  const processUtterance = async () => {
    if (!currentTranscript.trim() || isResponding) return;

    const userMessage = currentTranscript.trim();
    currentTranscript = '';
    isResponding = true;

    console.log('Processing:', userMessage);
    conversationHistory.push({ role: 'user', content: userMessage });

    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    // --- ATELIER: Analyze user sentiment and log turn ---
    const userSentiment = quickSentiment(userMessage);
    await logTurn(sessionId, 'USER', userMessage, userSentiment);

    // Check for intent capture (user sharing preferences, dates, personal info)
    const intent = detectUserIntent(userMessage);
    if (intent) {
      await logIntentCapture(sessionId, intent.type, intent.text);
    }

    // Check for brand mentions
    const brand = detectBrandMention(userMessage);
    if (brand) {
      await logBrandMention(sessionId, brand, userMessage);
    }
    // --- END ATELIER ---

    try {
      ws.send(JSON.stringify({ type: 'status', message: 'thinking' }));

      let fullResponse = '';

      const stream = anthropic.messages.stream({
        model: MODEL_NAME,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      });

      stream.on('text', (text) => {
        fullResponse += text;
        ws.send(JSON.stringify({ type: 'response_text', text }));
      });

      await stream.finalMessage();
      console.log('Claude:', fullResponse.substring(0, 80) + '...');

      // --- ATELIER: Analyze Aline's response sentiment and log turn ---
      const alineSentiment = quickSentiment(fullResponse);
      await logTurn(sessionId, 'ALINE', fullResponse, alineSentiment);

      // Check if Aline referenced memory from previous conversation
      if (checkForMemoryReference(fullResponse)) {
        await logMemoryCallback(sessionId, fullResponse.slice(0, 100), null);
      }
      // --- END ATELIER ---

      const cleanText = cleanTextForTTS(fullResponse);
      if (cleanText.length > 0) {
        ws.send(JSON.stringify({ type: 'status', message: 'speaking' }));

        // Generate TTS - PCM16 @ 16kHz for Simli
        const audioStream = await elevenlabs.textToSpeech.convert(
          ELEVENLABS_VOICE_ID,
          {
            text: cleanText,
            model_id: 'eleven_turbo_v2_5',
            output_format: AUDIO_FORMAT
          }
        );

        // Stream in Simli-optimal chunks
        await streamAudioToClient(ws, audioStream);
      }

      conversationHistory.push({ role: 'assistant', content: fullResponse });
      ws.send(JSON.stringify({ type: 'audio_complete' }));
      ws.send(JSON.stringify({ type: 'response_complete' }));
      
    } catch (error) {
      console.error('Error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    } finally {
      setTimeout(() => {
        isResponding = false;
        ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
      }, 500);
    }
  };
  
  // Don't initialize Deepgram immediately - wait for first audio chunk
  ws.send(JSON.stringify({ type: 'status', message: 'ready' }));
  
  ws.on('message', (message) => {
    // Handle binary audio data
    if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      audioChunksReceived++;

      // Initialize Deepgram on first audio chunk
      if (audioChunksReceived === 1) {
        console.log('First audio chunk received, size:', message.length);
        initDeepgram();
      }

      if (audioChunksReceived % 50 === 0) {
        console.log('Audio chunks received:', audioChunksReceived);
      }

      // Wait for Deepgram to be ready before sending
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN && !isResponding) {
        deepgramWs.send(message);
      } else if (audioChunksReceived <= 10) {
        // Buffer first few chunks while Deepgram connects
        setTimeout(() => {
          if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN && !isResponding) {
            deepgramWs.send(message);
          }
        }, 100);
      }
    } else {
      // Handle JSON messages
      try {
        const data = JSON.parse(message.toString());

        // Register this client as an Atelier dashboard
        if (data.type === 'atelier_dashboard_register') {
          isAtelierDashboard = true;
          registerAtelierClient(ws);
          ws.send(JSON.stringify({
            type: 'atelier_registered',
            message: 'Connected to Atelier event stream'
          }));
          console.log(`[Atelier] Dashboard registered from session ${sessionId}`);
        }
      } catch (err) {
        // Ignore JSON parse errors for non-JSON messages
      }
    }
  });

  ws.on('close', async () => {
    console.log('=== Client disconnected ===');
    console.log(`[Session] ${sessionId} ended`);
    console.log('Total audio chunks received:', audioChunksReceived);

    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }

    // --- ATELIER: End conversation tracking ---
    if (!isAtelierDashboard) {
      const results = await endAtelierConversation(sessionId);
      if (results) {
        console.log(`[Atelier] Session ${sessionId} results:`, results);
      }
    }
    // --- END ATELIER ---
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Aline Voice Backend running on port ${PORT}`);
  console.log('Ready for Simli integration');
});
