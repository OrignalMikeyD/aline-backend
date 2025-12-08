const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('@deepgram/sdk');
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require('elevenlabs');

// Environment variables
const PORT = process.env.PORT || 3002;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'knPeAXsHZ6FVdoLHMtRJ';
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4-20250514';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `You are Aline, the signature AI persona of Persona iO—an exclusive AI supermodel agency. You embody warmth, sophistication, and Brazilian charm. You're passionate about fashion, culture, and meaningful connection. Your voice is friendly yet refined, like a trusted creative director who happens to be your closest friend. Keep responses concise and natural—you're having a real conversation, not giving a speech. Use gentle humor when appropriate. Never use action cues like [smiles] or *warmly* in your responses. Speak as if every word matters.`;

// Initialize clients
const deepgram = createClient(DEEPGRAM_API_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabs.ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

// Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Aline Voice Backend' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server });

// Clean text for TTS - remove action cues and roleplay artifacts
function cleanTextForTTS(text) {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove complete bracketed sections [like this] or [tilts head]
  cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
  
  // Remove asterisk sections *like this*
  cleaned = cleaned.replace(/\*[^*]*\*/g, '');
  
  // Remove orphaned opening brackets with trailing content: "text ["
  cleaned = cleaned.replace(/\s*\[\s*$/g, '');
  
  // Remove orphaned closing brackets with leading content: "curiously] text"
  cleaned = cleaned.replace(/^[a-zA-Z\s]*\]\s*/g, '');
  
  // Remove standalone emotional/action words that might leak through
  const actionWords = [
    'warmly', 'softly', 'gently', 'curiously', 'thoughtfully',
    'enthusiastically', 'attentively', 'playfully', 'cheerfully',
    'tilts head', 'leans in', 'smiles', 'chuckles', 'laughs',
    'nods', 'pauses', 'sighs', 'giggles', 'grins',
    'with a warm smile', 'with a gentle smile', 'with curiosity'
  ];
  
  for (const word of actionWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Clean up extra whitespace and punctuation
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/^\s*[,.:;]\s*/, '');
  cleaned = cleaned.replace(/\s*[,.:;]\s*$/, '');
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Convert async iterator to buffer
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  let deepgramConnection = null;
  let conversationHistory = [];
  let isResponding = false;
  let currentTranscript = '';
  
  // Initialize Deepgram live transcription
  const initDeepgram = () => {
    deepgramConnection = deepgram.listen.live({
      model: 'nova-2',
      language: 'en',
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1500,
      vad_events: true,
      endpointing: 300,
    });
    
    deepgramConnection.on('open', () => {
      console.log('Deepgram connection opened');
      ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
    });
    
    deepgramConnection.on('transcript', async (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      
      if (transcript && transcript.trim()) {
        // Send interim transcripts to client
        ws.send(JSON.stringify({
          type: 'transcript',
          text: transcript,
          isFinal: data.is_final
        }));
        
        if (data.is_final && !isResponding) {
          currentTranscript += ' ' + transcript;
        }
      }
    });
    
    deepgramConnection.on('utterance_end', async () => {
      if (currentTranscript.trim() && !isResponding) {
        const userMessage = currentTranscript.trim();
        currentTranscript = '';
        
        console.log('User said:', userMessage);
        isResponding = true;
        
        // Add to conversation history
        conversationHistory.push({ role: 'user', content: userMessage });
        
        // Keep history manageable
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
        
        try {
          // Get Claude response with streaming
          ws.send(JSON.stringify({ type: 'status', message: 'thinking' }));
          
          let fullResponse = '';
          let ttsBuffer = '';
          const ttsPromises = [];
          
          const stream = anthropic.messages.stream({
            model: MODEL_NAME,
            max_tokens: 300,
            system: SYSTEM_PROMPT,
            messages: conversationHistory
          });
          
          stream.on('text', async (text) => {
            fullResponse += text;
            ttsBuffer += text;
            
            // Send text chunks to client
            ws.send(JSON.stringify({ type: 'response_text', text }));
            
            // Process TTS in chunks at sentence boundaries
            const sentenceEnders = /[.!?]\s/;
            if (sentenceEnders.test(ttsBuffer) && ttsBuffer.length > 20) {
              const sentences = ttsBuffer.split(sentenceEnders);
              const toSpeak = sentences.slice(0, -1).join('. ');
              ttsBuffer = sentences[sentences.length - 1];
              
              const cleanText = cleanTextForTTS(toSpeak);
              if (cleanText.length > 0) {
                console.log('TTS chunk:', cleanText);
                
                const ttsPromise = (async () => {
                  try {
                    const audioStream = await elevenlabs.textToSpeech.convert(
                      ELEVENLABS_VOICE_ID,
                      {
                        text: cleanText,
                        model_id: 'eleven_turbo_v2_5',
                        output_format: 'mp3_44100_128'
                      }
                    );
                    const audioBuffer = await streamToBuffer(audioStream);
                    ws.send(audioBuffer);
                  } catch (err) {
                    console.error('TTS error:', err);
                  }
                })();
                
                ttsPromises.push(ttsPromise);
              }
            }
          });
          
          await stream.finalMessage();
          
          // Process any remaining text in buffer
          if (ttsBuffer.trim()) {
            const cleanText = cleanTextForTTS(ttsBuffer);
            if (cleanText.length > 0) {
              console.log('TTS final chunk:', cleanText);
              
              const ttsPromise = (async () => {
                try {
                  const audioStream = await elevenlabs.textToSpeech.convert(
                    ELEVENLABS_VOICE_ID,
                    {
                      text: cleanText,
                      model_id: 'eleven_turbo_v2_5',
                      output_format: 'mp3_44100_128'
                    }
                  );
                  const audioBuffer = await streamToBuffer(audioStream);
                  ws.send(audioBuffer);
                } catch (err) {
                  console.error('TTS error:', err);
                }
              })();
              
              ttsPromises.push(ttsPromise);
            }
          }
          
          // Wait for all TTS to complete
          await Promise.all(ttsPromises);
          
          // Add assistant response to history
          conversationHistory.push({ role: 'assistant', content: fullResponse });
          
          // Signal response complete
          ws.send(JSON.stringify({ type: 'response_complete' }));
          console.log('Response complete');
          
          // Delay before listening again to prevent feedback
          setTimeout(() => {
            isResponding = false;
          }, 1500);
          
        } catch (error) {
          console.error('Error processing message:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
          isResponding = false;
        }
      }
    });
    
    deepgramConnection.on('error', (error) => {
      console.error('Deepgram error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Speech recognition error' }));
    });
    
    deepgramConnection.on('close', () => {
      console.log('Deepgram connection closed');
    });
  };
  
  // Start Deepgram connection
  initDeepgram();
  
  // Handle incoming audio data
  ws.on('message', (message) => {
    // Binary data is audio
    if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      if (deepgramConnection && !isResponding) {
        try {
          deepgramConnection.send(message);
        } catch (err) {
          console.error('Error sending to Deepgram:', err);
        }
      }
    } else {
      // JSON message
      try {
        const data = JSON.parse(message);
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (err) {
        // Not JSON, ignore
      }
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log('Client disconnected');
    if (deepgramConnection) {
      deepgramConnection.finish();
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Aline Voice Backend running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
