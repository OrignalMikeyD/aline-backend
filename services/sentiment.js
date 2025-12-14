// Quick sentiment analysis using keyword matching (fallback)
function extractSentimentFromText(text) {
  if (!text) return 0;

  const lowerText = text.toLowerCase();

  const positiveWords = [
    'happy', 'great', 'wonderful', 'excited', 'love', 'amazing', 'beautiful',
    'yes', 'thank', 'fantastic', 'excellent', 'perfect', 'awesome', 'brilliant',
    'delighted', 'pleased', 'grateful', 'joy', 'thrilled', 'appreciate'
  ];

  const negativeWords = [
    'sad', 'angry', 'frustrated', 'worried', 'anxious', 'stressed', 'no',
    'hate', 'terrible', 'awful', 'horrible', 'disappointed', 'upset', 'annoyed',
    'confused', 'difficult', 'problem', 'issue', 'wrong', 'bad'
  ];

  let score = 0;
  positiveWords.forEach(word => {
    if (lowerText.includes(word)) score += 0.15;
  });
  negativeWords.forEach(word => {
    if (lowerText.includes(word)) score -= 0.15;
  });

  return Math.max(-1, Math.min(1, score));
}

// More accurate: Call Claude specifically for sentiment analysis
async function analyzeSentiment(text, anthropic) {
  if (!text || !anthropic) {
    return extractSentimentFromText(text);
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Rate the emotional sentiment of this text from -1 (very negative) to 1 (very positive). Reply with ONLY a number, nothing else.\n\nText: "${text.slice(0, 500)}"`
      }]
    });

    const scoreText = response.content[0].text.trim();
    const score = parseFloat(scoreText);

    if (isNaN(score)) {
      console.log('[Sentiment] Could not parse score, using fallback:', scoreText);
      return extractSentimentFromText(text);
    }

    return Math.max(-1, Math.min(1, score));
  } catch (error) {
    console.error('[Sentiment] Error analyzing sentiment:', error.message);
    return extractSentimentFromText(text);
  }
}

// Fast sentiment using keyword matching only (no API call)
function quickSentiment(text) {
  return extractSentimentFromText(text);
}

module.exports = {
  analyzeSentiment,
  quickSentiment,
  extractSentimentFromText,
};
