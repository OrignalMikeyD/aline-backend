const supabase = require('./supabase');
const { broadcastToAtelier } = require('./atelier-broadcast');

// Artifact types we detect
const ARTIFACT_TYPES = {
  MEMORY_CALLBACK: 'memory_callback',      // Aline referenced prior context
  EMOTIONAL_PEAK: 'emotional_peak',        // Sentiment > 0.7
  INTENT_CAPTURE: 'intent_capture',        // User shared preference/date/info
  RETURN_VISIT: 'return_visit',            // User returned after 24h+
  BRAND_MENTION: 'brand_mention',          // User mentioned brand/product
  SENTIMENT_SHIFT: 'sentiment_shift',      // Significant delta during conversation
};

// Store active conversation states
const activeConversations = new Map();

// Initialize a new conversation for Atelier tracking
async function startAtelierConversation(sessionId, userId) {
  if (!supabase) {
    console.log('[Atelier] Supabase not configured, skipping tracking');
    return null;
  }

  const conversation = {
    sessionId,
    userId,
    startedAt: new Date().toISOString(),
    turnCount: 0,
    sentimentStart: null,
    sentimentEnd: null,
    artifacts: [],
    maxFecWeight: 0,
    strongTurnCount: 0,
    dominantEmotions: {},
    maxFecWeight: 0,
    strongTurnCount: 0,
    dominantEmotions: {},
  };

  activeConversations.set(sessionId, conversation);

  // Insert into Supabase
  const { data, error } = await supabase
    .from('atelier_conversations')
    .insert({
      session_id: sessionId,
      user_id: userId,
      started_at: conversation.startedAt,
      turn_count: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[Atelier] Error creating conversation:', error);
    return null;
  }

  conversation.dbId = data.id;
  activeConversations.set(sessionId, conversation);

  console.log(`[Atelier] Conversation started: ${sessionId}`);

  // Check if this is a return visit
  await checkReturnVisit(sessionId, userId);

  // Broadcast to dashboard
  broadcastToAtelier({
    type: 'CONVERSATION_STARTED',
    payload: { sessionId, userId, startedAt: conversation.startedAt }
  });

  return conversation;
}

// Log each conversation turn with sentiment
async function logTurn(sessionId, speaker, text, sentiment, fecWeight = 0, emotionLabel = null) {
  const conversation = activeConversations.get(sessionId);
  if (!conversation || !supabase) return;

  conversation.turnCount++;

  // Track FEC weight
  if (fecWeight > conversation.maxFecWeight) conversation.maxFecWeight = fecWeight;
  if (fecWeight >= 8) conversation.strongTurnCount++;
  if (emotionLabel) {
    conversation.dominantEmotions[emotionLabel] = (conversation.dominantEmotions[emotionLabel] || 0) + 1;
  }

  // Track sentiment for start/end comparison
  if (conversation.turnCount === 1 && speaker === 'USER') {
    conversation.sentimentStart = sentiment;
  }
  conversation.sentimentEnd = sentiment;

  // Log to Supabase
  const { error } = await supabase.from('atelier_sentiment_snapshots').insert({
    conversation_id: conversation.dbId,
    snapshot_time: new Date().toISOString(),
    sentiment_value: sentiment,
    turn_number: conversation.turnCount,
    speaker: speaker,
    fec_weight: fecWeight,
    emotion_label: emotionLabel,
    fec_weight: fecWeight,
    emotion_label: emotionLabel,
  });

  if (error) {
    console.error('[Atelier] Error logging turn:', error);
  }

  // Check for emotional peak
  if (sentiment > 0.7) {
    await detectArtifact(sessionId, ARTIFACT_TYPES.EMOTIONAL_PEAK, {
      sentiment,
      turn: conversation.turnCount,
      text: text.slice(0, 100),
    });
  }

  // Update conversation turn count
  await supabase
    .from('atelier_conversations')
    .update({
      turn_count: conversation.turnCount,
      sentiment_end: sentiment,
      ...(conversation.turnCount === 1 ? { sentiment_start: sentiment } : {})
    })
    .eq('id', conversation.dbId);

  // Broadcast to dashboard
  broadcastToAtelier({
    type: 'TURN_COMPLETE',
    payload: {
      sessionId,
      speaker,
      sentiment,
      turnCount: conversation.turnCount,
      textPreview: text.slice(0, 50)
    }
  });
}

// Detect and store artifacts
async function detectArtifact(sessionId, artifactType, metadata = {}) {
  const conversation = activeConversations.get(sessionId);
  if (!conversation || !supabase) return null;

  const artifact = {
    conversation_id: conversation.dbId,
    artifact_type: artifactType,
    detected_at: new Date().toISOString(),
    metadata,
    verified: true,
  };

  const { data, error } = await supabase
    .from('atelier_artifacts')
    .insert(artifact)
    .select()
    .single();

  if (error) {
    console.error('[Atelier] Error creating artifact:', error);
    return null;
  }

  conversation.artifacts.push(data);

  console.log(`[Atelier] Artifact detected: ${artifactType}`, metadata);

  // Broadcast to dashboard
  broadcastToAtelier({
    type: 'ARTIFACT_DETECTED',
    payload: data
  });

  return data;
}

// Check if user is returning after 24+ hours
async function checkReturnVisit(sessionId, userId) {
  if (!supabase) return;

  const { data: lastSession } = await supabase
    .from('atelier_conversations')
    .select('ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .single();

  if (lastSession?.ended_at) {
    const hoursSince = (Date.now() - new Date(lastSession.ended_at).getTime()) / (1000 * 60 * 60);

    if (hoursSince >= 24) {
      await detectArtifact(sessionId, ARTIFACT_TYPES.RETURN_VISIT, {
        hoursSinceLast: Math.round(hoursSince),
        lastSessionEnd: lastSession.ended_at,
      });
    }
  }
}

// Call this when Aline references memory from a previous conversation
async function logMemoryCallback(sessionId, fact, originalSessionId) {
  await detectArtifact(sessionId, ARTIFACT_TYPES.MEMORY_CALLBACK, {
    fact,
    originalSessionId,
    recalledAt: new Date().toISOString(),
  });
}

// Call this when user shares a preference, date, or personal info
async function logIntentCapture(sessionId, intentType, details) {
  await detectArtifact(sessionId, ARTIFACT_TYPES.INTENT_CAPTURE, {
    intentType, // 'preference', 'date', 'personal_info', 'brand_interest'
    details,
    capturedAt: new Date().toISOString(),
  });
}

// Call this when user mentions a brand or product
async function logBrandMention(sessionId, brand, context) {
  await detectArtifact(sessionId, ARTIFACT_TYPES.BRAND_MENTION, {
    brand,
    context: context.slice(0, 200),
    mentionedAt: new Date().toISOString(),
  });
}

// End conversation and calculate final metrics
async function endAtelierConversation(sessionId) {
  const conversation = activeConversations.get(sessionId);
  if (!conversation) return null;

  if (!supabase) {
    activeConversations.delete(sessionId);
    return null;
  }

  const endedAt = new Date().toISOString();

  // Calculate sentiment shift
  const deltaV = (conversation.sentimentEnd || 0) - (conversation.sentimentStart || 0);

  // Log sentiment shift artifact if significant
  if (Math.abs(deltaV) >= 0.3) {
    await detectArtifact(sessionId, ARTIFACT_TYPES.SENTIMENT_SHIFT, {
      delta: deltaV,
      start: conversation.sentimentStart,
      end: conversation.sentimentEnd,
    });
  }

  // Find dominant emotion
  const dominantEmotion = Object.entries(conversation.dominantEmotions)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Update conversation record with Carta data
  await supabase
    .from('atelier_conversations')
    .update({
      ended_at: endedAt,
      turn_count: conversation.turnCount,
      sentiment_start: conversation.sentimentStart,
      sentiment_end: conversation.sentimentEnd,
      max_fec_weight: conversation.maxFecWeight,
      strong_turn_count: conversation.strongTurnCount,
      total_turn_count: conversation.turnCount,
      dominant_emotion: dominantEmotion,
      delta_v: parseFloat(deltaV.toFixed(2)),
    })
    .eq('id', conversation.dbId);

  // Upsert carta_node_maturity for each emotion fired this session
  for (const [emotion, count] of Object.entries(conversation.dominantEmotions)) {
    const maturityIncrement = count * 0.3 + (conversation.maxFecWeight >= 8 ? 1.0 : 0.3);
    await supabase
      .from('carta_node_maturity')
      .upsert({
        user_id: conversation.userId,
        emotion_label: emotion,
        maturity_score: maturityIncrement,
        session_count: 1,
        last_activated_at: endedAt,
      }, {
        onConflict: 'user_id,emotion_label',
        ignoreDuplicates: false,
      });

    // Increment maturity score for existing rows
    await supabase.rpc('increment_carta_maturity', {
      p_user_id: conversation.userId,
      p_emotion: emotion,
      p_increment: maturityIncrement,
    }).catch(() => null); // RPC may not exist yet, fallback ok
  }

  const results = {
    deltaV,
    turnCount: conversation.turnCount,
    artifacts: conversation.artifacts,
  };

  activeConversations.delete(sessionId);

  console.log(`[Atelier] Conversation ended: ${sessionId}, ΔV: ${deltaV.toFixed(2)}, Artifacts: ${conversation.artifacts.length}`);

  // Broadcast to dashboard
  broadcastToAtelier({
    type: 'CONVERSATION_ENDED',
    payload: { sessionId, ...results }
  });

  return results;
}

// Get active conversation for a session
function getActiveConversation(sessionId) {
  return activeConversations.get(sessionId);
}

module.exports = {
  ARTIFACT_TYPES,
  startAtelierConversation,
  logTurn,
  detectArtifact,
  logMemoryCallback,
  logIntentCapture,
  logBrandMention,
  endAtelierConversation,
  getActiveConversation,
};
