/**
 * ALINE BACKCHANNEL ENGINE — Q13 Three-Clock Timing Architecture
 * 
 * Implements the backchannel-first pipeline from Q13:
 *   Clock A (≤300ms): First contingent signal — "I'm here"
 *   Clock B (≤700ms): First lexical content — first real word
 *   Clock C (≤1200ms): Stable response trajectory — answer unfolds
 * 
 * RESEARCH GROUNDING:
 * - Q13: Cross-linguistic turn transitions cluster 0–200ms (modal 0ms)
 *         ~70-82% of floor transfers < 500ms
 *         Repair initiation peaks at ~700ms ("something's wrong")
 *         >1200ms = broken conversational coupling
 * 
 * - Stivers et al. 2009: Response must begin within a few hundred ms
 * - Levinson & Torreira 2015: Anticipatory planning, not wait-then-react
 * - ITU-T G.114: >400ms one-way = conversationally unacceptable
 * - VR filler study 2025: Natural fillers preserve engagement during delay
 * 
 * ARCHITECTURE:
 * 1. On utterance end detection, IMMEDIATELY send a backchannel
 * 2. Backchannel is weight-calibrated (different signals for different depths)
 * 3. While backchannel plays (200-400ms audio), LLM generates response
 * 4. First TTS chunk arrives while backchannel is still playing or just finished
 * 
 * This transforms a 1200ms serial pipeline into:
 *   0ms:   Utterance end detected
 *   60ms:  Backchannel selected
 *   150ms: Backchannel audio sent to client (Clock A met)
 *   300ms: LLM streaming begins
 *   700ms: First TTS chunk from real response (Clock B met)
 *   1200ms: Response stable (Clock C met)
 */

// ═══════════════════════════════════════════════════════
// BACKCHANNEL LIBRARY — Weight-calibrated presence signals
// ═══════════════════════════════════════════════════════

const BACKCHANNELS = {
  // W1-W3: Light, warm presence
  low: {
    verbal: ['Mm.', 'Mm-hm.', 'Hm.'],
    // These get sent to ElevenLabs for TTS
    avatarCue: 'gentle_nod',     // Sent to Simli
    description: 'Light acknowledgment'
  },

  // W5: Attentive listening
  medium: {
    verbal: ['Mm.', 'Oh.', 'Hm.'],
    avatarCue: 'attentive_lean',
    description: 'Attentive signal'
  },

  // W8: Body-level — grounded presence
  physical: {
    verbal: ['Mm.', 'Oh.'],
    avatarCue: 'slow_nod',
    description: 'Grounded acknowledgment'
  },

  // W13: Relational — held silence
  relational: {
    verbal: ['Oh.', '...'],
    avatarCue: 'soft_concern',
    description: 'Relational holding'
  },

  // W21: Covenant — the weight of witness
  covenant: {
    verbal: ['...'],  // Near-silence. The pause IS the signal.
    avatarCue: 'still_presence',
    description: 'Witness silence'
  },

  // Celebration: Match their energy
  celebration: {
    verbal: ['Oh!', 'Wait—'],
    avatarCue: 'eyes_widen',
    description: 'Excited attention'
  },

  // Resistance detected: Softness
  resistance: {
    verbal: ['Okay.'],
    avatarCue: 'gentle_retreat',
    description: 'Boundary respect'
  }
};

// ═══════════════════════════════════════════════════════
// BACKCHANNEL SELECTOR — Picks the right signal based on
// classification output
// ═══════════════════════════════════════════════════════

function selectBackchannel(classificationResult) {
  const { weight, mood, hasCriticalResistance, hasResistance } = classificationResult;

  // Resistance overrides weight-based selection
  if (hasCriticalResistance) {
    return selectFromSet(BACKCHANNELS.resistance);
  }

  // Celebration mood overrides weight
  if (mood?.mode === 'JOYFUL') {
    return selectFromSet(BACKCHANNELS.celebration);
  }

  // Weight-based selection
  if (weight >= 21) return selectFromSet(BACKCHANNELS.covenant);
  if (weight >= 13) return selectFromSet(BACKCHANNELS.relational);
  if (weight >= 8) return selectFromSet(BACKCHANNELS.physical);
  if (weight >= 5) return selectFromSet(BACKCHANNELS.medium);

  // Default: light presence
  return selectFromSet(BACKCHANNELS.low);
}

function selectFromSet(set) {
  const verbal = set.verbal[Math.floor(Math.random() * set.verbal.length)];
  return {
    text: verbal,
    avatarCue: set.avatarCue,
    description: set.description
  };
}

// ═══════════════════════════════════════════════════════
// BACKCHANNEL SENDER — Sends presence signal to client
// Must execute within Clock A budget (≤300ms from utterance end)
// ═══════════════════════════════════════════════════════

async function sendBackchannel(ws, elevenlabs, voiceId, classificationResult) {
  const startTime = Date.now();

  const backchannel = selectBackchannel(classificationResult);

  // Send avatar cue immediately (no TTS latency)
  ws.send(JSON.stringify({
    type: 'avatar_cue',
    cue: backchannel.avatarCue,
    description: backchannel.description
  }));

  // If the backchannel is silence ("..."), just send the avatar cue, no TTS
  if (backchannel.text === '...') {
    ws.send(JSON.stringify({
      type: 'backchannel_sent',
      text: backchannel.text,
      avatarCue: backchannel.avatarCue,
      latencyMs: Date.now() - startTime
    }));
    return backchannel;
  }

  // Generate minimal TTS for the backchannel
  // Using turbo model for speed — this is a 1-2 word utterance
  try {
    const audioStream = await elevenlabs.textToSpeech.convert(
      voiceId,
      {
        text: backchannel.text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'pcm_16000'
      }
    );

    // Collect the tiny audio and send it as one chunk
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    ws.send(JSON.stringify({ type: 'backchannel_audio', size: audioBuffer.length }));
    ws.send(audioBuffer);

  } catch (err) {
    console.error('[Backchannel] TTS error:', err.message);
    // Avatar cue already sent — backchannel partially delivered
  }

  const elapsed = Date.now() - startTime;

  ws.send(JSON.stringify({
    type: 'backchannel_sent',
    text: backchannel.text,
    avatarCue: backchannel.avatarCue,
    latencyMs: elapsed
  }));

  console.log(`[Backchannel] Sent "${backchannel.text}" + ${backchannel.avatarCue} in ${elapsed}ms`);

  return backchannel;
}

// ═══════════════════════════════════════════════════════
// TIMING TRACKER — Measures pipeline against Q13 clocks
// Logs whether each clock target was met
// ═══════════════════════════════════════════════════════

class TimingTracker {
  constructor() {
    this.utteranceEndTime = null;
    this.backchannelSentTime = null;
    this.firstContentTime = null;
    this.responseCompleteTime = null;
  }

  markUtteranceEnd() {
    this.utteranceEndTime = Date.now();
  }

  markBackchannelSent() {
    this.backchannelSentTime = Date.now();
  }

  markFirstContent() {
    this.firstContentTime = Date.now();
  }

  markResponseComplete() {
    this.responseCompleteTime = Date.now();
  }

  getReport() {
    if (!this.utteranceEndTime) return null;

    const clockA = this.backchannelSentTime
      ? this.backchannelSentTime - this.utteranceEndTime
      : null;

    const clockB = this.firstContentTime
      ? this.firstContentTime - this.utteranceEndTime
      : null;

    const clockC = this.responseCompleteTime
      ? this.responseCompleteTime - this.utteranceEndTime
      : null;

    return {
      clockA_ms: clockA,
      clockA_target: 300,
      clockA_met: clockA !== null && clockA <= 300,

      clockB_ms: clockB,
      clockB_target: 700,
      clockB_met: clockB !== null && clockB <= 700,

      clockC_ms: clockC,
      clockC_target: 1200,
      clockC_met: clockC !== null && clockC <= 1200,

      summary: `A:${clockA}ms/${clockA <= 300 ? '✓' : '✗'} B:${clockB}ms/${clockB <= 700 ? '✓' : '✗'} C:${clockC}ms/${clockC <= 1200 ? '✓' : '✗'}`
    };
  }
}

module.exports = {
  selectBackchannel,
  sendBackchannel,
  TimingTracker,
  BACKCHANNELS
};
