# Aline Voice Backend — MRA Integrated Architecture

## What Changed

The previous architecture was a **serial relay**: Deepgram → static prompt → Claude → ElevenLabs → client. Zero behavioral intelligence. Zero cross-session memory. Zero invariant enforcement.

The new architecture is a **morphic resonance pipeline** where every component reads from and writes to every other component. Eight research questions, six production modules, one integrated system.

---

## Component Connection Map

```
USER AUDIO
    │
    ▼
┌─────────────┐
│  Deepgram   │ Speech-to-Text (streaming)
│  STT        │ Nova-2, PCM16 @ 16kHz
└──────┬──────┘
       │ transcript
       ▼
┌─────────────┐     ┌──────────────────┐
│  Fibonacci  │────▶│  Backchannel     │ Q13: Clock A ≤300ms
│  Classifier │     │  Engine          │ Sends "Mm." / avatar nod
│  (Q5/Q23)   │     └────────┬─────────┘ IMMEDIATELY
└──┬──┬──┬────┘              │
   │  │  │                   │ presence signal → client
   │  │  │                   ▼
   │  │  │     ┌──────────────────┐
   │  │  └────▶│  Conductance     │ Q12: Load cross-session
   │  │        │  Loader          │ pathway landscape
   │  │        └────────┬─────────┘
   │  │                 │ behavioral context
   │  │                 ▼
   │  │  ┌──────────────────┐
   │  └─▶│  Prompt Engine   │ Q5: Dynamic system prompt
   │     │  (weight +       │ calibrated to THIS turn
   │     │   conductance +  │
   │     │   resistance)    │
   │     └────────┬─────────┘
   │              │ assembled prompt
   │              ▼
   │     ┌──────────────────┐
   │     │  Claude LLM      │ Streaming response
   │     │  (Sonnet 4)      │ with calibrated prompt
   │     └────────┬─────────┘
   │              │ raw response
   │              ▼
   │     ┌──────────────────┐
   └────▶│  Invariant Gate  │ Q8: 5 topological checks
         │  (post-LLM,     │ BEFORE any audio leaves
         │   pre-TTS)       │
         └──┬─────┬─────────┘
            │     │
     PASS ──┘     └── FAIL → regenerate with constraints
            │
            ▼
   ┌──────────────────┐
   │  ElevenLabs TTS  │ Turbo v2.5
   │  + Simli Avatar  │ PCM16 @ 16kHz
   └────────┬─────────┘
            │ audio + avatar
            ▼
   ┌──────────────────┐     ┌──────────────────┐
   │  Atelier         │     │  Conductance      │
   │  Analytics       │     │  Reinforcement    │
   │  (Dashboard)     │     │  (Q12: thicken    │
   └──────────────────┘     │   used pathways)  │
                            └──────────────────┘
            │
            ▼
       USER HEARS ALINE
```

---

## Module Dependency Map

| Module | Reads From | Writes To |
|--------|-----------|-----------|
| `classifier.js` | user message | prompt-engine, invariant-gate, backchannel, conductance, atelier |
| `invariant-gate.js` | Claude response + classification | prompt-engine (regen constraints), atelier |
| `prompt-engine.js` | classification + conductance + gate violations | Claude API (system prompt) |
| `conductance.js` | classification (reinforcement) + Supabase (load) | Supabase (write) + prompt-engine (landscape) |
| `backchannel.js` | classification | client WebSocket (presence signal) |
| `atelier.js` | all of the above | Supabase + dashboard WebSocket |

---

## Research → Code Mapping

| Research Question | Implementation | File(s) |
|-------------------|----------------|---------|
| **Q5**: Online Relational Predictive Control | Classification → dynamic prompt = adaptive control signal | `classifier.js` → `prompt-engine.js` |
| **Q8**: Topological Invariants | 5 invariant checks on every response before delivery | `invariant-gate.js` |
| **Q11**: Deformation Test Bank | Atelier logs classification + gate data for stress-test analysis | `atelier.js` (enhanced) |
| **Q12**: Mycorrhizal Conductance | Cross-session pathway reinforcement + decay | `conductance.js` |
| **Q13**: Sub-800ms Timing | Three-clock architecture with backchannel-first | `backchannel.js` |
| **Q15**: Gödelian Gate | Gate + Atelier provide internal metrics; external validation requires Q16 protocol | `invariant-gate.js` + `atelier.js` |
| **Q16**: Phenomenological Measurement | Atelier data structure supports DTB integration; actual measurement requires study | Supabase schema |
| **Q23**: Oral-Formulaic Composition | Invariant rules injected as upstream generative constraints, not post-hoc filters | `prompt-engine.js` |

---

## Deployment Steps

### 1. Database Migration
Run `supabase-migration.sql` in your Supabase SQL Editor. This creates:
- `conductance_pathways` — cross-session pathway data
- `conductance_sessions` — per-session stats
- Adds MRA columns to existing Atelier tables

### 2. Update Code
Replace these files in your `aline-backend` repo:
- `server.js` (complete replacement)
- `services/classifier.js` (new file)
- `services/invariant-gate.js` (new file)
- `services/prompt-engine.js` (new file)
- `services/conductance.js` (new file)
- `services/backchannel.js` (new file)

Keep existing files unchanged:
- `services/atelier.js`
- `services/atelier-broadcast.js`
- `services/sentiment.js`
- `services/supabase.js`
- All `app/`, `lib/`, `types/` directories

### 3. Environment Variables
Same as before, plus ensure:
```
MODEL_NAME=claude-sonnet-4-20250514
```
(The new prompt engine is calibrated for Sonnet's instruction following)

### 4. Deploy to Railway
Push to GitHub → Railway auto-deploys. The `railway.toml` start command (`node server.js`) is unchanged.

### 5. Verify
Hit `/health` endpoint. You should see:
```json
{
  "status": "healthy",
  "components": {
    "classifier": "active",
    "invariantGate": "active",
    "promptEngine": "active",
    "conductance": "active",
    "backchannel": "active",
    "atelier": { "enabled": true }
  }
}
```

---

## What You'll See in Logs

Before (old pipeline):
```
Processing: hey how are you
Claude: Hey! I'm doing great, thanks for asking...
```

After (MRA pipeline):
```
────────────────────────────────────────
[Input] "hey how are you"
[Classifier] W1 noise | Mood: WARM_PRESENCE | 2ms
[Backchannel] Sent "Mm." + gentle_nod in 145ms
[Gate] ✓ PASS (3ms)
[Timing] A:145ms/✓ B:620ms/✓ C:980ms/✓
[Response] "There you are. What brings you here tonight?" (W1)
────────────────────────────────────────
```

```
────────────────────────────────────────
[Input] "my father never told me he was proud and it still haunts me"
[Classifier] W21 psychology | Mood: CONFIDANTE | 4ms
[Classifier] Confession depth: 3 signals
[Backchannel] Sent "..." + still_presence in 62ms
[Gate] ✓ PASS (2ms)
[Timing] A:62ms/✓ B:540ms/✓ C:890ms/✓
[Conductance] Reinforced: psychology/trauma → 0.350 (was 0.200)
[Response] "I hear you." (W21)
────────────────────────────────────────
```

---

## What's Still Theoretical (Not Yet Implemented)

1. **Q16 Measurement Protocol**: The MPI → DES → ESM three-phase study requires human researchers, not code. The Supabase schema supports data collection, but the actual phenomenological measurement is a research project, not a feature.

2. **Simli Avatar Cues**: The backchannel engine sends `avatar_cue` messages. Your frontend needs to map these to Simli behaviors (nod, lean, still presence, etc.).

3. **Atelier Dashboard MRA View**: The dashboard currently shows sentiment. It now receives enriched `TURN_COMPLETE_MRA` events with classification, gate, and timing data. A new dashboard panel would visualize these.

4. **Emotion Dictionary Integration**: The 5,400-entry emotion dictionary (`emotion_dictionary_master_v0_2.json`) could enhance the classifier's dimension detection. Current implementation uses keyword matching; the dictionary provides somatic markers and linguistic cues that could deepen classification accuracy.
