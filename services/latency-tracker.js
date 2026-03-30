/**
 * Latency Tracker Module
 *
 * Per-stage pipeline timing with 800ms biological threshold flag.
 * The 800ms threshold is a neurological phase transition — above it
 * users perceive tool-use rather than social presence.
 *
 * MRA Architecture: Stage 6 — latency-tracker.js
 * Classification: INTERNAL ENGINEERING — PERSONA IO
 */

const BIOLOGICAL_THRESHOLD_MS = 800;

function start(sessionId, turnNumber) {
  const turnStart = Date.now();
  const stages = {};

  function mark(stageName) {
    stages[stageName] = Date.now() - turnStart;
  }

  function finish() {
    const totalMs = Date.now() - turnStart;
    const sub800ms = totalMs < BIOLOGICAL_THRESHOLD_MS;

    const result = {
      sessionId,
      turnNumber,
      stages,
      totalMs,
      sub800ms,
    };

    if (!sub800ms) {
      console.log('[Latency] VIOLATION: Turn', turnNumber, 'took', totalMs + 'ms (threshold:', BIOLOGICAL_THRESHOLD_MS + 'ms)');
      console.log('[Latency] Stage breakdown:', JSON.stringify(stages));
    } else {
      console.log('[Latency] Turn', turnNumber, ':', totalMs + 'ms (sub-800ms: YES)');
    }

    return result;
  }

  return { mark, finish };
}

module.exports = { start, BIOLOGICAL_THRESHOLD_MS };
