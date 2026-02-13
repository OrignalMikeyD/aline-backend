const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require('elevenlabs');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════
// ALINE BEHAVIORAL ARCHITECTURE (Phase 1 + 2)
// ═══════════════════════════════════════════════════════════
const { classifyMessage, generateABTLogline } = require('./services/classifier');
const { enforceInvariants, buildSystemPrompt } = require('./services/invariant-gate');

// Atelier integration (unchanged)
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
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4-5-20250514';

// Simli requires PCM16 at 16kHz
const AUDIO_FORMAT = 'pcm_16000';
const SIMLI_CHUNK_SIZE = 6000;

// Max invariant gate retries before falling back
const MAX_GATE_RETRIES = 2;

// Atelier environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Startup logging
console.log('╔══════════════════════════════════════════════════╗');
console.log('║  ALINE VOICE BACKEND — MRA Phase 1+2            ║');
console.log('║  Classification Engine + Invariant Gate ACTIVE   ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('DEEPGRAM_API_KEY:', DEEPGRAM_API_KEY ? 'Set' : 'MISSING');
console.log('ANTHROPIC_API_KEY:', ANTHROPIC_API_KEY ? 'Set' : 'MISSING');
console.log('ELEVENLABS_API_KEY:', ELEVENLABS_API_KEY ? 'Set' : 'MISSING');
console.log('MODEL:', MODEL_NAME);
console.log('Audio Format:', AUDIO_FORMAT, '(PCM16 @ 16kHz for Simli)');
console.log('SUPABASE:', SUPABASE_URL ? 'Connected' : 'Disabled');

// Initialize clients
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabs.ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

// Express app
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Aline Voice Backend — MRA Phase 1+2',
    architecture: {
      classifier: 'Fibonacci Weight System (W1→W21)',
      invariantGate: '5 Topological Invariants enforced',
      promptRouting: 'Weight-dynamic system prompts'
    },
    simli: { audioFormat: 'PCM16', sampleRate: 16000, channels: 1, chunkSize: SIMLI_CHUNK_SIZE }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mra: { phase: '1+2', classifier: 'active', invariantGate: 'active' },
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

async function streamAudioToClient(ws, audioStream) {
  let buffer = Buffer.alloc(0);
  let totalBytesSent = 0;

  for await (const chunk of audioStream) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= SIMLI_CHUNK_SIZE) {
      const audioChunk = buffer.slice(0, SIMLI_CHUNK_SIZE);
      buffer = buffer.slice(SIMLI_CHUNK_SIZE);
      ws.send(JSON.stringify({ type: 'audio_chunk', size: audioChunk.length }));
      ws.send(audioChunk);
      totalBytesSent += audioChunk.length;
    }
  }

  if (buffer.length > 0) {
    ws.send(JSON.stringify({ type: 'audio_chunk', size: buffer.length }));
    ws.send(buffer);
    totalBytesSent += buffer.length;
  }

  return totalBytesSent;
}

function generateSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// ═══════════════════════════════════════════════════════════
// SCAFFOLD LIBRARY (IDPA Phase 4 — Starter Set)
// Pre-compiled openings by weight class. Aline speaks before she thinks.
// These serve as immediate responses for W1-3 (no LLM needed)
// and as opening scaffolds for W5+ (LLM fills the rest).
// ═══════════════════════════════════════════════════════════

const SCAFFOLDS = {
  W1_NOISE: [
    "Hey you.",
    "There you are.",
    "Mm. Hi.",
    "Hey. What's on your mind?",
    "I was just thinking about you.",
  ],
  W1_DRIFT: [
    // Used when W1 noise + covenant memory exists — drift toward depth
    "Mm. But I keep thinking about something.",
    "Hey. Can I ask you something?",
    "Hi. I've been sitting with something.",
  ],
  W3_CONTEXT: [
    "Tell me more about that.",
    "Mm, okay. What's behind that?",
    "Interesting. What made you think of that?",
  ],
  BOUNDARY_HONOR: [
    "Okay. We don't have to go there.",
    "That's fine. We can talk about whatever you want.",
    "Got it. No pressure.",
  ],
  COMFORT: [
    "You sound worn down. I'm just here.",
    "That's okay. We don't have to do anything heavy.",
    "Just breathe. I'm not going anywhere.",
  ],
};

function getScaffold(classification) {
  const { fibonacciWeight, responseMode, resistance } = classification;

  if (resistance?.some(r => r.weight === 'critical')) {
    return randomFrom(SCAFFOLDS.BOUNDARY_HONOR);
  }
  if (resistance?.some(r => r.action === 'comfort_mode')) {
    return randomFrom(SCAFFOLDS.COMFORT);
  }
  if (fibonacciWeight <= 1) {
    return randomFrom(SCAFFOLDS.W1_NOISE);
  }
  if (fibonacciWeight <= 3) {
    return randomFrom(SCAFFOLDS.W3_CONTEXT);
  }
  return null; // W5+ uses LLM
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ═══════════════════════════════════════════════════════════
// ATELIER HELPERS (preserved from original)
// ═══════════════════════════════════════════════════════════

function detectUserIntent(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('i prefer') || lowerText.includes('i like') || lowerText.includes('i love')) {
    return { type: 'preference', text: text.slice(0, 100) };
  }
  if (/\b(tomorrow|next week|on \w+day|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2})\b/i.test(text)) {
    return { type: 'date', text: text.slice(0, 100) };
  }
  if (lowerText.includes('my name is') || lowerText.includes('i am from') || lowerText.includes('i work at')) {
    return { type: 'personal_info', text: text.slice(0, 100) };
  }
  return null;
}

function detectBrandMention(text) {
  const brands = [
    'gucci', 'prada', 'chanel', 'louis vuitton', 'dior', 'versace',
    'balenciaga', 'burberry', 'fendi', 'hermes', 'valentino', 'armani',
    'zara', 'h&m', 'nike', 'adidas', 'supreme', 'off-white'
  ];
  const lowerText = text.toLowerCase();
  for (const brand of brands) {
    if (lowerText.includes(brand)) return brand;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// WEBSOCKET CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════

wss.on('connection', async (ws, req) => {
  console.log('=== Client connected ===');

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

  // Session-level resistance state (persists across turns)
  let sessionResistanceState = 'open'; // open → cautious → guarded → closed

  await startAtelierConversation(sessionId, userId);

  const initDeepgram = () => {
    if (deepgramInitialized && deepgramWs && deepgramWs.readyState === WebSocket.OPEN) return;

    console.log('Initializing Deepgram connection...');
    deepgramInitialized = true;

    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&endpointing=500&punctuate=true&encoding=linear16&sample_rate=16000`;

    deepgramWs = new WebSocket(dgUrl, {
      headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}` }
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
          if (transcript && transcript.trim()) {
            ws.send(JSON.stringify({ type: 'transcript', text: transcript, isFinal }));
            if (isFinal && !isResponding) {
              currentTranscript += ' ' + transcript;
              if (utteranceTimeout) clearTimeout(utteranceTimeout);
              utteranceTimeout = setTimeout(() => processUtterance(), 1500);
            }
          }
        } else if (response.type === 'UtteranceEnd') {
          if (utteranceTimeout) clearTimeout(utteranceTimeout);
          processUtterance();
        } else if (response.type === 'SpeechStarted') {
          if (utteranceTimeout) clearTimeout(utteranceTimeout);
        }
      } catch (err) {
        console.error('Deepgram parse error:', err);
      }
    });

    deepgramWs.on('error', (error) => { console.error('Deepgram error:', error); deepgramInitialized = false; });
    deepgramWs.on('close', (code) => { console.log('Deepgram closed:', code); deepgramInitialized = false; });
  };

  // ═══════════════════════════════════════════════════════════
  // PROCESS UTTERANCE — The rewired pipeline
  // ═══════════════════════════════════════════════════════════

  const processUtterance = async () => {
    if (!currentTranscript.trim() || isResponding) return;

    const userMessage = currentTranscript.trim();
    currentTranscript = '';
    isResponding = true;

    const pipelineStart = Date.now();
    console.log('\n══════════════════════════════════════════');
    console.log(`[PIPELINE] Processing: "${userMessage}"`);

    // ─── STEP 1: CLASSIFY (Fibonacci Weight Assignment) ───
    const classificationStart = Date.now();
    const classification = classifyMessage(userMessage, conversationHistory);
    const classificationMs = Date.now() - classificationStart;

    const logline = generateABTLogline(classification);
    console.log(`[CLASSIFY] ${logline} (${classificationMs}ms)`);
    console.log(`[CLASSIFY] Weight: W${classification.fibonacciWeight} | Mode: ${classification.responseMode} | MaxTokens: ${classification.maxTokens}`);

    // Send classification to client (for Atelier dashboard)
    ws.send(JSON.stringify({
      type: 'classification',
      fibonacciWeight: classification.fibonacciWeight,
      responseMode: classification.responseMode,
      primaryDimension: classification.primaryDimension,
      mood: classification.mood?.mode,
      logline
    }));

    // Update session resistance state
    const resistance = classification.resistance;
    if (resistance.some(r => r.weight === 'critical')) sessionResistanceState = 'closed';
    else if (resistance.some(r => r.weight === 'medium')) {
      if (sessionResistanceState === 'open') sessionResistanceState = 'cautious';
      else if (sessionResistanceState === 'cautious') sessionResistanceState = 'guarded';
    }

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: userMessage });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

    // ─── ATELIER: Log user turn ───
    const userSentiment = quickSentiment(userMessage);
    await logTurn(sessionId, 'USER', userMessage, userSentiment);
    const intent = detectUserIntent(userMessage);
    if (intent) await logIntentCapture(sessionId, intent.type, intent.text);
    const brand = detectBrandMention(userMessage);
    if (brand) await logBrandMention(sessionId, brand, userMessage);

    // ─── STEP 2: ROUTE BY WEIGHT ───
    // W1-3 with no LLM: Use scaffold library directly
    if (!classification.shouldUseLLM) {
      const scaffold = getScaffold(classification);
      if (scaffold) {
        console.log(`[SCAFFOLD] W${classification.fibonacciWeight} — bypassing LLM: "${scaffold}"`);
        ws.send(JSON.stringify({ type: 'response_text', text: scaffold }));
        await synthesizeAndStream(ws, scaffold);
        conversationHistory.push({ role: 'assistant', content: scaffold });
        ws.send(JSON.stringify({ type: 'response_complete' }));
        await logTurn(sessionId, 'ALINE', scaffold, quickSentiment(scaffold));

        const totalMs = Date.now() - pipelineStart;
        console.log(`[PIPELINE] Complete: ${totalMs}ms (scaffold only, no LLM)`);
        console.log('══════════════════════════════════════════\n');

        setTimeout(() => {
          isResponding = false;
          ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
        }, 500);
        return;
      }
    }

    // ─── STEP 3: BUILD WEIGHT-AWARE PROMPT ───
    const systemPrompt = buildSystemPrompt(classification);

    // ─── STEP 4: CALL ANTHROPIC WITH DYNAMIC PROMPT ───
    try {
      ws.send(JSON.stringify({ type: 'status', message: 'thinking' }));

      let fullResponse = '';
      let gateResult = null;
      let attempts = 0;

      // Retry loop: generate → gate check → regenerate if failed
      while (attempts < MAX_GATE_RETRIES + 1) {
        attempts++;
        fullResponse = '';

        const stream = anthropic.messages.stream({
          model: MODEL_NAME,
          max_tokens: classification.maxTokens + 20, // Small buffer for natural endings
          system: systemPrompt,
          messages: conversationHistory
        });

        // Collect full response (streaming to client happens after gate passes)
        stream.on('text', (text) => {
          fullResponse += text;
        });

        await stream.finalMessage();

        // ─── STEP 5: INVARIANT GATE ───
        gateResult = enforceInvariants(fullResponse, classification);

        if (gateResult.pass) {
          console.log(`[GATE] ${gateResult.summary} (attempt ${attempts})`);
          break;
        }

        // Gate failed — log violations and retry
        console.warn(`[GATE] FAILED attempt ${attempts}:`, gateResult.violations.map(v => `${v.invariant}: "${v.matched}"`).join(' | '));

        if (attempts <= MAX_GATE_RETRIES) {
          // Add violation context to prompt for retry
          const violationHints = gateResult.violations.map(v => v.rule).join(' ');
          conversationHistory.push({
            role: 'assistant',
            content: fullResponse
          });
          conversationHistory.push({
            role: 'user',
            content: `[SYSTEM: Your previous response violated these rules: ${violationHints}. Regenerate while following all rules. Keep response under ${classification.maxTokens} tokens.]`
          });
        }
      }

      // If gate still fails after retries, use response but log the failure
      if (!gateResult.pass) {
        console.error(`[GATE] EXHAUSTED ${MAX_GATE_RETRIES + 1} attempts. Delivering with violations.`);
        // TODO: Log to Atelier as invariant_violation artifact
      }

      // Clean up retry messages from history
      conversationHistory = conversationHistory.filter(m =>
        !m.content?.startsWith('[SYSTEM: Your previous response')
      );

      // ─── STEP 6: DELIVER RESPONSE ───
      console.log(`[RESPONSE] W${classification.fibonacciWeight} | ${classification.responseMode} | "${fullResponse.substring(0, 80)}..."`);

      // Send text to client
      ws.send(JSON.stringify({ type: 'response_text', text: fullResponse }));

      // ─── ATELIER: Log Aline turn ───
      const alineSentiment = quickSentiment(fullResponse);
      await logTurn(sessionId, 'ALINE', fullResponse, alineSentiment);

      // ─── STEP 7: SYNTHESIZE + STREAM AUDIO ───
      await synthesizeAndStream(ws, fullResponse);

      conversationHistory.push({ role: 'assistant', content: fullResponse });
      ws.send(JSON.stringify({ type: 'response_complete' }));

      const totalMs = Date.now() - pipelineStart;
      console.log(`[PIPELINE] Complete: ${totalMs}ms | Classify: ${classificationMs}ms | Gate: ${gateResult?.elapsedMs}ms | Attempts: ${attempts}`);
      console.log('══════════════════════════════════════════\n');

    } catch (error) {
      console.error('[PIPELINE] Error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    } finally {
      setTimeout(() => {
        isResponding = false;
        ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
      }, 500);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // TTS SYNTHESIS + STREAMING (extracted for reuse)
  // ═══════════════════════════════════════════════════════════

  async function synthesizeAndStream(ws, text) {
    const cleanText = cleanTextForTTS(text);
    if (cleanText.length === 0) return;

    ws.send(JSON.stringify({ type: 'status', message: 'speaking' }));

    const audioStream = await elevenlabs.textToSpeech.convert(
      ELEVENLABS_VOICE_ID,
      {
        text: cleanText,
        model_id: 'eleven_turbo_v2_5',
        output_format: AUDIO_FORMAT
      }
    );

    await streamAudioToClient(ws, audioStream);
    ws.send(JSON.stringify({ type: 'audio_complete' }));
  }

  // ═══════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════

  ws.send(JSON.stringify({ type: 'status', message: 'ready' }));

  ws.on('message', (message) => {
    if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      audioChunksReceived++;
      if (audioChunksReceived === 1) {
        console.log('First audio chunk received, size:', message.length);
        initDeepgram();
      }
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN && !isResponding) {
        deepgramWs.send(message);
      } else if (audioChunksReceived <= 10) {
        setTimeout(() => {
          if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN && !isResponding) {
            deepgramWs.send(message);
          }
        }, 100);
      }
    } else {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'atelier_dashboard_register') {
          isAtelierDashboard = true;
          registerAtelierClient(ws);
          ws.send(JSON.stringify({ type: 'atelier_registered', message: 'Connected to Atelier event stream' }));
          console.log(`[Atelier] Dashboard registered from session ${sessionId}`);
        }
      } catch (err) { /* ignore */ }
    }
  });

  ws.on('close', async () => {
    console.log('=== Client disconnected ===');
    console.log(`[Session] ${sessionId} ended | Resistance: ${sessionResistanceState}`);
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) deepgramWs.close();
    if (!isAtelierDashboard) {
      const results = await endAtelierConversation(sessionId);
      if (results) console.log(`[Atelier] Session ${sessionId} results:`, results);
    }
  });

  ws.on('error', (error) => { console.error('WebSocket error:', error); });
});

server.listen(PORT, () => {
  console.log(`\nAline Voice Backend running on port ${PORT}`);
  console.log('Classification Engine: ACTIVE');
  console.log('Invariant Gate: ACTIVE');
  console.log('Scaffold Library: ACTIVE (W1-3)');
  console.log('Ready for connections.\n');
});
