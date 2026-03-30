/**
 * Profile Manager Module
 * 
 * Loads and updates user structural profiles in Supabase.
 * Stores patterns not content — the MRA memory architecture.
 * 
 * Target: < 10ms read, < 20ms write. No AI calls. Pure Supabase queries.
 * 
 * MRA Architecture: Stage 4 — profile-manager.js
 * Classification: INTERNAL ENGINEERING — PERSONA IO
 */

const DEFAULT_PROFILE = {
  session_count: 0,
  total_turns: 0,
  weight_distribution: { W1: 0, W2: 0, W3: 0, W5: 0, W8: 0, W13: 0, W21: 0 },
  mode_distribution: { companion: 0, mentor: 0, witness: 0, anchor: 0 },
  fec_category_frequency: { joy: 0, sadness: 0, anger: 0, fear: 0, anxiety: 0, neutral: 0, crisis: 0 },
  crisis_count: 0,
  last_session_end_weight: null,
  last_session_end_mode: null,
  last_session_crisis: false,
  avg_deltav: 0,
};

async function loadProfile(supabase, userId) {
  const startTime = Date.now();
  if (!supabase || !userId) {
    console.log('[Profile] Missing supabase client or userId, returning default');
    return { ...DEFAULT_PROFILE, user_id: userId };
  }
  console.log('[Profile] Loading profile for user:', userId);
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('[Profile] No existing profile found, returning default');
        return { ...DEFAULT_PROFILE, user_id: userId };
      }
      console.error('[Profile] Error loading profile:', error.message);
      return { ...DEFAULT_PROFILE, user_id: userId };
    }
    const elapsed = Date.now() - startTime;
    console.log('[Profile] Loaded existing profile in', elapsed, 'ms');
    return data;
  } catch (err) {
    console.error('[Profile] Unexpected error:', err.message);
    return { ...DEFAULT_PROFILE, user_id: userId };
  }
}

async function updateProfile(supabase, userId, sessionSummary) {
  const startTime = Date.now();
  if (!supabase || !userId) {
    console.log('[Profile] Missing supabase client or userId, skipping update');
    return null;
  }
  console.log('[Profile] Updating profile for user:', userId);
  const {
    finalWeight = 2,
    finalMode = 'companion',
    crisisActivated = false,
    deltaV = 0,
    dominantCategories = {},
    turnCount = 0,
    weightCounts = {},
    modeCounts = {},
  } = sessionSummary || {};
  try {
    const existingProfile = await loadProfile(supabase, userId);
    const newSessionCount = (existingProfile.session_count || 0) + 1;
    const newTotalTurns = (existingProfile.total_turns || 0) + turnCount;
    const prevAvgDeltaV = existingProfile.avg_deltav || 0;
    const prevSessionCount = existingProfile.session_count || 0;
    const newAvgDeltaV = prevSessionCount > 0
      ? ((prevAvgDeltaV * prevSessionCount) + deltaV) / newSessionCount
      : deltaV;
    const existingWeightDist = existingProfile.weight_distribution || { ...DEFAULT_PROFILE.weight_distribution };
    const newWeightDist = { ...existingWeightDist };
    for (const [weight, count] of Object.entries(weightCounts)) {
      const key = `W${weight}`;
      newWeightDist[key] = (newWeightDist[key] || 0) + count;
    }
    const existingModeDist = existingProfile.mode_distribution || { ...DEFAULT_PROFILE.mode_distribution };
    const newModeDist = { ...existingModeDist };
    for (const [mode, count] of Object.entries(modeCounts)) {
      newModeDist[mode] = (newModeDist[mode] || 0) + count;
    }
    const existingCategoryFreq = existingProfile.fec_category_frequency || { ...DEFAULT_PROFILE.fec_category_frequency };
    const newCategoryFreq = { ...existingCategoryFreq };
    for (const [category, count] of Object.entries(dominantCategories)) {
      newCategoryFreq[category] = (newCategoryFreq[category] || 0) + count;
    }
    const newCrisisCount = (existingProfile.crisis_count || 0) + (crisisActivated ? 1 : 0);
    const profileData = {
      user_id: userId,
      session_count: newSessionCount,
      total_turns: newTotalTurns,
      weight_distribution: newWeightDist,
      mode_distribution: newModeDist,
      fec_category_frequency: newCategoryFreq,
      crisis_count: newCrisisCount,
      last_session_end_weight: finalWeight,
      last_session_end_mode: finalMode,
      last_session_crisis: crisisActivated,
      avg_deltav: parseFloat(newAvgDeltaV.toFixed(4)),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(profileData, { onConflict: 'user_id', ignoreDuplicates: false })
      .select()
      .single();
    if (error) {
      console.error('[Profile] Error updating profile:', error.message);
      return null;
    }
    const elapsed = Date.now() - startTime;
    console.log('[Profile] Updated profile in', elapsed, 'ms | Session:', newSessionCount, '| Crisis:', newCrisisCount);
    return data;
  } catch (err) {
    console.error('[Profile] Unexpected error during update:', err.message);
    return null;
  }
}

module.exports = { loadProfile, updateProfile, DEFAULT_PROFILE };
