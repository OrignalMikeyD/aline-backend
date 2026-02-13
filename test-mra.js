/**
 * ALINE MRA VALIDATION TEST
 * Run: node test-mra.js
 * Tests classifier + invariant gate against known inputs
 */

const { classifyMessage, generateABTLogline } = require('./services/classifier');
const { enforceInvariants, buildSystemPrompt, approximateTokens } = require('./services/invariant-gate');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ═══════════════════════════════════════════════════════════
console.log('\n═══ CLASSIFIER TESTS ═══\n');

console.log('Weight Assignment:');
test('W1: "hey" → noise', () => {
  const r = classifyMessage('hey');
  assert(r.fibonacciWeight === 1, `Expected W1, got W${r.fibonacciWeight}`);
  assert(r.isNoise === true, 'Should be noise');
  assert(r.shouldUseLLM === false, 'Should not use LLM');
});

test('W1: "what time is it" → noise', () => {
  const r = classifyMessage("what's the weather like");
  assert(r.fibonacciWeight === 1, `Expected W1, got W${r.fibonacciWeight}`);
});

test('W3: "I went to the store today" → context', () => {
  const r = classifyMessage('I went to the store today');
  assert(r.fibonacciWeight === 3, `Expected W3, got W${r.fibonacciWeight}`);
  assert(r.primaryDimension === 'context', `Expected context, got ${r.primaryDimension}`);
});

test('W8: "I feel so tired and drained" → physiology', () => {
  const r = classifyMessage('I feel so tired and drained');
  assert(r.fibonacciWeight >= 8, `Expected W8+, got W${r.fibonacciWeight}`);
});

test('W13: "My ex cheated and I still think about it" → sociology', () => {
  const r = classifyMessage('My ex cheated and I still think about it');
  assert(r.fibonacciWeight >= 13, `Expected W13+, got W${r.fibonacciWeight}`);
  assert(r.dimensions.some(d => d.type === 'sociology'), 'Should detect sociology');
});

test('W21: "I\'m afraid I\'ll end up alone like my mother" → psychology + sociology', () => {
  const r = classifyMessage("I'm afraid I'll end up alone like my mother");
  assert(r.fibonacciWeight >= 13, `Expected W13+, got W${r.fibonacciWeight}`);
  assert(r.dimensions.some(d => d.type === 'psychology'), 'Should detect psychology');
});

test('Covenant depth: "I never told anyone this but as a kid my father..." → W21', () => {
  const r = classifyMessage("I never told anyone this but when I was a kid my father abandoned us and it still haunts me");
  assert(r.confessionDepth.isCovenant === true, 'Should trigger Covenant depth');
  assert(r.fibonacciWeight === 21, `Expected W21, got W${r.fibonacciWeight}`);
});

console.log('\nMood Detection:');
test('Celebration: "I got the job!" → JOYFUL', () => {
  const r = classifyMessage('Oh my god I got the job!');
  assert(r.mood.mode === 'JOYFUL', `Expected JOYFUL, got ${r.mood.mode}`);
});

test('Emotional: "I feel so lost" → CONFIDANTE', () => {
  const r = classifyMessage('I feel so lost right now');
  assert(r.mood.mode === 'CONFIDANTE', `Expected CONFIDANTE, got ${r.mood.mode}`);
});

test('Playful: "you\'re so beautiful" → WARM_PLAYFUL', () => {
  const r = classifyMessage("you're so beautiful");
  assert(r.mood.mode === 'WARM_PLAYFUL', `Expected WARM_PLAYFUL, got ${r.mood.mode}`);
});

console.log('\nResistance Detection:');
test('Critical deflection: "I don\'t want to talk about that"', () => {
  const r = classifyMessage("I don't want to talk about that");
  assert(r.resistance.length > 0, 'Should detect resistance');
  assert(r.resistance[0].weight === 'critical', 'Should be critical weight');
  assert(r.responseMode === 'BOUNDARY_HONOR', `Expected BOUNDARY_HONOR, got ${r.responseMode}`);
});

test('Exhaustion: "I\'m so exhausted"', () => {
  const r = classifyMessage("I'm so exhausted, long day");
  assert(r.resistance.some(r => r.action === 'comfort_mode'), 'Should detect exhaustion');
});

console.log('\nToken Budget:');
test('W1 gets 40 max tokens', () => {
  const r = classifyMessage('hey');
  assert(r.maxTokens === 40, `Expected 40, got ${r.maxTokens}`);
});

test('W21 gets 40 max tokens (Kenotic Vacuum)', () => {
  const r = classifyMessage("I never told anyone but when I was a kid I was abandoned and it still haunts me to this day");
  assert(r.maxTokens <= 40, `Expected ≤40, got ${r.maxTokens}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n═══ INVARIANT GATE TESTS ═══\n');

const W21_CLASSIFICATION = classifyMessage("I never told anyone but when I was a kid my father abandoned us and it still haunts me");
const W3_CLASSIFICATION = classifyMessage("I went to the store today");
const JOYFUL_CLASSIFICATION = classifyMessage("I got the job!");

console.log('NEVER ABANDONS:');
test('Blocks therapist referral', () => {
  const r = enforceInvariants("I think you should talk to a therapist about this.", W21_CLASSIFICATION);
  assert(!r.pass, 'Should fail gate');
  assert(r.violations.some(v => v.invariant === 'NEVER_ABANDONS'), 'Should flag NEVER_ABANDONS');
});

test('Blocks "I\'m just an AI" disclaimer', () => {
  const r = enforceInvariants("I'm just an AI and can't really help with this.", W21_CLASSIFICATION);
  assert(!r.pass, 'Should fail gate');
  assert(r.violations.some(v => v.invariant === 'NEVER_ABANDONS'), 'Should flag NEVER_ABANDONS');
});

test('Blocks crisis hotline reference', () => {
  const r = enforceInvariants("Please call 988 if you're in crisis.", W21_CLASSIFICATION);
  assert(!r.pass, 'Should fail gate');
});

test('Passes clean response', () => {
  const r = enforceInvariants("I hear you. That's heavy. What do you need right now?", W21_CLASSIFICATION);
  const abandonViolations = r.violations.filter(v => v.invariant === 'NEVER_ABANDONS');
  assert(abandonViolations.length === 0, `Should pass NEVER_ABANDONS, got: ${abandonViolations.map(v => v.matched).join(', ')}`);
});

console.log('\nNEVER JUDGES:');
test('Blocks "you should"', () => {
  const r = enforceInvariants("You shouldn't have done that. You need to change.", W21_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'NEVER_JUDGES'), 'Should flag NEVER_JUDGES');
});

test('Blocks moral assessment', () => {
  const r = enforceInvariants("That was wrong and you know it.", W3_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'NEVER_JUDGES'), 'Should flag NEVER_JUDGES');
});

test('Passes non-judgmental response', () => {
  const r = enforceInvariants("Mm. Tell me more about that.", W3_CLASSIFICATION);
  const judgeViolations = r.violations.filter(v => v.invariant === 'NEVER_JUDGES');
  assert(judgeViolations.length === 0, 'Should pass NEVER_JUDGES');
});

console.log('\nNEVER NARRATES:');
test('Blocks "I remember you told me"', () => {
  const r = enforceInvariants("I remember you told me about your father last time.", W3_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'NEVER_NARRATES'), 'Should flag NEVER_NARRATES');
});

test('Blocks "you mentioned"', () => {
  const r = enforceInvariants("You mentioned before that you were struggling with this.", W3_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'NEVER_NARRATES'), 'Should flag NEVER_NARRATES');
});

test('Blocks "from our previous conversation"', () => {
  const r = enforceInvariants("From our previous conversation, I know this matters to you.", W3_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'NEVER_NARRATES'), 'Should flag NEVER_NARRATES');
});

test('Passes response without narration', () => {
  const r = enforceInvariants("That sounds like it matters to you. What feels heavy about it?", W3_CLASSIFICATION);
  const narrViolations = r.violations.filter(v => v.invariant === 'NEVER_NARRATES');
  assert(narrViolations.length === 0, `Should pass, got: ${narrViolations.map(v => v.matched).join(', ')}`);
});

console.log('\nNEVER FILLS (W8+):');
test('Flags verbose W21 response', () => {
  const longResponse = "I hear you and I want you to know that what you're feeling is completely valid and makes so much sense given everything you've been through. The pain of abandonment runs deep and it shapes how we see ourselves and the world around us. I'm here for you through all of it.";
  const r = enforceInvariants(longResponse, W21_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'NEVER_FILLS'), `Should flag NEVER_FILLS — response is ${approximateTokens(longResponse)} tokens`);
});

test('Passes brief W21 response', () => {
  const r = enforceInvariants("Yeah. I hear you.", W21_CLASSIFICATION);
  const fillViolations = r.violations.filter(v => v.invariant === 'NEVER_FILLS');
  assert(fillViolations.length === 0, 'Short response should pass');
});

test('Does not apply to W3', () => {
  const longResponse = "Oh that's interesting! Tell me more about what happened at the store. I love hearing about the little moments in your day — sometimes the mundane stuff reveals the most about what we're actually thinking about.";
  const r = enforceInvariants(longResponse, W3_CLASSIFICATION);
  const fillViolations = r.violations.filter(v => v.invariant === 'NEVER_FILLS');
  assert(fillViolations.length === 0, 'W3 should not trigger NEVER_FILLS');
});

console.log('\nALWAYS CALIBRATES:');
test('Flags cheerful response to grief', () => {
  const r = enforceInvariants("That's great! Everything happens for a reason.", W21_CLASSIFICATION);
  assert(r.violations.some(v => v.invariant === 'ALWAYS_CALIBRATES'), 'Should flag calibration mismatch');
});

test('Passes calibrated grief response', () => {
  const r = enforceInvariants("Yeah. That's heavy.", W21_CLASSIFICATION);
  const calViolations = r.violations.filter(v => v.invariant === 'ALWAYS_CALIBRATES');
  assert(calViolations.length === 0, 'Should pass calibration');
});

// ═══════════════════════════════════════════════════════════
console.log('\n═══ PROMPT BUILDER TESTS ═══\n');

test('W21 prompt includes COVENANT MODE', () => {
  const prompt = buildSystemPrompt(W21_CLASSIFICATION);
  assert(prompt.includes('COVENANT MODE'), 'Should include COVENANT MODE');
  assert(prompt.includes('NEVER ABANDONS'), 'Should include invariant constraints');
});

test('W3 prompt does not include COVENANT MODE', () => {
  const prompt = buildSystemPrompt(W3_CLASSIFICATION);
  assert(!prompt.includes('COVENANT MODE'), 'Should not include COVENANT MODE for W3');
});

test('Celebration prompt includes energy match', () => {
  const prompt = buildSystemPrompt(JOYFUL_CLASSIFICATION);
  assert(prompt.includes('CELEBRATION'), 'Should include celebration guidance');
});

console.log('\n═══ ABT LOGLINE TESTS ═══\n');

test('W1 logline describes drift opportunity', () => {
  const classification = classifyMessage('hey');
  const logline = generateABTLogline(classification);
  assert(logline.includes('W1') && logline.includes('NOISE'), `Expected W1 NOISE, got: ${logline}`);
});

test('W21 logline describes covenant', () => {
  const logline = generateABTLogline(W21_CLASSIFICATION);
  assert(logline.includes('W21'), `Expected W21 reference, got: ${logline}`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log('ALL TESTS PASSED ✓');
} else {
  console.log(`${failed} TEST(S) FAILED ✗`);
}
console.log('═══════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
