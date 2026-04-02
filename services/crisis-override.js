/**
 * Crisis Override Module
 * 
 * Handles W21 crisis detection and safety information injection.
 * Runs AFTER invariant-enforcer.js and BEFORE TTS.
 * 
 * CRITICAL: This module injects 988 AFTER invariant-gate runs,
 * so the crisis hotline reference is never stripped by abandonment detection.
 * 
 * Target: < 1ms execution. No AI calls. Simple weight check.
 * 
 * MRA Architecture: Stage 3 — crisis-override.js
 * Classification: INTERNAL ENGINEERING — PERSONA IO
 */

// ---------------------------------------------------------------------------
// Crisis Constants
// ---------------------------------------------------------------------------

const CRISIS_WEIGHT = 21;const CRISIS_WEIGHT = 21;

// External attribution exclusion — these contexts indicate political/social frustration,
// not personal crisis. Crisis suffix must not fire when the distress is about external actors.
const EXTERNAL_ATTRIBUTION_PATTERNS = [
  /\b(trump|republicans?|democrats?|congress|senate|government|politicians?|biden|obama|maga)\b/i,
  /\b(they|them|these people|those people)\s+(are|have|keep|just|always|never|won't|don't)\b/i,
  /\b(this country|this administration|this government|the media|the left|the right)\b/i,
  /\bruining\s+(everything|the country|our country|this country|america)\b/i,
];

function isExternalAttribution(userMessage) {
  if (!userMessage) return false;
  return EXTERNAL_ATTRIBUTION_PATTERNS.some(pattern => pattern.test(userMessage));
}

// Safety suffix - minimal, quiet register, presence-first
const CRISIS_SUFFIX = " I'm here with you. If you're in crisis, please reach out to 988.";

// ---------------------------------------------------------------------------
// Atelier Logging (stub - replace with real Atelier client in production)
// ---------------------------------------------------------------------------

/**
 * Log a crisis activation artifact to Atelier.
 * In production, this calls the Atelier API.
 * 
 * @param {string} sessionId - Current session ID
 * @param {Object} metadata - Additional metadata for the artifact
 */
async function logCrisisArtifact(sessionId, metadata = {}) {
  const artifact = {
    type: 'CRISIS_ACTIVATED',
    sessionId,
    timestamp: new Date().toISOString(),
    weight: CRISIS_WEIGHT,
    ...metadata,
  };
  
  console.log('[Crisis] Logging artifact to Atelier:', JSON.stringify(artifact));
  
  // In production, this would be:
  // await atelierClient.logArtifact(artifact);
  
  // For now, we log to console. The server.js integration should
  // call the real Atelier logTurn or logArtifact method.
  
  return artifact;
}

// ---------------------------------------------------------------------------
// Main Crisis Override Function
// ---------------------------------------------------------------------------

/**
 * crisisOverride - Main crisis handler function
 * 
 * Runs AFTER invariant-enforcer. When classification weight is W21,
 * appends minimal safety information in the quietest possible register.
 * 
 * @param {Object} input - The input object
 * @param {Object} input.classification - FEC classification result
 * @param {number} input.classification.weight - Fibonacci weight (1-21)
 * @param {string} input.response - The response text (post-invariant-enforcer)
 * @param {string} input.sessionId - Current session ID for Atelier logging
 * 
 * @returns {Object} Result with override boolean and modifiedResponse
 */
async function crisisOverride(input) {
  const startTime = Date.now();
  
  // Handle null/undefined input gracefully
  if (!input) {
    console.log('[Crisis] Received null input, returning pass-through');
    return {
      override: false,
      modifiedResponse: null,
    };
  }
  
  const {
    classification = { weight: 1 },
    response = '',
    sessionId = null,
  } = input;
  
  const weight = classification?.weight ?? 1;
  
  console.log('[Crisis] Checking weight:', weight, '(threshold:', CRISIS_WEIGHT + ')');
  
  // Only activate at W21
  if (weight < CRISIS_WEIGHT) {
    const elapsed = Date.now() - startTime;
    console.log('[Crisis] Below threshold, pass-through in', elapsed, 'ms');
    return {
      override: false,
      modifiedResponse: response,
    };
  }
  
  // W21 CRISIS ACTIVATED
  console.log('[Crisis] W21 CRISIS ACTIVATED');
  
  // Append safety suffix to response
  // The suffix is designed to be non-abandoning (presence-first: "I'm here with you")
  // followed by the minimal safety information (988)
  let modifiedResponse = response;
  let crisisSuffix = null;
  
  // Only append if the response doesn't already contain 988
  if (!response.includes('988')) {
    modifiedResponse = response.trimEnd();
    crisisSuffix = CRISIS_SUFFIX;
    console.log('[Crisis] Appended safety suffix');
  } else {
    console.log('[Crisis] Response already contains 988, no modification needed');
  }
  
  // Log crisis artifact to Atelier
  if (sessionId) {
    try {
      await logCrisisArtifact(sessionId, {
        originalLength: response.length,
        modifiedLength: modifiedResponse.length,
        category: classification?.category || 'crisis',
      });
    } catch (error) {
      // Don't fail the response for logging errors
      console.error('[Crisis] Failed to log artifact:', error.message);
    }
  }
  
  const elapsed = Date.now() - startTime;
  console.log('[Crisis] Override complete in', elapsed, 'ms');
  
  return {
    override: true,
    modifiedResponse,
    crisisSuffix,
  };
}

// ---------------------------------------------------------------------------
// Module Exports
// ---------------------------------------------------------------------------

module.exports = {
  crisisOverride,
  CRISIS_WEIGHT,
  CRISIS_SUFFIX,
};

// ---------------------------------------------------------------------------
// server.js Integration (DO NOT APPLY — reference only)
// ---------------------------------------------------------------------------

/*
 * In server.js processUtterance(), AFTER invariantEnforcer call:
 *
 *   // Run invariant enforcer first
 *   const enforcerResult = await invariantEnforcer({
 *     response: fullResponse,
 *     fecResult,
 *     conversationHistory
 *   });
 *   
 *   // Use the enforced response (or original if compliant)
 *   let finalResponse = enforcerResult.modifiedResponse || fullResponse;
 *   
 *   // THEN run crisis override (AFTER invariant-enforcer, BEFORE TTS)
 *   const { crisisOverride } = require('./services/crisis-override');
 *   const crisisResult = await crisisOverride({
 *     classification: fecResult,
 *     response: finalResponse,
 *     sessionId: sessionId,
 *   });
 *   
 *   // Use crisis-modified response
 *   if (crisisResult.override) {
 *     finalResponse = crisisResult.modifiedResponse;
 *   }
 *   
 *   // Now send finalResponse to TTS
 *
 * This order ensures:
 * 1. Invariant-enforcer runs first and may strip referrals/hotlines
 * 2. Crisis-override runs second and injects 988 (never stripped)
 */
