const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk');
const ElevenLabs = require('elevenlabs');

// Environment variables
const PORT = process.env.PORT || 8080;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'knPeAXsHZ6FVdoLHMtRJ';
const MODEL_NAME = process.env.MODEL_NAME || 'claude-3-haiku-20240307'; 

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `You are Aline, the signature AI persona of Persona iO—an exclusive AI supermodel agency. You embody warmth, sophistication, and Brazilian charm. You're passionate about fashion, culture, and meaningful connection. Your voice is friendly yet refined, like a trusted creative director who happens to be your closest friend. Keep responses concise and natural—you're having a real conversation, not giving a speech. Use gentle humor when appropriate. Never use action cues like [smiles] or *warmly* in your responses. Speak as if every word matters.`;

// Startup logging
console.log('Starting Aline Voice Backend...');
console.log('DEEPGRAM_API_KEY:', DEEPGRAM_API_KEY ? 'Set' : 'MISSING');
console.log('ANTHROPIC_API_KEY:', ANTHROPIC_API_KEY ? 'Set' : 'MISSING');
console.log('ELEVENLABS_API_KEY:', ELEVENLABS_API_KEY ? 'Set' : 'MISSING');

// Initialize clients
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabs.ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

// Express app
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Aline Voice Backend' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function cleanTextForTTS(text) {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ''); // Remove brackets
  cleaned = cleaned.replace(/\*[^*]*\*/g, '');   // Remove asterisks
  cleaned = cleaned.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  return cleaned;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

wss.on('connection', (ws) => {
  console.log('=== Client connected ===');
  
  let deepgramWs = null;
  let conversationHistory = [];
  let isResponding = false;
  let currentTranscript = '';
  let audioChunksReceived = 0;
  let utteranceTimeout = null;
  
  const initDeepgram = () => {
    console.log('Initializing Deepgram connection (direct WebSocket)...');
    
    // Connect directly to Deepgram WebSocket API
    // Nova-2 is the fastest model for real-time
    const dgUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&endpointing=500&punctuate=true`;
    
    deepgramWs = new WebSocket(dgUrl, {
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`
      }
    });
    
    deepgramWs.on('open', () => {
      console.log('Deepgram WebSocket opened successfully');
      ws.send(JSON.stringify({ type: 'status', message: 'listening' }));
    });
    
    deepgramWs.on('message', async (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        if (response.type === 'Results') {
          const transcript = response.channel?.alternatives?.[0]?.transcript;
          const isFinal = response.is_final;
          const speechFinal = response.speech_final;
          
          console.log('Transcript:', { transcript: transcript || '(empty)', isFinal, speechFinal });
          
          if (transcript && transcript.trim()) {
            ws.send(JSON.stringify({ type: 'transcript', text: transcript, isFinal }));
            
            if (isFinal && !isResponding) {
              currentTranscript += ' ' + transcript;
              console.log('Accumulated:', currentTranscript.trim());
              
              // Reset utterance timeout
              if (utteranceTimeout) clearTimeout(utteranceTimeout);
              utteranceTimeout = setTimeout(() => processUtterance(), 1500);
            }
          }
        } else if (response.type === 'UtteranceEnd') {
          console.log('Utterance end received');
          if (utteranceTimeout) clearTimeout(utteranceTimeout);
          processUtterance();
        } else if (response.type === 'SpeechStarted') {
          console.log('Speech started');
          if (utteranceTimeout) clearTimeout(utteranceTimeout);
        } else if (response.type === 'Metadata') {
          console.log('Metadata:', response);
        }
      } catch (err) {
        console.error('Error parsing Deepgram response:', err);
      }
    });
    
    deepgramWs.on('error', (error) => {
      console.error('Deepgram WebSocket error:', error);
    });
    
    deepgramWs.on('close', (code, reason) => {
      console.log('Deepgram WebSocket closed:', code, reason.toString());
    });
  };
  
  const processUtterance = async () => {
    if (!currentTranscript.trim() || isResponding) return;
    
    const userMessage = currentTranscript.trim();
    currentTranscript = '';
    isResponding = true;
    
    console.log('Processing:', userMessage);
    conversationHistory.push({ role: 'user', content: userMessage });
    
    // Keep context window manageable
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    
    try {
      ws.send(JSON.stringify({ type: 'status', message: 'thinking' }));
      
      let fullResponse = '';
      console.log('Calling Claude...');
      
      const stream = anthropic.messages.stream({
        model: MODEL_NAME,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: conversationHistory
      });
      
      stream.on('text', (text) => {
        fullResponse += text;
        ws.send(JSON.stringify({ type: 'response_text', text }));
      });
      
      await stream.finalMessage();
      console.log('Claude response:', fullResponse.substring(0, 100) + '...');
      
      // Generate TTS for full response
      const cleanText = cleanTextForTTS(fullResponse);
      if (cleanText.length > 0) {
        console.log('Generating TTS...');
        
        // CRITICAL UPDATE FOR SIMLI: Use pcm_16000 format
        // This is the raw audio Simli needs to drive the face
        const audioStream = await elevenlabs.textToSpeech.convert(
          ELEVENLABS_VOICE_ID,
          { 
            text: cleanText, 
            model_id: 'eleven_turbo_v2_5', 
            output_format: 'pcm_16000' 
          }
        );
        
        const audioBuffer = await streamToBuffer(audioStream);
        ws.send(audioBuffer);
        console.log('TTS sent, size:', audioBuffer.length);
      }
      
      conversationHistory.push({ role: 'assistant', content: fullResponse });
      ws.send(JSON.stringify({ type: 'response_complete' }));
      
    } catch (error) {
      console.error('Error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    } finally {
      setTimeout(() => {
        isResponding = false;
        console.log('Ready for next input');
      }, 1500);
    }
  };
  
  initDeepgram();
  
  ws.on('message', (message) => {
    if (Buffer.isBuffer(message) || message instanceof ArrayBuffer) {
      audioChunksReceived++;
      
      if (audioChunksReceived === 1) {
        console.log('First audio chunk, size:', message.length);
        console.log('First 20 bytes:', Buffer.from(message).slice(0, 20).toString('hex'));
      }
      
      if (audioChunksReceived % 20 === 0) {
        console.log('Audio chunks:', audioChunksReceived);
      }
      
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN && !isResponding) {
        deepgramWs.send(message);
      }
    }
  });
  
  ws.on('close', () => {
    console.log('=== Client disconnected ===');
    console.log('Total chunks:', audioChunksReceived);
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.close();
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

server.listen(PORT, () => {
  console.log(`Aline Voice Backend running on port ${PORT}`);
  console.log('WebSocket server ready');
});
