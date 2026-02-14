/**
 * ALINE CONDUCTANCE ACCUMULATOR — Cross-Session Pathway Reinforcement
 * 
 * Implements Q12: Mycorrhizal Networks as Usage-Shaped Transport Systems.
 * Pathways between relational themes thicken with repeated use and decay without.
 * 
 * RESEARCH GROUNDING:
 * - Q12: dD/dt = f(|Q|) - αD  (Hu-Cai conductance dynamics)
 *         Pathway conductance grows with flow volume, decays with time
 * - Q5:  This IS the "structural adaptation" mechanism — the system becomes
 *         shaped by the relationship, not just storing data about it
 * - Q8:  Conductance landscape is the topological structure that preserves
 *         relational identity across sessions
 * 
 * TWO TIMESCALES:
 *   E-LTP (fast): Per-turn Bayesian updates within a session (handled by classifier)
 *   L-LTP (slow): Cross-session conductance remodeling (handled HERE)
 * 
 * SUPABASE TABLES REQUIRED:
 *   conductance_pathways: userId, dimension, theme, conductance, lastReinforced, created
 *   conductance_sessions: userId, sessionId, pathwaysReinforced, maxWeight, timestamp
 * 
 * NEVER NARRATES ENFORCEMENT:
 *   Conductance data feeds prompt-engine as behavioral calibration,
 *   NOT as retrievable facts. The system becomes shaped, not informed.
 */

// Conductance dynamics parameters (from Q12)
const CONDUCTANCE_CONFIG = {
  // Growth function: how much conductance increases per reinforcement
  // Sigmoid-like: fast growth initially, plateaus at high values
  reinforcementRate: 0.15,    // Base increment per interaction touching this pathway
  maxConductance: 1.0,        // Ceiling (normalized)

  // Decay function: conductance decreases without use
  // α in dD/dt = f(|Q|) - αD
  decayRate: 0.02,            // Per-day decay rate
  minConductance: 0.0,        // Floor (pathway fully decayed)

  // Thresholds for behavioral impact
  lowThreshold: 0.2,          // Below this: pathway is nascent, minimal influence
  mediumThreshold: 0.5,       // Above this: pathway shapes tone
  highThreshold: 0.8,         // Above this: pathway is deeply established

  // Maximum pathways stored per user (prevents unbounded growth)
  maxPathwaysPerUser: 50,

  // Pathways below this conductance AND older than staleAge get pruned
  pruneThreshold: 0.05,
  staleAgeDays: 90
};

// ═══════════════════════════════════════════════════════
// PATHWAY REINFORCEMENT — Called when classifier detects
// meaningful content (W5+)
// ═══════════════════════════════════════════════════════

async function reinforcePathway(supabase, userId, classificationResult) {
  if (!supabase || !userId) return null;
  if (classificationResult.weight < 5) return null; // Only W5+ creates/reinforces pathways

  const { dimension, weight, dimensions, confessionDepth } = classificationResult;

  // Extract theme from classification markers
  const theme = extractTheme(classificationResult);
  if (!theme) return null;

  try {
    // Check if pathway exists
    const { data: existing } = await supabase
      .from('conductance_pathways')
      .select('*')
      .eq('user_id', userId)
      .eq('dimension', dimension)
      .eq('theme', theme)
      .single();

    if (existing) {
      // REINFORCE existing pathway
      // Sigmoid-like growth: increment decreases as conductance approaches max
      const currentConductance = existing.conductance || 0;
      const headroom = CONDUCTANCE_CONFIG.maxConductance - currentConductance;
      const increment = CONDUCTANCE_CONFIG.reinforcementRate * (headroom / CONDUCTANCE_CONFIG.maxConductance);

      // Weight multiplier: higher weight = stronger reinforcement
      const weightMultiplier = weight >= 21 ? 2.0 : weight >= 13 ? 1.5 : weight >= 8 ? 1.2 : 1.0;
      const depthBonus = confessionDepth?.isCovenant ? 0.1 : confessionDepth?.isDeep ? 0.05 : 0;

      const newConductance = Math.min(
        CONDUCTANCE_CONFIG.maxConductance,
        currentConductance + (increment * weightMultiplier) + depthBonus
      );

      const { data, error } = await supabase
        .from('conductance_pathways')
        .update({
          conductance: newConductance,
          last_reinforced: new Date().toISOString(),
          reinforcement_count: (existing.reinforcement_count || 0) + 1,
          max_weight_seen: Math.max(existing.max_weight_seen || 0, weight)
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('[Conductance] Reinforce error:', error);
        return null;
      }

      console.log(`[Conductance] Reinforced: ${dimension}/${theme} → ${newConductance.toFixed(3)} (was ${currentConductance.toFixed(3)})`);
      return data;

    } else {
      // CREATE new pathway
      const initialConductance = weight >= 21 ? 0.3 : weight >= 13 ? 0.2 : 0.1;

      const { data, error } = await supabase
        .from('conductance_pathways')
        .insert({
          user_id: userId,
          dimension,
          theme,
          conductance: initialConductance,
          last_reinforced: new Date().toISOString(),
          reinforcement_count: 1,
          max_weight_seen: weight,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('[Conductance] Create error:', error);
        return null;
      }

      console.log(`[Conductance] New pathway: ${dimension}/${theme} at ${initialConductance.toFixed(3)}`);
      return data;
    }
  } catch (err) {
    console.error('[Conductance] Error:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// THEME EXTRACTION — Converts classification markers to
// a storable theme string
// ═══════════════════════════════════════════════════════

function extractTheme(classificationResult) {
  const { dimensions } = classificationResult;
  if (!dimensions || dimensions.length === 0) return null;

  const primary = dimensions[0];
  if (!primary.markers || primary.markers.length === 0) {
    return primary.categories?.[0] || primary.type || null;
  }

  // Use the first marker's category as the theme
  return primary.markers[0].category || primary.markers[0].description || primary.type;
}

// ═══════════════════════════════════════════════════════
// CONDUCTANCE LANDSCAPE LOADER — Retrieves user's
// accumulated pathways for prompt injection
// ═══════════════════════════════════════════════════════

async function loadConductanceLandscape(supabase, userId) {
  if (!supabase || !userId) return { pathways: [], sessionCount: 0 };

  try {
    // Apply time-based decay before reading
    await applyDecay(supabase, userId);

    // Load active pathways above minimum threshold
    const { data: pathways, error } = await supabase
      .from('conductance_pathways')
      .select('*')
      .eq('user_id', userId)
      .gt('conductance', CONDUCTANCE_CONFIG.minConductance + 0.01)
      .order('conductance', { ascending: false })
      .limit(CONDUCTANCE_CONFIG.maxPathwaysPerUser);

    if (error) {
      console.error('[Conductance] Load error:', error);
      return { pathways: [], sessionCount: 0 };
    }

    // Count total sessions for this user
    const { count } = await supabase
      .from('conductance_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return {
      pathways: (pathways || []).map(p => ({
        dimension: p.dimension,
        theme: p.theme,
        conductance: p.conductance,
        reinforcementCount: p.reinforcement_count,
        maxWeightSeen: p.max_weight_seen,
        daysSinceReinforced: daysSince(p.last_reinforced)
      })),
      sessionCount: count || 0
    };
  } catch (err) {
    console.error('[Conductance] Load error:', err);
    return { pathways: [], sessionCount: 0 };
  }
}

// ═══════════════════════════════════════════════════════
// DECAY — Applies time-based decay to all user pathways
// dD/dt = -αD when there's no flow
// ═══════════════════════════════════════════════════════

async function applyDecay(supabase, userId) {
  if (!supabase || !userId) return;

  try {
    const { data: pathways } = await supabase
      .from('conductance_pathways')
      .select('id, conductance, last_reinforced')
      .eq('user_id', userId);

    if (!pathways || pathways.length === 0) return;

    const now = Date.now();
    const updates = [];

    for (const pathway of pathways) {
      const daysSinceReinforcement = daysSince(pathway.last_reinforced);
      if (daysSinceReinforcement < 1) continue; // No decay within same day

      // Exponential decay: D(t) = D(0) * e^(-α*t)
      const decayFactor = Math.exp(-CONDUCTANCE_CONFIG.decayRate * daysSinceReinforcement);
      const newConductance = pathway.conductance * decayFactor;

      if (Math.abs(newConductance - pathway.conductance) > 0.001) {
        updates.push({
          id: pathway.id,
          conductance: Math.max(CONDUCTANCE_CONFIG.minConductance, newConductance)
        });
      }
    }

    // Batch update decayed pathways
    for (const update of updates) {
      await supabase
        .from('conductance_pathways')
        .update({ conductance: update.conductance })
        .eq('id', update.id);
    }

    if (updates.length > 0) {
      console.log(`[Conductance] Decayed ${updates.length} pathways for user ${userId}`);
    }

    // Prune dead pathways
    await prunePathways(supabase, userId);

  } catch (err) {
    console.error('[Conductance] Decay error:', err);
  }
}

// ═══════════════════════════════════════════════════════
// PRUNING — Remove pathways that have fully decayed
// ═══════════════════════════════════════════════════════

async function prunePathways(supabase, userId) {
  if (!supabase || !userId) return;

  const staleDate = new Date(Date.now() - CONDUCTANCE_CONFIG.staleAgeDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { error } = await supabase
      .from('conductance_pathways')
      .delete()
      .eq('user_id', userId)
      .lt('conductance', CONDUCTANCE_CONFIG.pruneThreshold)
      .lt('last_reinforced', staleDate);

    if (error) {
      console.error('[Conductance] Prune error:', error);
    }
  } catch (err) {
    console.error('[Conductance] Prune error:', err);
  }
}

// ═══════════════════════════════════════════════════════
// SESSION LOGGING — Records session-level conductance stats
// ═══════════════════════════════════════════════════════

async function logConductanceSession(supabase, userId, sessionId, stats) {
  if (!supabase || !userId) return;

  try {
    await supabase
      .from('conductance_sessions')
      .insert({
        user_id: userId,
        session_id: sessionId,
        pathways_reinforced: stats.pathwaysReinforced || 0,
        max_weight: stats.maxWeight || 1,
        timestamp: new Date().toISOString()
      });
  } catch (err) {
    console.error('[Conductance] Session log error:', err);
  }
}

// Helper
function daysSince(isoString) {
  if (!isoString) return 999;
  return (Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60 * 24);
}

module.exports = {
  reinforcePathway,
  loadConductanceLandscape,
  logConductanceSession,
  applyDecay,
  CONDUCTANCE_CONFIG
};
