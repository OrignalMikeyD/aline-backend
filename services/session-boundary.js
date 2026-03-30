/**
 * Session Boundary Module
 *
 * Manages session start/end state and generates opening calibration
 * from prior session ending weight. Extends Never Abandons across sessions.
 *
 * MRA Architecture: Stage 5 — session-boundary.js
 * Classification: INTERNAL ENGINEERING — PERSONA IO
 */

const OPENING_CALIBRATIONS = {
  low:    'Open naturally. Full warmth. Normal engagement energy.',
  medium: 'Open gently. Quieter opening, invites rather than activates. Wait for user to set tone.',
  high:   'Open in Witness mode. Minimal content. High warmth. Wait for user to re-establish direction.',
  deep:   'Open in Deep Holding. Fully present and near-silent until user actively re-engages.',
  crisis: 'Open with care check. Acknowledge intensity without narrating it. Safety resources available.',
};

function getOpeningCalibration(lastEndWeight) {
  if (!lastEndWeight) return OPENING_CALIBRATIONS.low;
  if (lastEndWeight >= 21) return OPENING_CALIBRATIONS.crisis;
  if (lastEndWeight >= 14) return OPENING_CALIBRATIONS.deep;
  if (lastEndWeight >= 9)  return OPENING_CALIBRATIONS.high;
  if (lastEndWeight >= 6)  return OPENING_CALIBRATIONS.medium;
  return OPENING_CALIBRATIONS.low;
}

function startSession(userId, userProfile) {
  const lastWeight = userProfile?.last_session_end_weight || null;
  const lastCrisis = userProfile?.last_session_crisis || false;
  const sessionCount = userProfile?.session_count || 0;

  const openingCalibration = lastCrisis
    ? OPENING_CALIBRATIONS.crisis
    : getOpeningCalibration(lastWeight);

  console.log('[Session Boundary] Starting session for user:', userId);
  console.log('[Session Boundary] Prior sessions:', sessionCount, '| Last weight:', lastWeight, '| Last crisis:', lastCrisis);
  console.log('[Session Boundary] Opening calibration:', openingCalibration.substring(0, 60) + '...');

  return {
    openingCalibration,
    openingMode: lastWeight >= 9 ? 'witness' : 'presence',
    priorSessionSummary: {
      sessionCount,
      lastWeight,
      lastCrisis,
    },
  };
}

function endSession(sessionData) {
  const {
    sessionId,
    finalFecWeight = 2,
    finalMode = 'companion',
    crisisActivated = false,
    deltaV = 0,
    dominantCategories = {},
    turnCount = 0,
  } = sessionData || {};

  console.log('[Session Boundary] Ending session:', sessionId);
  console.log('[Session Boundary] Final weight: W' + finalFecWeight, '| Crisis:', crisisActivated, '| ΔV:', deltaV.toFixed(3));

  return {
    sessionId,
    finalFecWeight,
    finalMode,
    crisisActivated,
    deltaV,
    dominantCategories,
    turnCount,
  };
}

module.exports = { startSession, endSession, getOpeningCalibration, OPENING_CALIBRATIONS };
