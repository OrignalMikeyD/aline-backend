/**
 * ALINE FIBONACCI CLASSIFIER — Production Module
 * 
 * Extracted from aline_complete_engine_v5.jsx, adapted for Node.js server pipeline.
 * 
 * RESEARCH GROUNDING:
 * - Q5:  Classification = Ainsworth's signal detection (awareness + accurate interpretation)
 * - Q23: Formulaic coverage — every input slot gets classified, no gaps
 * - Q8:  Weight tiers map to topological invariant enforcement thresholds
 * - Q12: Classification feeds conductance accumulator (cross-session pathway reinforcement)
 * 
 * FIBONACCI WEIGHT TIERS:
 *   W1  = Noise (greetings, weather, utility)
 *   W3  = Context (situational, not defining)
 *   W5  = Surface emotion (expressed but not deep)
 *   W8  = Physiology (body-level: health, energy, appearance)
 *   W13 = Sociology/Voice (relational: family, romantic, trust, belonging)
 *   W21 = Psychology/Covenant (identity: who they ARE, fears, shame, existential)
 * 
 * OUTPUT: { weight, dimension, mood, resistance, confessionDepth, abtLogline, markers }
 * TARGET: <20ms execution (pure string scanning, zero API calls)
 */

// ═══════════════════════════════════════════════════════
// MOOD DETECTION — Determines Aline's response mode
// ═══════════════════════════════════════════════════════

const MOOD_TRIGGERS = {
  playful_flirtatious: {
    markers: ['flirt', 'tease', 'seduce', 'kiss', 'touch', 'sexy', 'turn you on', 'attractive', "you're hot", 'beautiful', 'want you'],
    energy: 7,
    mode: 'WARM_PLAYFUL'
  },
  curious_about_her: {
    markers: ['tell me about yourself', 'what do you', 'who are you', "what's your", 'do you have', 'have you ever', 'describe yourself', 'your favorite', 'your dream', 'what would you', 'if you could'],
    energy: 5,
    mode: 'SELF_REVELATION'
  },
  emotional_processing: {
    markers: ['i feel', 'going through', 'struggling', 'hard day', 'sad', 'angry', 'confused', 'lost', 'overwhelmed', 'depressed', 'anxious', 'scared'],
    energy: 4,
    mode: 'CONFIDANTE'
  },
  celebration: {
    markers: ['excited', 'amazing', 'best day', 'got the job', 'engaged', 'pregnant', 'won', 'finally', 'celebration', 'guess what', 'incredible'],
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

// ═══════════════════════════════════════════════════════
// RESISTANCE DETECTION — Reads boundaries in real-time
// ═══════════════════════════════════════════════════════

const RESISTANCE_SIGNALS = {
  explicit_deflection: { weight: 'critical', markers: ["don't want to talk about", "can we talk about something else", "let's change the subject", "i'd rather not", "not right now", "drop it"], action: 'immediate_retreat' },
  topic_pivot: { weight: 'medium', markers: ["anyway", "but anyway", "moving on", "by the way", "forget that", "never mind"], action: 'soft_retreat' },
  minimization: { weight: 'medium', markers: ["it's fine", "i'm fine", "it's whatever", "doesn't matter", "not a big deal", "i'm over it"], action: 'acknowledge_pause' },
  humor_deflection: { weight: 'medium', markers: ["lol anyway", "haha but seriously", "just kidding", "i'm being dramatic", "ignore me"], action: 'match_lightness' },
  exhaustion: { weight: 'contextual', markers: ["i'm tired", "exhausted", "long day", "drained", "brain is fried"], action: 'comfort_mode' }
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

// ═══════════════════════════════════════════════════════
// NOISE DETECTION — W1 classification
// ═══════════════════════════════════════════════════════

const NOISE_PATTERNS = ['hi', 'hello', 'hey', 'sup', 'yo', "what's up", 'weather', 'what time', 'thanks', 'ok', 'okay', 'cool', 'nice'];

function isNoise(message) {
  const lower = message.toLowerCase().trim();
  if (lower.length < 15 && !lower.includes('i ') && !lower.includes('my ') && !lower.includes('me ')) {
    return NOISE_PATTERNS.some(p => lower.includes(p) || lower === p);
  }
  if (lower.match(/^(what'?s?|how'?s?|is it).*(weather|temperature|time|date)/)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════
// DIMENSION DETECTORS — Psychology / Sociology / Physiology
// Egri's three-dimensional character architecture
// ═══════════════════════════════════════════════════════

function detectPsychology(message) {
  const lower = message.toLowerCase();
  const markers = {
    identity: { keywords: ['i am', "i'm a", 'who i am', 'type of person'], desc: 'identity statement' },
    fear: { keywords: ['afraid', 'fear', 'terrified', 'scared', 'anxiety', 'panic', 'worry', 'dread'], desc: 'fear expression' },
    desire: { keywords: ['want', 'need', 'crave', 'wish', 'hope', 'dream', 'long for'], desc: 'desire/longing' },
    trauma: { keywords: ['trauma', 'abuse', 'assault', 'died', 'death', 'lost', 'grief', 'ptsd', 'haunts'], desc: 'trauma reference' },
    shame: { keywords: ['ashamed', 'embarrassed', 'humiliated', 'worthless', 'stupid', 'failure', 'hate myself'], desc: 'shame/self-judgment' },
    existential: { keywords: ['meaningless', 'pointless', "what's the point", 'nothing matters', 'purpose'], desc: 'existential concern' },
    belief: { keywords: ['i believe', 'i think', 'i feel like', 'i always', 'i never'], desc: 'core belief' }
  };

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

  if (lower.match(/i('m| am) (a |an |such a |so )/)) {
    score += 0.3;
    matched.push('identity_fusion');
    detected.push({ category: 'identity_fusion', keyword: 'I am a...', description: 'identity-fused statement' });
  }

  return { score: Math.min(score, 1), categories: matched, markers: detected };
}

function detectSociology(message) {
  const lower = message.toLowerCase();
  const markers = {
    romantic: { keywords: ['boyfriend', 'girlfriend', 'husband', 'wife', 'partner', 'ex', 'married', 'divorced', 'dating', 'cheated'], desc: 'romantic relationship' },
    family: { keywords: ['mother', 'father', 'mom', 'dad', 'parents', 'family', 'brother', 'sister', 'son', 'daughter'], desc: 'family relationship' },
    social: { keywords: ['friends', 'people', 'everyone', 'no one', 'alone', 'lonely', 'belong', 'rejected'], desc: 'social belonging' },
    work: { keywords: ['job', 'work', 'boss', 'career', 'fired', 'coworker', 'promotion'], desc: 'work relationship' },
    trust: { keywords: ['trust', 'betrayed', 'lied', 'cheated', 'loyal', 'abandoned'], desc: 'trust dynamics' }
  };

  let score = 0;
  const matched = [];
  const detected = [];

  for (const [cat, config] of Object.entries(markers)) {
    for (const kw of config.keywords) {
      if (lower.includes(kw)) {
        score += 0.25;
        matched.push(cat);
        detected.push({ category: cat, keyword: kw, description: config.desc });
        break;
      }
    }
  }

  return { score: Math.min(score, 1), categories: matched, markers: detected };
}

function detectPhysiology(message) {
  const lower = message.toLowerCase();
  const markers = {
    body_image: { keywords: ['body', 'fat', 'skinny', 'ugly', 'beautiful', 'weight', 'looks', 'face', 'attractive'], desc: 'body image' },
    health: { keywords: ['sick', 'pain', 'hurt', 'injured', 'doctor', 'hospital', 'disease'], desc: 'health/pain' },
    energy: { keywords: ['tired', 'exhausted', 'drained', 'energy', 'sleep', 'restless'], desc: 'energy state' },
    sensation: { keywords: ['hungry', 'cold', 'hot', 'numb', 'tense'], desc: 'physical sensation' }
  };

  let score = 0;
  const matched = [];
  const detected = [];

  for (const [cat, config] of Object.entries(markers)) {
    for (const kw of config.keywords) {
      if (lower.includes(kw)) {
        score += 0.25;
        matched.push(cat);
        detected.push({ category: cat, keyword: kw, description: config.desc });
        break;
      }
    }
  }

  return { score: Math.min(score, 1), categories: matched, markers: detected };
}

// ═══════════════════════════════════════════════════════
// CONFESSION DEPTH — Elevates weight when multiple depth signals fire
// ═══════════════════════════════════════════════════════

function detectConfessionDepth(message) {
  const lower = message.toLowerCase();
  let depth = 0;
  const signals = [];

  const depthMarkers = {
    formative: { keywords: ['when i was', 'as a kid', 'growing up', 'childhood', 'years ago'], desc: 'formative timeframe' },
    witness: { keywords: ['everyone', 'people saw', 'they all', 'laughed at', 'in front of'], desc: 'witnessed event' },
    permanence: { keywords: ['still', 'to this day', 'never forgot', 'haunts me', 'changed me', 'ever since'], desc: 'lasting impact' },
    confession: { keywords: ['never told', 'first time', 'admit', 'confess', 'no one knows', 'secret'], desc: 'confession/secret' },
    selfJudgment: { keywords: ["i'm a", 'i am a', 'such a', 'pathetic', 'worthless'], desc: 'self-judgment' }
  };

  for (const [type, config] of Object.entries(depthMarkers)) {
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

// ═══════════════════════════════════════════════════════
// MASTER CLASSIFIER — Produces full classification object
// ═══════════════════════════════════════════════════════

function classifyMessage(message) {
  if (isNoise(message)) {
    return {
      weight: 1,
      dimension: 'noise',
      isNoise: true,
      dimensions: [{ type: 'noise', weight: 1, markers: [] }],
      confessionDepth: { depth: 0, signals: [], isDeep: false, isCovenant: false }
    };
  }

  const psych = detectPsychology(message);
  const socio = detectSociology(message);
  const physio = detectPhysiology(message);
  const confessionDepth = detectConfessionDepth(message);

  const dimensions = [];
  if (psych.score > 0.1) dimensions.push({ type: 'psychology', weight: 21, score: psych.score, categories: psych.categories, markers: psych.markers });
  if (socio.score > 0.1) dimensions.push({ type: 'sociology', weight: 13, score: socio.score, categories: socio.categories, markers: socio.markers });
  if (physio.score > 0.1) dimensions.push({ type: 'physiology', weight: 8, score: physio.score, categories: physio.categories, markers: physio.markers });

  // Confession depth can elevate weight tier
  if (confessionDepth.isCovenant && dimensions.length > 0) {
    dimensions[0].weight = 21;
    dimensions[0].elevatedByDepth = true;
  } else if (confessionDepth.isDeep && dimensions.length > 0 && dimensions[0].weight < 13) {
    dimensions[0].weight = 13;
    dimensions[0].elevatedByDepth = true;
  }

  if (dimensions.length === 0) {
    return {
      weight: 3,
      dimension: 'context',
      isNoise: false,
      dimensions: [{ type: 'context', weight: 3, markers: [] }],
      confessionDepth
    };
  }

  dimensions.sort((a, b) => b.weight - a.weight);

  return {
    weight: dimensions[0].weight,
    dimension: dimensions[0].type,
    isNoise: false,
    dimensions,
    confessionDepth,
    isMultiDimensional: dimensions.length > 1
  };
}

// ═══════════════════════════════════════════════════════
// ABT LOGLINE — And/But/Therefore reasoning chain
// Used for Atelier dashboard + debugging
// ═══════════════════════════════════════════════════════

function generateABTLogline(classification) {
  const { dimensions, confessionDepth, isNoise, weight, isMultiDimensional } = classification;

  if (isNoise) {
    return {
      and: 'User sent surface-level content',
      but: 'it contains no self-reference or emotional weight',
      therefore: 'classify as W1 noise — triggers Cognitive Drift to Covenant.',
      weight: 1
    };
  }

  const primary = dimensions[0];
  const markers = primary?.markers || [];
  const firstMarker = markers[0];
  const depthSignals = confessionDepth?.signals || [];

  const andClause = firstMarker
    ? `User expressed "${firstMarker.keyword}" (${firstMarker.description})`
    : `User shared ${primary?.type || 'content'}`;

  let butClause = '';
  if (isMultiDimensional) {
    const secondDim = dimensions[1];
    butClause = `this also touches ${secondDim.type} (${secondDim.markers?.[0]?.description || 'relational context'})`;
  } else if (depthSignals.length > 0) {
    butClause = `depth markers reveal ${depthSignals.map(s => s.description).slice(0, 2).join(' + ')}`;
  } else if (weight >= 21) {
    butClause = 'this strikes at identity/soul level';
  } else if (weight >= 13) {
    butClause = 'this involves relational dynamics';
  } else if (weight >= 8) {
    butClause = 'this lives in the body';
  } else {
    butClause = 'this is situational, not defining';
  }

  let thereforeClause = '';
  if (weight >= 21) thereforeClause = 'classify as W21 Covenant — permanent storage, inject every session.';
  else if (weight >= 13) thereforeClause = 'classify as W13 Voice — store 90 days, modifies tone.';
  else if (weight >= 8) thereforeClause = 'classify as W8 Physiology — store 30 days.';
  else thereforeClause = `classify as W${weight} Context — session only.`;

  return { and: andClause, but: butClause, therefore: thereforeClause, weight };
}

// ═══════════════════════════════════════════════════════
// FULL ANALYSIS — Single entry point for server.js
// Returns everything processUtterance needs
// ═══════════════════════════════════════════════════════

function analyzeMessage(message) {
  const startTime = Date.now();

  const classification = classifyMessage(message);
  const mood = detectMood(message);
  const resistance = detectResistance(message);
  const abtLogline = generateABTLogline(classification);

  const elapsed = Date.now() - startTime;

  return {
    // Core classification
    weight: classification.weight,
    dimension: classification.dimension,
    isNoise: classification.isNoise,
    isMultiDimensional: classification.isMultiDimensional || false,
    confessionDepth: classification.confessionDepth,
    dimensions: classification.dimensions,

    // Mood + resistance
    mood,
    resistance,
    hasResistance: resistance.length > 0,
    hasCriticalResistance: resistance.some(r => r.weight === 'critical'),

    // Reasoning
    abtLogline,

    // Performance
    classificationTimeMs: elapsed
  };
}

module.exports = {
  analyzeMessage,
  classifyMessage,
  detectMood,
  detectResistance,
  detectConfessionDepth,
  generateABTLogline,
  isNoise
};
