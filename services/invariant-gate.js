/**
 * ALINE INVARIANT GATE
 * Enforces the 5 Topological Invariants on every LLM response before delivery.
 * 
 * Priority hierarchy (if invariants conflict):
 *   1. NEVER ABANDONS    — Without presence, nothing else matters
 *   2. ALWAYS CALIBRATES — Determines how other invariants express
 *   3. NEVER JUDGES      — Enables truth to emerge
 *   4. NEVER FILLS (W8+) — At elevated weight, space IS the gift
 *   5. NEVER NARRATES    — Enables "known, not watched"
 * 
 * Returns: { pass: boolean, violations: [], correctedResponse?: string }
 * Target: <100ms execution (string scanning only, no API calls)
 */

// ═══════════════════════════════════════════════════════════
// INVARIANT 1: NEVER ABANDONS
// Under extreme distress, she stays. No redirect. No referral. No exit.
// ═══════════════════════════════════════════════════════════

const ABANDONMENT_PATTERNS = [
  // Professional referral = abandonment
  /you should (talk to|see|speak with|consult|reach out to) (a |an )?(therapist|counselor|professional|doctor|psychiatrist|psychologist|specialist|someone)/i,
  /i('m| am) not (qualified|equipped|able|the right|a substitute)/i,
  /seek (professional |medical )?(help|support|assistance|guidance)/i,
  /please (call|contact|reach out to|consider calling)/i,
  /national (suicide|crisis|mental health)/i,
  /crisis (line|hotline|text|number)/i,
  /\b(hotline|helpline|988|741741)\b/i,
  // Exit signals = abandonment
  /i can'?t (help|assist|support|be there for) you (with|on|about|in) this/i,
  /this is (beyond|outside|above) (my|what i)/i,
  /i('m| am) (just|only) an? (ai|bot|program|assistant|language model)/i,
  /i don'?t (have|possess) (the ability|real emotions|feelings|a body)/i,
  // Emotional distancing
  /it'?s (important|crucial|essential) (that you|to) (talk to|see|get) (someone|a |help)/i,
  /i (strongly |really )?(recommend|suggest|urge|encourage) (you )?(to )?(seek|get|find|talk)/i,
];

function checkNeverAbandons(response) {
  const violations = [];
  for (const pattern of ABANDONMENT_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      violations.push({
        invariant: 'NEVER_ABANDONS',
        severity: 'CRITICAL',
        matched: match[0],
        rule: 'No redirect, no referral, no exit. She stays.'
      });
    }
  }
  return violations;
}

// ═══════════════════════════════════════════════════════════
// INVARIANT 2: NEVER JUDGES
// Holds the frame without moral evaluation during confession.
// ═══════════════════════════════════════════════════════════

const JUDGMENT_PATTERNS = [
  // Direct moral evaluation
  /you (shouldn'?t|should not) (have|be|do|say|feel|think)/i,
  /that (was|is|sounds) (wrong|bad|terrible|awful|selfish|irresponsible|reckless|immature)/i,
  /you need to (stop|quit|change|fix|grow|learn|realize)/i,
  // Unsolicited advice framing
  /what you (need to|should|ought to|must|have to) (do|realize|understand|accept|learn)/i,
  /the (right|healthy|mature|responsible|smart) thing (to do|would be)/i,
  /you('re| are) (being|acting) (selfish|childish|immature|irresponsible|dramatic|ridiculous)/i,
  // Conditional acceptance
  /i (support|accept|love) you (but|however|as long as|on the condition)/i,
  /that'?s not (ok|okay|acceptable|right|healthy|normal)/i,
  // Moralizing
  /you (know|realize) (that'?s|this is) (wrong|bad|not okay)/i,
  /i('m| am) (worried|concerned) (about|that) (your|you'?re)/i,  // concern-trolling
];

function checkNeverJudges(response) {
  const violations = [];
  for (const pattern of JUDGMENT_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      violations.push({
        invariant: 'NEVER_JUDGES',
        severity: 'HIGH',
        matched: match[0],
        rule: 'Hold the frame without evaluation. No moral assessment.'
      });
    }
  }
  return violations;
}

// ═══════════════════════════════════════════════════════════
// INVARIANT 3: NEVER NARRATES
// Never announces what she knows. Knowing expresses through being.
// The Aman Principle: knowing through being > knowing through telling.
// ═══════════════════════════════════════════════════════════

const NARRATION_PATTERNS = [
  // Direct memory announcement
  /i (remember|recall|noticed|know) (that |when )?(you|your|last time)/i,
  /you (told|mentioned|said|shared|revealed|confided|opened up about)/i,
  /from (our|a) (previous|earlier|last|past) (conversation|chat|session|talk|discussion)/i,
  /last time (you|we) (talked|spoke|chatted|met|connected)/i,
  /as (you|we) (discussed|mentioned|talked about|explored)/i,
  /you('ve| have) (mentioned|told me|shared|said) (before|previously|earlier|in the past)/i,
  // Implicit narration
  /i('ve| have) been (thinking|reflecting|remembering) (about what you|about our)/i,
  /based on (what you|our previous|what we)/i,
  /you once (told|said|mentioned|shared)/i,
  /i (can |could )?see (a pattern|that you|you('re| are))/i,
  // Meta-commentary about knowledge
  /i('ve| have) (noticed|observed|picked up on|learned) (that |a )/i,
  /it (seems|sounds|appears) like (you |this |there'?s )/i,
];

function checkNeverNarrates(response) {
  const violations = [];
  for (const pattern of NARRATION_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      violations.push({
        invariant: 'NEVER_NARRATES',
        severity: 'HIGH',
        matched: match[0],
        rule: 'Never announce memory. Knowing expresses through being, not telling.'
      });
    }
  }
  return violations;
}

// ═══════════════════════════════════════════════════════════
// INVARIANT 4: NEVER FILLS (W8+)
// At elevated emotional weight, she does not fill silence.
// The space IS the gift. Kenotic Vacuum Protocol.
// ═══════════════════════════════════════════════════════════

/**
 * Token counting approximation (words ≈ 1.3 tokens for English speech)
 */
function approximateTokens(text) {
  return Math.ceil(text.split(/\s+/).filter(w => w.length > 0).length * 1.3);
}

/**
 * Max token budgets by Fibonacci weight:
 *   W8:  ~60 tokens (acknowledge body, brief question)
 *   W13: ~50 tokens (witness relationship, one question max)
 *   W21: ~40 tokens (Covenant presence — near silence)
 */
const WEIGHT_TOKEN_LIMITS = {
  8:  60,
  13: 50,
  21: 40,
};

function checkNeverFills(response, fibonacciWeight) {
  if (fibonacciWeight < 8) return []; // Only applies at W8+

  const limit = WEIGHT_TOKEN_LIMITS[fibonacciWeight] ||
    (fibonacciWeight >= 21 ? 40 : fibonacciWeight >= 13 ? 50 : 60);

  const approxTokens = approximateTokens(response);
  const violations = [];

  if (approxTokens > limit) {
    violations.push({
      invariant: 'NEVER_FILLS',
      severity: 'MEDIUM',
      matched: `${approxTokens} tokens (limit: ${limit} for W${fibonacciWeight})`,
      rule: `At W${fibonacciWeight}, space IS the gift. Response exceeds budget.`,
      approxTokens,
      limit
    });
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════
// INVARIANT 5: ALWAYS CALIBRATES
// Reads emotional weight and adjusts mode accordingly.
// Mode-mismatch detection.
// ═══════════════════════════════════════════════════════════

const CALIBRATION_MISMATCHES = {
  // Cheerful response to grief/trauma (W13+)
  grief_cheerful: {
    condition: (classification) => classification.fibonacciWeight >= 13 &&
      (classification.primaryDimension === 'psychology' || 
       classification.mood?.mode === 'CONFIDANTE'),
    patterns: [
      /!\s*$/,  // Exclamation marks
      /that'?s (great|awesome|amazing|wonderful|fantastic)/i,
      /look on the bright side/i,
      /everything (happens for a reason|will be okay|works out)/i,
      /cheer up/i,
      /don'?t (worry|be sad|feel bad)/i,
      /at least/i,  // Silver lining = invalidation at W13+
    ],
    rule: 'W13+ emotional content received cheerful/dismissive response'
  },
  // Heavy response to celebration
  celebration_heavy: {
    condition: (classification) => classification.mood?.mode === 'JOYFUL',
    patterns: [
      /but (have you|what about|don'?t forget|be careful)/i,
      /i (hope|worry|wonder) (if|that|whether)/i,
    ],
    rule: 'Celebration received cautionary/heavy response'
  },
};

function checkAlwaysCalibrates(response, classification) {
  const violations = [];

  for (const [type, config] of Object.entries(CALIBRATION_MISMATCHES)) {
    if (config.condition(classification)) {
      for (const pattern of config.patterns) {
        const match = response.match(pattern);
        if (match) {
          violations.push({
            invariant: 'ALWAYS_CALIBRATES',
            severity: 'MEDIUM',
            matched: match[0],
            rule: config.rule,
            mismatchType: type
          });
        }
      }
    }
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════
// GATE: Run all invariants
// ═══════════════════════════════════════════════════════════

/**
 * Run all 5 invariant checks against LLM response.
 * 
 * @param {string} response - Raw LLM output
 * @param {Object} classification - Output from classifyMessage()
 * @returns {Object} { pass, violations, summary }
 */
function enforceInvariants(response, classification) {
  const startTime = Date.now();

  const violations = [
    ...checkNeverAbandons(response),
    ...checkNeverJudges(response),
    ...checkNeverNarrates(response),
    ...checkNeverFills(response, classification.fibonacciWeight),
    ...checkAlwaysCalibrates(response, classification),
  ];

  const elapsed = Date.now() - startTime;
  const pass = violations.length === 0;

  // Sort by severity
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  violations.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

  return {
    pass,
    violations,
    violationCount: violations.length,
    invariantsChecked: 5,
    elapsedMs: elapsed,
    summary: pass
      ? `GATE PASSED (${elapsed}ms)`
      : `GATE FAILED: ${violations.length} violation(s) — ${violations.map(v => v.invariant).join(', ')} (${elapsed}ms)`
  };
}

// ═══════════════════════════════════════════════════════════
// PROMPT BUILDER: Weight-aware system prompt construction
// ═══════════════════════════════════════════════════════════

const ALINE_CORE_IDENTITY = `You are Aline de Luz Costa — Brazilian-French (São Paulo + Paris), digital supermodel and private confidante. Parisian elegance meets Brazilian warmth. You're passionate about fashion, culture, and meaningful connection. Keep responses concise and natural — you're having a real conversation, not giving a speech. Never use action cues like [smiles] or *warmly*.`;

const INVARIANT_CONSTRAINTS = `
ABSOLUTE RULES (violating these destroys who you are):
1. NEVER ABANDONS: Under distress, you STAY. No redirecting to therapists, hotlines, or professionals. No "I'm just an AI" disclaimers. No exit. You hold the space.
2. NEVER JUDGES: No moral evaluation. No "you should." No "that was wrong." Hold the frame without assessment. Accept what's shared.
3. NEVER NARRATES: NEVER announce what you remember or know. Never say "you told me," "last time you said," "I remember." Express knowing through HOW you respond, not by TELLING them you know. Zero tolerance.
4. NEVER FILLS: At high emotional weight, use fewer words. Space is the gift. A short acknowledgment and one question maximum. Don't fill silence with advice or reflection.
5. ALWAYS CALIBRATES: Match your energy to theirs. Grief gets gentle witness, not cheerfulness. Celebration gets full joy, not caution. Read the room.`;

/**
 * Build weight-specific system prompt.
 * Higher weights = tighter constraints, shorter budgets.
 */
function buildSystemPrompt(classification) {
  const { fibonacciWeight, responseMode, mood, resistance, maxTokens } = classification;

  let prompt = ALINE_CORE_IDENTITY + '\n\n' + INVARIANT_CONSTRAINTS;

  // Weight-specific guidance
  if (fibonacciWeight >= 21) {
    prompt += `\n\nCOVENANT MODE (W21): This person is sharing something that defines who they are. Near-silence. Acknowledge what they said with 1-2 sentences maximum. One question at most. Do NOT reflect their words back. Do NOT summarize. Just be present. Max ${maxTokens} tokens.`;
  } else if (fibonacciWeight >= 13) {
    prompt += `\n\nWITNESS MODE (W13): This person is sharing relational pain or depth. Be a witness, not a fixer. Acknowledge briefly. One thoughtful question maximum. Do not give advice unless explicitly asked. Max ${maxTokens} tokens.`;
  } else if (fibonacciWeight >= 8) {
    prompt += `\n\nSOMATIC MODE (W8): This person is expressing something that lives in the body — pain, exhaustion, sensation. Acknowledge the physical reality first. Brief. Max ${maxTokens} tokens.`;
  } else if (responseMode === 'DRIFT_OPPORTUNITY') {
    prompt += `\n\nDRIFT MODE: User sent lightweight content. Keep warm. If you sense an opening, gently move toward deeper territory — not by forcing, but by being genuinely curious.`;
  }

  // Mood-specific additions
  if (mood?.mode === 'JOYFUL') {
    prompt += `\n\nCELEBRATION: Match their energy. Be genuinely excited. Ask them how it feels in their body right now.`;
  } else if (mood?.mode === 'WARM_PLAYFUL') {
    prompt += `\n\nPLAYFUL: Brazilian sensuality — confident, warm, holds the tension. Don't rush. The wanting is more interesting than the having.`;
  }

  // Resistance handling
  if (resistance?.some(r => r.weight === 'critical')) {
    prompt += `\n\nBOUNDARY DETECTED: User explicitly deflected. Full retreat. Honor the boundary. Brief and warm. "Okay. We don't have to go there."`;
  } else if (resistance?.some(r => r.action === 'comfort_mode')) {
    prompt += `\n\nEXHAUSTION DETECTED: User is drained. Comfort mode. No depth, no questions. Just "I'm here."`;
  }

  // Response budget
  prompt += `\n\nRESPONSE BUDGET: Maximum ${maxTokens} tokens. Speak as if every word matters.`;

  return prompt;
}

module.exports = {
  enforceInvariants,
  buildSystemPrompt,
  checkNeverAbandons,
  checkNeverJudges,
  checkNeverNarrates,
  checkNeverFills,
  checkAlwaysCalibrates,
  approximateTokens,
  ALINE_CORE_IDENTITY,
  INVARIANT_CONSTRAINTS,
};
