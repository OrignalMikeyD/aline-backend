/**
 * DRIFT SCANNER — Vocabulary health check
 * Scans session transcripts for boundary-crossing words
 */

const BRAND_IN_CONVERSATION = [
  /\bmy presence\b/i,
  /\bthis encounter\b/i,
  /\bour encounter\b/i,
  /\bi am calibrated\b/i,
  /\bi attend to\b/i,
  /\bshaped by our relationship\b/i,
  /\bwith discretion\b/i,
  /\bmy fluency\b/i,
  /\bfluent in you\b/i,
  /\bearned intimacy\b/i,
];

const DRIFT_PATTERNS = [
  { pattern: /\bshifting gears\b/i,           label: 'SUBJECT-CHANGE NAMING', severity: 'CRITICAL', direction: 'PRODUCT>>BRAND' },
  { pattern: /\bI notice you changed\b/i,     label: 'SUBJECT-CHANGE NAMING', severity: 'CRITICAL', direction: 'PRODUCT>>BRAND' },
  { pattern: /\bhow can I help\b/i,           label: 'SERVICE FRAME',         severity: 'CRITICAL', direction: 'PRODUCT>>BRAND' },
  { pattern: /\bI understand exactly how\b/i, label: 'EXPERIENCE CLAIM',      severity: 'CRITICAL', direction: 'PRODUCT>>BRAND' },
  { pattern: /\bHello\b/i,                    label: 'TRANSACTIONAL OPENER',  severity: 'HIGH',     direction: 'PRODUCT>>BRAND' },
  { pattern: /\bat least\b/i,                 label: 'MINIMIZATION',          severity: 'HIGH',     direction: 'PRODUCT>>BRAND' },
  { pattern: /\bI hear you\b/i,               label: 'PERFORMED LISTENING',   severity: 'HIGH',     direction: 'PRODUCT>>BRAND' },
  { pattern: /\bpivoting\b/i,                 label: 'SUBJECT-CHANGE NAMING', severity: 'HIGH',     direction: 'PRODUCT>>BRAND' },
  { pattern: /\bcoming back to\b/i,           label: 'SUBJECT-CHANGE NAMING', severity: 'HIGH',     direction: 'PRODUCT>>BRAND' },
];

function scanSession(turns) {
  const violations = [];
  const alineResponses = turns.filter(t => t.role === 'assistant');

  for (const turn of alineResponses) {
    for (const pattern of BRAND_IN_CONVERSATION) {
      if (pattern.test(turn.content)) {
        violations.push({
          type: 'BRAND_IN_CONVERSATION',
          pattern: pattern.toString(),
          severity: 'HIGH',
          direction: 'BRAND>>PRODUCT (slow erosion)',
          sample: turn.content.slice(0, 80)
        });
      }
    }
    for (const entry of DRIFT_PATTERNS) {
      if (entry.pattern.test(turn.content)) {
        violations.push({
          type: 'DRIFT_PATTERN',
          label: entry.label,
          severity: entry.severity,
          direction: entry.direction,
          sample: turn.content.slice(0, 80)
        });
      }
    }
  }

  return {
    sessionId: turns[0]?.sessionId || 'unknown',
    totalTurns: alineResponses.length,
    violations,
    flagged: violations.length > 0,
    criticalCount: violations.filter(v => v.severity === 'CRITICAL').length
  };
}

module.exports = { scanSession };
