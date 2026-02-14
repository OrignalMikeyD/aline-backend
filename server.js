/**
 * ALINE VOICE BACKEND — Fully Integrated Production Server
 * 
 * PIPELINE ARCHITECTURE (data flow):
 * 
 *   [User Audio] 
 *     → Deepgram STT (streaming)
 *     → Fibonacci Classifier (Q5/Q23: signal detection + formulaic coverage)
 *     → Conductance Loader (Q12: cross-session pathway data)
 *     → Prompt Engine (Q5: dynamic system prompt generation)
 *     → Backchannel Engine (Q13: Clock A presence signal ≤300ms)
 *     → Claude LLM (streaming, with weight-calibrated prompt)
 *     → Invariant Gate (Q8: 5 topological invariant enforcement)
 *       → If violations: regenerate with constraints
 *     → ElevenLabs TTS (streaming)
 *     → Simli Avatar (PCM16 @ 16kHz)
 *     → Atelier Analytics (classification + invariant + timing data)
 *     → Conductance Reinforcement (Q12: pathway thickening)
 *   [User hears Aline]
 * 
 * COMPONENTS THAT TALK TO EACH OTHER:
 *   classifier.js    → prompt-engine.js   (weight/mood/resistance → calibrated prompt)
 *   classifier.js    → invariant-gate.js  (weight → fill threshold enforcement)
 *   classifier.js    → backchannel.js     (weight/mood → calibrated presence signal)
 *   classifier.js    → conductance.js     (weight/dimension → pathway reinforcement)
 *   classifier.js    → atelier.js         (all classification data → analytics)
 *   conductance.js   → prompt-engine.js   (pathway landscape → behavioral context)
 *   invariant-gate.js→ prompt-engine.js   (violations → regeneration constraints)
 *   backchannel.js   → atelier.js         (timing data → Clock A/B/C metrics)
 *   prompt-engine.js → Claude API         (assembled prompt → LLM generation)
 *   invariant-gate.js→ Claude API         (gate fail → regeneration loop)
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require('elevenlabs');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════
// INTEGRATED SERVICES — Every component connected
// ═══════════════════════════════════════════════════════

// Core behavioral architecture
const { analyzeMessage } = require('./services/classifier');
const { enforceInvariants } = require('./services/invariant-gate');
const { buildSystemPrompt } = require('./services/prompt-engine');
const { reinforcePathway, loadConductanceLandscape, logConductanceSession } = require('./services/conductance');
const { sendBackchannel, TimingTracker } = require('./services/backchannel');

// Atelier analytics
const {
  startAtelierConversation,
  logTurn,
  endAtelierConversation,
  detectArtifact,
  ARTIFACT_TYPES,
} = require('./services/atelier');
const { quickSentiment } = require('./services/sentiment');
const { registerAtelierClient, broadcastToAtelier, getAtelierClientCount } = require('./services/atelier-broadcast');

// Supabase
const supabase = require('./services/supabase');

// ═══════════════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════════════

const PORT = process.env.PORT || 8080;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'knPeAXsHZ6FVdoLHMtRJ';
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4-20250514';

// Simli requires PCM16 at 16kHz
const AUDIO_FORMAT = 'pcm_16000';
const SIMLI_CHUNK_SIZE = 6000;

// Invariant Gate config
const MAX_REGENERATION_ATTEMPTS = 2;

// ═══════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════╗');
console.log('║  ALINE VOICE BACKEND — MRA Integrated        ║');
console.log('║  Morphic Resonance Architecture: ACTIVE       ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log('[Pipeline] Classifier → Prompt Engine → Backchannel → Claude → Invariant Gate → TTS → Atelier → Conductance');
console.log('');
console.log('[Keys]');
console.log('  DEEPGRAM:', DEEPGRAM_API_KEY ? '✓' : '✗ MISSING');
console.log('  ANTHROPIC:', ANTHROPIC_API_KEY ? '✓' : '✗ MISSING');
console.log('  ELEVENLABS:', ELEVENLABS_API_KEY ? '✓' : '✗ MISSING');
console.log('  SUPABASE:', supabase ? '✓' : '✗ (Atelier + Conductance disabled)');
console.log('  MODEL:', MODEL_NAME);
console.log('');

// Initialize API clients
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabs.ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

// ═══════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════

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
    service: 'Aline Voice Backend — MRA Integrated',
    architecture: {
      classifier: 'Fibonacci W1-W21 (Q5/Q23)',
      invariantGate: '5 Topological Invariants (Q8)',
      promptEngine: 'Dynamic Weight-Calibrated (Q5)',
      conductance: 'Cross-Session Reinforcement (Q12)',
      backchannel: 'Three-Clock Architecture (Q13)',
      atelier: 'Real-Time Analytics Dashboard'
    },
    simli: { audioFormat: 'PCM16', sampleRate: 16000, channels: 1, chunkSize: SIMLI_CHUNK_SIZE }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    components: {
      classifier: 'active',
      invariantGate: 'active',
      promptEngine: 'active',
      conductance: supabase ? 'active' : 'disabled (no Supabase)',
      backchannel: 'active',
      atelier: {
        enabled: !!supabase,
        dashboardClients: getAtelierClientCount()
      }
    }
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ═══════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// WEBSOCKET CONNECTION HANDLER
// ═══════════════════════════════════════════════════════

wss.on('connection', async (ws, req) => {
  console.log('\n=== Client connected ===');

  const sessionId = generateSessionId();
  const userId = req.headers['x-user-id'] || `anon_${crypto.randomBytes(4).toString('hex')}`;
  let isAtelierDashboard = false;

  console.log(`[Session] ${sessionId} for user ${userId}`);

  // Per-session state
  let deepgramWs = null;
  let conversationHistory = [];
  let isResponding = false;
  let currentTranscript = '';
  let audioChunksReceived = 0;
  let utteranceTimeout = null;
  let deepgramInitialized = false;
  let sessionMaxWeight = 1;
  let sessionPathwaysReinforced = 0;

  // Load cross-session conductance landscape (Q12)
  let conductanceLandscape = null;
  if (supabase) {
    conductanceLandscape = await loadConductanceLandscape(supabase, userId);
    console.log(`[Conductance] Loaded ${conductanceLandscape.pathways.length} pathways for user ${userId} (${conductanceLandscape.sessionCount} prior sessions)`);
  }

  // Start Atelier tracking
  await startAtelierConversation(sessionId, userId);

  // ═══════════════════════════════════════════════════
  // DEEPGRAM INITIALIZATION
  // ═══════════════════════════════════════════════════

  const initDeepgram = () => {
    if (deepgramInitialized && deepgramWs && deepgramWs.readyState === WebSocket.OPEN) return;

    console.log('[Deepgram] Initializing...');
    deepgramInitialized = true;

    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&endpointing=500&punctuate=true&encoding=linear16&sample_rate=16000`;

    deepgramWs = new WebSocket(dgUrl, {
      headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}` }
    });

    deepgramWs.on('open', () => {
      console.log('[Deepgram] Connected');
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
        console.error('[Deepgram] Parse error:', err);
      }
    });

    deepgramWs.on('error', (error) => {
      console.error('[Deepgram] Error:', error);
      deepgramInitialized = false;
    });

    deepgramWs.on('close', (code) => {
      console.log('[Deepgram] Closed:', code);
      deepgramInitialized = false;
    });
  };

  // ═══════════════════════════════════════════════════
  // PROCESS UTTERANCE — The fully integrated pipeline
  // ═══════════════════════════════════════════════════

  const processUtterance = async () => {
    if (!currentTranscript.trim() || isResponding) return;

    const userMessage = currentTranscript.trim();
    currentTranscript = '';
    isResponding = true;

    // Start timing tracker (Q13)
    const timing = new TimingTracker();
    timing.markUtteranceEnd();

    console.log('\n────────────────────────────────────────');
    console.log(`[Input] "${userMessage}"`);

    // ┌──────────────────────────────────────────────┐
    // │ STEP 1: CLASSIFY (Q5 + Q23)                  │
    // │ Fibonacci weight + mood + resistance          │
    // │ Target: <20ms                                 │
    // └──────────────────────────────────────────────┘

    const classification = analyzeMessage(userMessage);

    console.log(`[Classifier] W${classification.weight} ${classification.dimension} | Mood: ${classification.mood.mode} | ${classification.classificationTimeMs}ms`);
    if (classification.hasResistance) console.log(`[Classifier] Resistance: ${classification.resistance.map(r => r.type).join(', ')}`);
    if (classification.confessionDepth?.isDeep) console.log(`[Classifier] Confession depth: ${classification.confessionDepth.depth} signals`);

    // Track session max weight
    if (classification.weight > sessionMaxWeight) sessionMaxWeight = classification.weight;

    // Add to conversation history
    conversationHistory.push({ role: 'user', content: userMessage });
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);

    // ┌──────────────────────────────────────────────┐
    // │ STEP 2: BACKCHANNEL (Q13 Clock A ≤300ms)     │
    // │ Send presence signal immediately              │
    // └──────────────────────────────────────────────┘

    ws.send(JSON.stringify({ type: 'status', message: 'thinking' }));

    // Fire backchannel in parallel with LLM generation
    const backchannelPromise = sendBackchannel(ws, elevenlabs, ELEVENLABS_VOICE_ID, classification)
      .then(bc => {
        timing.markBackchannelSent();
        return bc;
      })
      .catch(err => {
        console.error('[Backchannel] Error:', err.message);
        return null;
      });

    // ┌──────────────────────────────────────────────┐
    // │ STEP 3: BUILD PROMPT (Q5 + Q12)              │
    // │ Dynamic system prompt from classification +   │
    // │ conductance landscape                         │
    // └──────────────────────────────────────────────┘

    const systemPrompt = buildSystemPrompt(classification, conductanceLandscape);

    // ┌──────────────────────────────────────────────┐
    // │ STEP 4: GENERATE (Claude LLM)                │
    // │ Streaming response with calibrated prompt     │
    // └──────────────────────────────────────────────┘

    // Atelier: log user turn
    const userSentiment = quickSentiment(userMessage);
    await logTurn(sessionId, 'USER', userMessage, userSentiment);

    // Log classification as artifact
    if (classification.weight >= 8) {
      await detectArtifact(sessionId, ARTIFACT_TYPES.EMOTIONAL_PEAK, {
        weight: classification.weight,
        dimension: classification.dimension,
        mood: classification.mood.mode,
        abt: classification.abtLogline
      });
    }

    try {
      let fullResponse = '';
      let attempt = 0;
      let gateResult = null;

      // Generation loop with invariant gate retry
      while (attempt < MAX_REGENERATION_ATTEMPTS + 1) {
        fullResponse = '';

        const messages = [...conversationHistory];
        const currentSystemPrompt = attempt === 0
          ? systemPrompt
          : buildSystemPrompt(classification, conductanceLandscape, gateResult?.regenerationConstraints);

        const stream = anthropic.messages.stream({
          model: MODEL_NAME,
          max_tokens: 300,
          system: currentSystemPrompt,
          messages
        });

        let firstChunkSent = false;

        stream.on('text', (text) => {
          fullResponse += text;
          if (!firstChunkSent) {
            timing.markFirstContent();
            firstChunkSent = true;
          }
          ws.send(JSON.stringify({ type: 'response_text', text }));
        });

        await stream.finalMessage();

        // ┌──────────────────────────────────────────────┐
        // │ STEP 5: INVARIANT GATE (Q8)                  │
        // │ Check 5 topological invariants BEFORE TTS     │
        // └──────────────────────────────────────────────┘

        gateResult = enforceInvariants(fullResponse, classification);

        if (gateResult.pass) {
          console.log(`[Gate] ✓ PASS (${gateResult.gateTimeMs}ms)`);
          break;
        }

        console.log(`[Gate] ✗ FAIL — ${gateResult.violationCount} violations (attempt ${attempt + 1})`);
        gateResult.violations.forEach(v => {
          console.log(`  [${v.severity}] ${v.invariant}: "${v.matched}"`);
        });

        if (!gateResult.requiresRegeneration || attempt >= MAX_REGENERATION_ATTEMPTS) {
          // Accept with warnings — log but don't block
          console.log(`[Gate] Accepting with ${gateResult.violationCount} warnings`);
          break;
        }

        attempt++;
        console.log(`[Gate] Regenerating with constraints (attempt ${attempt + 1})...`);
      }

      // Ensure backchannel has finished before main audio
      await backchannelPromise;

      // ┌──────────────────────────────────────────────┐
      // │ STEP 6: TTS + AVATAR (Q13 Clock B/C)        │
      // │ Stream audio to client via Simli pipeline     │
      // └──────────────────────────────────────────────┘

      const cleanText = cleanTextForTTS(fullResponse);
      if (cleanText.length > 0) {
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
      }

      timing.markResponseComplete();

      // ┌──────────────────────────────────────────────┐
      // │ STEP 7: ATELIER ANALYTICS                    │
      // │ Log everything for dashboard                  │
      // └──────────────────────────────────────────────┘

      const alineSentiment = quickSentiment(fullResponse);
      await logTurn(sessionId, 'ALINE', fullResponse, alineSentiment);

      // Broadcast enriched event to Atelier dashboard
      const timingReport = timing.getReport();
      broadcastToAtelier({
        type: 'TURN_COMPLETE_MRA',
        payload: {
          sessionId,
          classification: {
            weight: classification.weight,
            dimension: classification.dimension,
            mood: classification.mood.mode,
            resistance: classification.hasResistance,
            abt: classification.abtLogline
          },
          invariantGate: {
            pass: gateResult?.pass,
            violations: gateResult?.violationCount || 0,
            enforcements: gateResult?.enforcements || []
          },
          timing: timingReport,
          responseLength: fullResponse.length
        }
      });

      if (timingReport) {
        console.log(`[Timing] ${timingReport.summary}`);
      }

      // ┌──────────────────────────────────────────────┐
      // │ STEP 8: CONDUCTANCE REINFORCEMENT (Q12)      │
      // │ Thicken pathways touched in this turn         │
      // └──────────────────────────────────────────────┘

      if (classification.weight >= 5 && supabase) {
        const reinforced = await reinforcePathway(supabase, userId, classification);
        if (reinforced) sessionPathwaysReinforced++;
      }

      // Finalize turn
      conversationHistory.push({ role: 'assistant', content: fullResponse });
      ws.send(JSON.stringify({ type: 'audio_complete' }));
      ws.send(JSON.stringify({ type: 'response_complete' }));

      console.log(`[Response] "${fullResponse.substring(0, 80)}..." (W${classification.weight})`);
      console.log('────────────────────────────────────────\n');

    } catch (error) {
      console.error('[Pipeline] Error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    } finally {
      setTimeout(() => {
        isResponding = false;
        ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
      }, 500);
    }
  };

  // ═══════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ═══════════════════════════════════════════════════

  ws.send(JSON.stringify({ type: 'status', message: 'ready' }));

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      audioChunksReceived++;

      if (audioChunksReceived === 1) {
        console.log('[Audio] First chunk received, size:', message.length);
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

        // ── TEXT MESSAGE: feeds directly into MRA pipeline, skips Deepgram ──
        if (data.type === 'text_message' && data.text && data.text.trim()) {
          if (!isResponding) {
            currentTranscript = data.text.trim();
            processUtterance();
          }
        }

        // ── ATELIER DASHBOARD REGISTRATION ──
        if (data.type === 'atelier_dashboard_register') {
          isAtelierDashboard = true;
          registerAtelierClient(ws);
          ws.send(JSON.stringify({ type: 'atelier_registered', message: 'Connected to Atelier event stream (MRA integrated)' }));
          console.log(`[Atelier] Dashboard registered from session ${sessionId}`);
        }
      } catch (err) {
        // Non-JSON message, ignore
      }
    }
  });

  // ═══════════════════════════════════════════════════
  // DISCONNECT HANDLER
  // ═══════════════════════════════════════════════════

  ws.on('close', async () => {
    console.log('\n=== Client disconnected ===');
    console.log(`[Session] ${sessionId} ended`);
    console.log(`[Session] Max weight: W${sessionMaxWeight}, Pathways reinforced: ${sessionPathwaysReinforced}`);

    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }

    // Log conductance session stats
    if (supabase) {
      await logConductanceSession(supabase, userId, sessionId, {
        pathwaysReinforced: sessionPathwaysReinforced,
        maxWeight: sessionMaxWeight
      });
    }

    // End Atelier conversation
    if (!isAtelierDashboard) {
      const results = await endAtelierConversation(sessionId);
      if (results) {
        console.log(`[Atelier] Session results: ΔV=${results.deltaV?.toFixed(2)}, Artifacts=${results.artifacts?.length}`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
  });
});

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log(`\n🌀 Aline Voice Backend running on port ${PORT}`);
  console.log('   Morphic Resonance Architecture: ACTIVE');
  console.log('   Ready for Simli integration\n');
});
