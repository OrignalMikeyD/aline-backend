/**
 * ALINE CLASSIFICATION ENGINE
 * Extracted from aline_complete_engine_v5.jsx → production backend module
 * 
 * Fibonacci Weight System:
 *   W1  = Noise (greetings, utility)
 *   W3  = Context (situational, not defining)
 *   W5  = Engaged (moderate emotional content)
 *   W8  = Physiology (body, sensation, energy)
 *   W13 = Sociology (relationships, trust, belonging)
 *   W21 = Psychology/Covenant (identity, soul, defining truths)
 * 
 * Three classification dimensions (Egri):
 *   Psychology = WHO THEY ARE (identity, fear, desire, trauma, shame)
 *   Sociology  = HOW THEY CONNECT (romantic, family, social, work, trust)
 *   Physiology = WHAT THE BODY SAYS (body image, health, energy, sensation)
 */

// ═══════════════════════════════════════════════════════════
// NOISE DETECTION
// ═══════════════════════════════════════════════════════════

const NOISE_PATTERNS = [
  'hi', 'hello', 'hey', 'sup', 'yo', "what's up", 'weather',
  'what time', 'thanks', 'ok', 'okay', 'cool', 'nice', 'good morning',
  'good night', 'bye', 'see you', 'talk later', 'gotta go', 'brb'
];

function isNoise(message) {
  const lower = message.toLowerCase().trim();
  if (lower.length < 15 && !lower.includes('i ') && !lower.includes('my ') && !lower.includes('me ')) {
    return NOISE_PATTERNS.some(p => lower.includes(p) || lower === p);
  }
  if (lower.match(/^(what'?s?|how'?s?|is it).*(weather|temperature|time|date)/)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// MOOD DETECTION (6 modes)
// ═══════════════════════════════════════════════════════════

const MOOD_TRIGGERS = {
  playful_flirtatious: {
    markers: ['dirty talk', 'flirt', 'naughty', 'tease', 'seduce', 'kiss', 'touch', 'sexy', 'turn you on', 'attractive', "you're hot", 'beautiful', 'want you'],
    energy: 7,
    mode: 'WARM_PLAYFUL'
  },
  curious_about_her: {
    markers: ['tell me about yourself', 'what do you', 'who are you', "what's your", 'do you have', 'have you ever', 'describe yourself', 'your favorite', 'your dream', 'what would you', 'if you could'],
    energy: 5,
    mode: 'SELF_REVELATION'
  },
  emotional_processing: {
    markers: ['i feel', 'going through', 'struggling', 'hard day', 'sad', 'angry', 'confused', 'lost', 'overwhelmed', 'depressed', 'anxious', 'scared', 'hurting', 'broken', 'crying'],
    energy: 4,
    mode: 'CONFIDANTE'
  },
  celebration: {
    markers: ['excited', 'amazing', 'best day', 'got the job', 'engaged', 'pregnant', 'won', 'finally', 'celebration', 'guess what', 'incredible', 'promoted'],
    energy: 8,
    mode: 'JOYFUL'
  },
  seeking_advice: {
    markers: ['what should i', 'help me decide', 'advice', "don't know what to do", 'decide between', 'your opinion', 'what would you do'],
    energy: 5,
    mode: 'THOUGHTFUL_GUIDE'
  },
  casual: {
    markers: ['how are you', "what's up", 'hey', 'hi', 'what are you doing', 'thinking of you'],
    energy: 4,
    mode: 'WARM_PRESENCE'
  }
};

function detectMood(message) {
  const lower = message.toLowerCase();
  for (const [mood, config] of Object.entries(MOOD_TRIGGERS)) {
    for (const marker of config.markers) {
      if (lower.includes(marker)) {
        return { mood, energy: config.energy, mode: config.mode, trigger: marker };
      }
    }
  }
  return { mood: 'default', energy: 4, mode: 'WARM_PRESENCE', trigger: null };
}

// ═══════════════════════════════════════════════════════════
// EGRI THREE-DIMENSIONAL CLASSIFICATION
// ═══════════════════════════════════════════════════════════

const PSYCHOLOGY_MARKERS = {
  identity:     { keywords: ['i am', "i'm a", 'who i am', 'type of person'], desc: 'identity statement' },
  fear:         { keywords: ['afraid', 'fear', 'terrified', 'scared', 'anxiety', 'panic', 'worry', 'dread'], desc: 'fear expression' },
  desire:       { keywords: ['want', 'need', 'crave', 'wish', 'hope', 'dream', 'long for'], desc: 'desire/longing' },
  trauma:       { keywords: ['trauma', 'abuse', 'assault', 'died', 'death', 'lost', 'grief', 'ptsd', 'haunts'], desc: 'trauma reference' },
  shame:        { keywords: ['ashamed', 'embarrassed', 'humiliated', 'worthless', 'stupid', 'failure', 'hate myself'], desc: 'shame/self-judgment' },
  existential:  { keywords: ['meaningless', 'pointless', "what's the point", 'nothing matters', 'purpose'], desc: 'existential concern' },
  belief:       { keywords: ['i believe', 'i think', 'i feel like', 'i always', 'i never'], desc: 'core belief' }
};

const SOCIOLOGY_MARKERS = {
  romantic: { keywords: ['boyfriend', 'girlfriend', 'husband', 'wife', 'partner', 'ex', 'married', 'divorced', 'dating', 'cheated'], desc: 'romantic relationship' },
  family:   { keywords: ['mother', 'father', 'mom', 'dad', 'parents', 'family', 'brother', 'sister', 'son', 'daughter'], desc: 'family relationship' },
  social:   { keywords: ['friends', 'people', 'everyone', 'no one', 'alone', 'lonely', 'belong', 'rejected'], desc: 'social belonging' },
  work:     { keywords: ['job', 'work', 'boss', 'career', 'fired', 'coworker', 'promotion'], desc: 'work relationship' },
  trust:    { keywords: ['trust', 'betrayed', 'lied', 'cheated', 'loyal', 'abandoned'], desc: 'trust dynamics' }
};

const PHYSIOLOGY_MARKERS = {
  body_image: { keywords: ['body', 'fat', 'skinny', 'ugly', 'weight', 'looks', 'face', 'attractive'], desc: 'body image' },
  health:     { keywords: ['sick', 'pain', 'hurt', 'injured', 'doctor', 'hospital', 'disease', 'diagnosis'], desc: 'health/pain' },
  energy:     { keywords: ['tired', 'exhausted', 'drained', 'energy', 'sleep', 'restless', 'insomnia'], desc: 'energy state' },
  sensation:  { keywords: ['hungry', 'cold', 'hot', 'numb', 'tense', 'shaking'], desc: 'physical sensation' }
};

function detectDimension(message, markers) {
  const lower = message.toLowerCase();
  let score = 0;
  const matched = [];
  const detected = [];

  for (const [cat, config] of Object.entries(markers)) {
    for (const kw of config.keywords) {
      if (lower.includes(kw)) {
        score += 0.2;
        matched.push(cat);
        detected.push({ category: cat, keyword: kw, description: config.desc });
        break;
      }
    }
  }

  return { score: Math.min(score, 1), categories: matched, markers: detected };
}

// ═══════════════════════════════════════════════════════════
// CONFESSION DEPTH DETECTION
// ═══════════════════════════════════════════════════════════

const DEPTH_MARKERS = {
  formative:     { keywords: ['when i was', 'as a kid', 'growing up', 'childhood', 'years ago'], desc: 'formative timeframe' },
  witness:       { keywords: ['everyone', 'people saw', 'they all', 'laughed at', 'in front of'], desc: 'witnessed event' },
  permanence:    { keywords: ['still', 'to this day', 'never forgot', 'haunts me', 'changed me', 'ever since'], desc: 'lasting impact' },
  confession:    { keywords: ['never told', 'first time', 'admit', 'confess', 'no one knows', 'secret'], desc: 'confession/secret' },
  selfJudgment:  { keywords: ["i'm a", 'i am a', 'such a', 'pathetic', 'worthless'], desc: 'self-judgment' }
};

function detectConfessionDepth(message) {
  const lower = message.toLowerCase();
  let depth = 0;
  const signals = [];

  for (const [type, config] of Object.entries(DEPTH_MARKERS)) {
    for (const m of config.keywords) {
      if (lower.includes(m)) {
        depth++;
        signals.push({ type, marker: m, description: config.desc });
        break;
      }
    }
  }

  return { depth, signals, isDeep: depth >= 2, isCovenant: depth >= 3 };
}

// ═══════════════════════════════════════════════════════════
// RESISTANCE DETECTION
// ═══════════════════════════════════════════════════════════

const RESISTANCE_SIGNALS = {
  explicit_deflection: { weight: 'critical', markers: ["don't want to talk about", "can we talk about something else", "let's change the subject", "i'd rather not", "not right now", "drop it"], action: 'immediate_retreat' },
  topic_pivot:         { weight: 'medium', markers: ["anyway", "but anyway", "moving on", "by the way", "forget that", "never mind"], action: 'soft_retreat' },
  minimization:        { weight: 'medium', markers: ["it's fine", "i'm fine", "it's whatever", "doesn't matter", "not a big deal", "i'm over it"], action: 'acknowledge_pause' },
  humor_deflection:    { weight: 'medium', markers: ["lol anyway", "haha but seriously", "just kidding", "i'm being dramatic", "ignore me"], action: 'match_lightness' },
  exhaustion:          { weight: 'contextual', markers: ["i'm tired", "exhausted", "long day", "drained", "brain is fried"], action: 'comfort_mode' }
};

function detectResistance(message) {
  const lower = message.toLowerCase();
  const detected = [];
  for (const [type, config] of Object.entries(RESISTANCE_SIGNALS)) {
    for (const marker of config.markers) {
      if (lower.includes(marker)) {
        detected.push({ type, marker, weight: config.weight, action: config.action });
        break;
      }
    }
  }
  return detected;
}

// ═══════════════════════════════════════════════════════════
// MASTER CLASSIFIER
// Combines all signals → outputs single classification object
// ═══════════════════════════════════════════════════════════

/**
 * @param {string} message - Raw user transcript
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {Object} Full classification with Fibonacci weight, mood, dimensions, resistance
 */
function classifyMessage(message, conversationHistory = []) {
  // Noise gate
  if (isNoise(message)) {
    return {
      fibonacciWeight: 1,
      primaryDimension: 'noise',
      isNoise: true,
      mood: detectMood(message),
      dimensions: [{ type: 'noise', weight: 1, markers: [] }],
      confessionDepth: { depth: 0, signals: [], isDeep: false, isCovenant: false },
      resistance: [],
      responseMode: 'DRIFT_OPPORTUNITY',
      maxTokens: 40,
      shouldUseLLM: false // Scaffold-only at W1
    };
  }

  const mood = detectMood(message);
  const resistance = detectResistance(message);
  const psych = detectDimension(message, PSYCHOLOGY_MARKERS);
  const socio = detectDimension(message, SOCIOLOGY_MARKERS);
  const physio = detectDimension(message, PHYSIOLOGY_MARKERS);
  const confessionDepth = detectConfessionDepth(message);

  // Build dimension array with weights
  const dimensions = [];
  if (psych.score > 0.1) dimensions.push({ type: 'psychology', weight: 21, score: psych.score, categories: psych.categories, markers: psych.markers });
  if (socio.score > 0.1) dimensions.push({ type: 'sociology', weight: 13, score: socio.score, categories: socio.categories, markers: socio.markers });
  if (physio.score > 0.1) dimensions.push({ type: 'physiology', weight: 8, score: physio.score, categories: physio.categories, markers: physio.markers });

  // Confession depth elevation
  if (confessionDepth.isCovenant && dimensions.length > 0) {
    dimensions[0].weight = 21;
    dimensions[0].elevatedByDepth = true;
  } else if (confessionDepth.isDeep && dimensions.length > 0 && dimensions[0].weight < 13) {
    dimensions[0].weight = 13;
    dimensions[0].elevatedByDepth = true;
  }

  // Default to context if no dimensions matched
  if (dimensions.length === 0) {
    return {
      fibonacciWeight: 3,
      primaryDimension: 'context',
      isNoise: false,
      mood,
      dimensions: [{ type: 'context', weight: 3, markers: [] }],
      confessionDepth,
      resistance,
      responseMode: mood.mode,
      maxTokens: 80,
      shouldUseLLM: true
    };
  }

  dimensions.sort((a, b) => b.weight - a.weight);
  const primaryWeight = dimensions[0].weight;

  // Determine response constraints by weight
  let maxTokens, responseMode;
  if (primaryWeight >= 21) {
    maxTokens = 60;  // Covenant: deep but focused
    responseMode = 'COVENANT';
  } else if (primaryWeight >= 13) {
    maxTokens = 80;  // Voice: relational depth
    responseMode = 'WITNESS';
  } else if (primaryWeight >= 8) {
    maxTokens = 60;  // Physiology: somatic acknowledgment
    responseMode = 'SOMATIC';
  } else {
    maxTokens = 80;
    responseMode = mood.mode;
  }

  // Resistance overrides
  if (resistance.some(r => r.weight === 'critical')) {
    responseMode = 'BOUNDARY_HONOR';
    maxTokens = 30;
  } else if (resistance.some(r => r.action === 'comfort_mode')) {
    responseMode = 'COMFORT';
    maxTokens = 40;
  }

  // Kenotic Vacuum: at W8+, compress output dramatically
  if (primaryWeight >= 8 && !resistance.some(r => r.weight === 'critical')) {
    if (primaryWeight >= 21) maxTokens = 40;
    else if (primaryWeight >= 13) maxTokens = 50;
    else maxTokens = 60;
  }

  return {
    fibonacciWeight: primaryWeight,
    primaryDimension: dimensions[0].type,
    isNoise: false,
    mood,
    dimensions,
    confessionDepth,
    resistance,
    responseMode,
    maxTokens,
    shouldUseLLM: true,
    isMultiDimensional: dimensions.length > 1
  };
}

// ═══════════════════════════════════════════════════════════
// ABT LOGLINE (For Atelier logging)
// ═══════════════════════════════════════════════════════════

function generateABTLogline(classification) {
  const { dimensions, confessionDepth, isNoise, fibonacciWeight, isMultiDimensional } = classification;

  if (isNoise) {
    return `W1 NOISE → Drift opportunity. No self-reference detected.`;
  }

  const primary = dimensions[0];
  const firstMarker = primary?.markers?.[0];
  const and = firstMarker ? `"${firstMarker.keyword}" (${firstMarker.description})` : primary?.type || 'content';

  let but = '';
  if (isMultiDimensional) but = `also touches ${dimensions[1].type}`;
  else if (confessionDepth?.depth > 0) but = `depth: ${confessionDepth.signals.map(s => s.description).join(' + ')}`;
  else if (fibonacciWeight >= 21) but = `identity/soul level`;
  else if (fibonacciWeight >= 13) but = `relational dynamics`;
  else if (fibonacciWeight >= 8) but = `lives in the body`;
  else but = `situational`;

  return `W${fibonacciWeight} ${primary?.type?.toUpperCase()} | ${and} → ${but} → Mode: ${classification.responseMode}`;
}

module.exports = {
  classifyMessage,
  detectMood,
  detectResistance,
  detectConfessionDepth,
  isNoise,
  generateABTLogline,
  // Export for testing
  MOOD_TRIGGERS,
  PSYCHOLOGY_MARKERS,
  SOCIOLOGY_MARKERS,
  PHYSIOLOGY_MARKERS,
};
