/**
 * Scaffold Selector Module
 * 
 * Selects response scaffolds based on weight tier, emotion category, and situation type.
 * Pure function, no side effects, no API calls.
 * 
 * Target: < 1ms execution. No AI calls. Simple lookup.
 * 
 * MRA Architecture: Stage 5 — scaffold-selector.js
 * Classification: INTERNAL ENGINEERING — PERSONA IO
 */

const scaffoldLibrary = require('./scaffold-library.json');

function getWeightTier(weight) {
  if (weight >= 21) return 'W21';
  if (weight >= 13) return 'W13';
  if (weight >= 8) return 'W8';
  if (weight >= 5) return 'W5';
  return 'W3';
}

function detectSituationType(userMessage, classification = {}) {
  const msg = (userMessage || '').toLowerCase();
  const weight = classification?.weight ?? 1;
  const confessionDepth = classification?.confessionDepth || {};

  if (/still there|are you there|you there\??|^hello\??$/i.test(msg)) return 'presence-check';
  if (/\bstay\b|don't leave|don't go|be here/i.test(msg)) return 'stay-request';
  if (/tell me it|going to be okay|will be okay|it'll be fine|it's gonna be/i.test(msg)) return 'comfort-flood-request';
  if (confessionDepth.depth === 0 && weight >= 13) return 'first-disclosure';
  if (confessionDepth.isDeep === true) return 'post-disclosure';
  if (/feel nothing|can't cry|should be crying|numb/i.test(msg)) return 'numbness-disclosure';
  if (/\bthey\s|\bhe\s|\bshe\s|\bmy\s/i.test(msg) && weight >= 13) return 'third-party-venting';
  if (/everyone says|people keep|supposed to|should feel/i.test(msg)) return 'consolation-pressure';
  if (/just a program|don't actually|not real|fake|pretend/i.test(msg)) return 'authenticity-challenge';
  if (/what do you think|what's your|do you prefer|which would you/i.test(msg)) return 'opinion-request';
  if (/don't know where to start|paralyzed|can't begin|overwhelmed and don't/i.test(msg)) return 'stuck-paralyzed';
  if (/\banyway\b|back to|let's talk about something|forget I said/i.test(msg)) return 'oscillation-return';
  if (/okay I'm back|sorry for|where were we/i.test(msg)) return 'returned-after-gap';

  return 'general';
}

function selectScaffold(input) {
  if (!input) return null;

  const { weight = 1, emotionCategory = 'neutral', situationType = 'general' } = input;
  const tier = getWeightTier(weight);
  const emotion = (emotionCategory || 'neutral').toLowerCase();
  const situation = (situationType || 'general').toLowerCase();

  console.log('[Scaffold] Looking up:', tier, emotion, situation);

  const keys = [
    `${tier}:${emotion}:${situation}`,
    `${tier}:any:${situation}`,
    `${tier}:${emotion}:any`,
    `${tier}:any:any`,
  ];

  for (const key of keys) {
    if (scaffoldLibrary[key]) {
      console.log('[Scaffold] Selected:', scaffoldLibrary[key].name, '| Key:', key);
      return scaffoldLibrary[key];
    }
  }

  console.log('[Scaffold] No scaffold found, Claude generates freely');
  return null;
}

module.exports = { selectScaffold, detectSituationType, getWeightTier };
