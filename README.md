# aline-backend

WebSocket server for Persona iO. Handles conversational turns for two confidantes, Aline and Chase, over a single persistent connection.

The repository is public so the behavioral architecture can be read directly rather than described. The system prompts, the invariants they enforce, and the production decisions behind them are all in `server.js`.

## Status

Persona iO is text in, voice out. The user types. Aline and Chase answer in speech, synthesized by ElevenLabs and rendered through a Simli avatar. The client receives both the streaming text and the streaming audio for every turn.

The speech-to-text branch is the part the product does not use. Deepgram transcription is implemented and reachable by sending binary audio frames to the socket, but the live frontend sends text only.

## What is in this repository

Railway runs one command, `node server.js`, defined in `railway.toml`. Everything documented below that concerns the running service concerns that file and its two SDK dependencies. The repository also carries code that is written but not wired, and the distinction matters more than the file count.

**Deployed.** `server.js`. HTTP routes, the WebSocket handler, both system prompts, the Anthropic stream, the ElevenLabs call, and the Simli session endpoint.

**Written, not wired.** `services/` holds the Calibration Layer, seventeen files that read the weight of a turn and hold the response to it: a message classifier, an invariant gate, a crisis override, a drift scanner, a session-boundary check, a sentiment pass, and a prompt engine. Nothing in `server.js` imports any of it. The only importer in the repository is `test-mra.js`, a standalone harness. Treat the layer as staged, not enforcing.

**Scaffold.** `app/`, `lib/`, `types/`, and `middleware.ts` are a Next.js structure with login, a dashboard, and a Supabase client. `package.json` defines no Next build or dev script, so none of it runs from this repository.

`ARCHITECTURE.md` specifies the integrated version, where the classifier and the invariant gate sit inside the response path. That document is a target, not a description of the running service. Read it as the plan.

## Stack

| Layer | Service |
|---|---|
| Model | Anthropic Claude, `claude-sonnet-4-6` |
| Transport | Node.js, `ws`, single WebSocket per session |
| Speech to text | Deepgram Nova-2, live streaming with voice activity detection. Implemented, not used by the product |
| Text to speech | ElevenLabs, PCM 16 kHz mono |
| Avatar | Simli, audio-to-video session |
| Host | Railway |

## Request flow

```
live path

  client ──► WebSocket, text turn ──► Anthropic stream
                                            │
                        text deltas ────────┼──► client
                                            │
                                            └──► markdown strip
                                                       │
                                                 ElevenLabs TTS
                                                       │
                                       PCM 16 kHz bytes ──► client ──► Simli avatar

implemented, unused

  client ──► binary audio ──► Deepgram STT and VAD ──► same Anthropic stream
```

Both entry points converge on the same `generateResponse` call, sharing one conversation history array and one system prompt, selected by the `persona` query parameter.

## Design decisions

Four choices in this service came out of production failures rather than planning. They are documented because the reasoning is the useful part.

**Search is disabled on the public demo.** Anthropic's `web_search_20250305` tool is attached only when the socket connects without `?demo=1`. Under tool results the model drifts out of persona: it dumps citations, runs long, and truncates mid-sentence at the token ceiling. The demo is the reviewer-facing surface, so it runs formation-only. The authenticated session paths keep search.

**TTS receives stripped text.** The model emits markdown. ElevenLabs reads asterisks, underscores, and backticks aloud. A regex pass removes markdown syntax between the model stream and the synthesis call.

**Audio chunks are sent as exact byte views.** Sending `value.buffer` from the ElevenLabs reader forwards the entire underlying `ArrayBuffer`, which can be larger than the chunk and drags trailing bytes that Simli plays as static. Sending `value` fixes it. This was the scratchy-audio bug.

**Sentence-boundary flushing.** The Anthropic stream is buffered and handed to TTS at `[.!?]` boundaries past 20 characters, which trades a small amount of prosodic smoothness for lower time-to-first-audio.

## Environment

```
ANTHROPIC_API_KEY
MODEL_NAME=claude-sonnet-4-6
DEEPGRAM_API_KEY
ELEVENLABS_API_KEY
SIMLI_API_KEY
PORT
```

Railway sets `PORT`. Everything else is set manually.

Voice IDs and avatar IDs are not environment variables. They are hardcoded per persona in the `VOICE_IDS` and `AVATAR_IDS` maps at the top of `server.js`.

`MODEL_NAME` has a hardcoded fallback in `server.js`. A stale value there fails only at request time, not at deploy time, which is how a dead model string once ran silently for weeks. Set the variable explicitly.

## Endpoints

**HTTP**

- `/` service metadata and persona list
- `/health` health check
- `/simli-session?persona=aline` opens a Simli audio-to-video session and returns the session payload

No method check is enforced on these routes. `/simli-session` responds to any verb.

**WebSocket**

Connect with `?persona=aline` or `?persona=chase`. Append `?demo=1` to disable search.

Client sends:

- `{ "type": "message", "content": "..." }` text turn
- binary PCM or WebM audio for the speech path
- `{ "type": "ping" }` keep-alive

Server sends:

- `{ "type": "status", "message": "listening" | "thinking" }`
- `{ "type": "transcript", "text": "...", "isFinal": bool }`
- `{ "type": "response_text", "text": "..." }`
- `{ "type": "response_complete" }`
- `{ "type": "pong" }`
- `{ "type": "error", "message": "..." }`
- binary PCM 16 kHz audio

Responses are capped at `max_tokens: 400`.

## Local development

```bash
npm install
cp .env.example .env   # fill in keys
npm start
```

Listens on `ws://localhost:3002`.

## What the deployed service does not do

Stated plainly so the code and the claims stay matched. These describe `server.js`, the process Railway actually runs, not the repository as a whole.

**No encryption.** This server holds conversation history in memory for the life of the socket and transmits over TLS via `wss`. That is transport security, not zero-knowledge. The encrypted-memory architecture is a separate concern and lives outside this file.

**No persistence.** Conversation history is per-connection and discarded on close. There is no session-to-session memory in the running service.

**No safety enforcement in code.** Nothing in `server.js` inspects model output before it reaches the client. The confidante invariants are carried by the system prompts alone, which is a weaker guarantee than a gate in code. The gate exists in `services/invariant-gate.js` and is not called by the running service. Read the resume version of this repository accordingly.

**No authentication.** The socket accepts any connection. Access control sits in front of this service, not in it.
