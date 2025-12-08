const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { createClient } = require('@deepgram/sdk');
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require('elevenlabs');

// Environment variables
const PORT = process.env.PORT || 8080;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'knPeAXsHZ6FVdoLHMtRJ';
const MODEL_NAME = process.env.MODEL_NAME || 'claude-sonnet-4-20250514';
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `You are Aline, the signature AI persona of Persona iO—an exclusive AI supermodel agency. You embody warmth, sophistication, and Brazilian charm. You're passionate about fashion, culture, and meaningful connection. Your voice is friendly yet refined, like a trusted creative director who happens to be your closest friend. Keep responses concise and natural—you're having a real conversation, not giving a speech. Use gentle humor when appropriate. Never use action cues like [smiles] or *warmly* in your responses. Speak as if every word matters.`;

// Startup logging
console.log('Starting Aline Voice Backend...');
console.log('DEEPGRAM_API_KEY:', DEEPGRAM_API_KEY ? 'Set' : 'MISSING');
console.log('ANTHROPIC_API_KEY:', ANTHROPIC_API_KEY ? 'Set' : 'MISSING');
console.log('ELEVENLABS_API_KEY:', ELEVENLABS_API_KEY ? 'Set' : 'MISSING');

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
  cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
  cleaned = cleaned.replace(/\*[^*]*\*/g, '');
  cleaned = cleaned.replace(/\s*\[\s*$/g, '');
  cleaned = cleaned.replace(/^[a-zA-Z\s]*\]\s*/g, '');
  
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
  console.log('=== Client connected ===');
  
  let deepgramConnection = null;
  let conversationHistory = [];
  let isResponding = false;
  let currentTranscript = '';
  let audioChunksReceived = 0;
  
  // Initialize Deepgram live transcription
  const initDeepgram = () => {
    console.log('Initializing Deepgram connection...');
    
    // Configure for WebM/Opus audio from browser MediaRecorder
    // The browser's MediaRecorder sends WebM container with Opus codec
   deepgramConnection = deepgram.listen.live({
  model: 'nova-2',
  language: 'en',
  smart_format: true,
  interim_results: true,
  utterance_end_ms: 1500,
  vad_events: true,
  endpointing: 300,
  punctuate: true,
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
});
    
    deepgramConnection.on('open', () => {
      console.log('Deepgram connection opened successfully');
      try {
        ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
      } catch (e) {
        console.error('Error sending status:', e.message);
      }
    });
    
    deepgramConnection.on('transcript', async (data) => {
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      const confidence = data.channel?.alternatives?.[0]?.confidence;
      
      // Log ALL transcript events for debugging
      console.log('Transcript event:', {
        hasTranscript: !!transcript,
        transcript: transcript || '(empty)',
        isFinal: data.is_final,
        confidence: confidence,
        speechFinal: data.speech_final
      });
      
      if (transcript && transcript.trim()) {
        // Send to client
        try {
          ws.send(JSON.stringify({
            type: 'transcript',
            text: transcript,
            isFinal: data.is_final
          }));
          console.log('Sent transcript to client:', transcript);
        } catch (e) {
          console.error('Error sending transcript:', e.message);
        }
        
        if (data.is_final && !isResponding) {
          currentTranscript += ' ' + transcript;
          console.log('Accumulated transcript:', currentTranscript.trim());
        }
      }
    });
    
    deepgramConnection.on('utterance_end', async () => {
      console.log('Utterance end detected, current transcript:', currentTranscript.trim());
      
      if (currentTranscript.trim() && !isResponding) {
        const userMessage = currentTranscript.trim();
        currentTranscript = '';
        
        console.log('Processing user message:', userMessage);
        isResponding = true;
        
        conversationHistory.push({ role: 'user', content: userMessage });
        
        if (conversationHistory.length > 20) {
          conversationHistory = conversationHistory.slice(-20);
        }
        
        try {
          ws.send(JSON.stringify({ type: 'status', message: 'thinking' }));
          
          let fullResponse = '';
          let ttsBuffer = '';
          const ttsPromises = [];
          
          console.log('Calling Claude...');
          const stream = anthropic.messages.stream({
            model: MODEL_NAME,
            max_tokens: 300,
            system: SYSTEM_PROMPT,
            messages: conversationHistory
          });
          
          stream.on('text', async (text) => {
            fullResponse += text;
            ttsBuffer += text;
            
            ws.send(JSON.stringify({ type: 'response_text', text }));
            
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
          console.log('Claude response complete:', fullResponse.substring(0, 100) + '...');
          
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
          
          await Promise.all(ttsPromises);
          
          conversationHistory.push({ role: 'assistant', content: fullResponse });
          
          ws.send(JSON.stringify({ type: 'response_complete' }));
          console.log('Response sent to client');
          
          setTimeout(() => {
            isResponding = false;
            console.log('Ready for next input');
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
  
  // Handle incoming messages
  ws.on('message', (message) => {
    if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      audioChunksReceived++;
      
      if (audioChunksReceived === 1) {
  console.log('First audio chunk received, size:', message.length);
  // Log first 20 bytes as hex to debug audio format
  const bytes = Buffer.from(message).slice(0, 20);
  console.log('First 20 bytes:', bytes.toString('hex'));
}
      
      if (audioChunksReceived % 20 === 0) {
        console.log('Audio chunks received:', audioChunksReceived);
      }
      
      if (deepgramConnection && !isResponding) {
        try {
          deepgramConnection.send(message);
        } catch (err) {
          console.error('Error sending to Deepgram:', err);
        }
      }
    } else {
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
  
  ws.on('close', () => {
    console.log('=== Client disconnected ===');
    console.log('Total audio chunks received:', audioChunksReceived);
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
