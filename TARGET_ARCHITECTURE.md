# Target Architecture: The Calibration Layer

> **Status: specification, not current state.**
> Last verified against deployed code 31 July 2026.
>
> This document describes where the service is going. It does not
> describe what Railway runs today. Read every diagram, table, and
> log sample below as a target.
>
> `MRA` survives in file and event identifiers from an earlier
> naming. Those rename when the layer is wired, not before, because
> some of them are Supabase column names.

---

## Why it is called that

Aline's fifth invariant reads: always calibrates, across three channels, emotional weight and civilizational framework and cognitive resource available right now. Chase carries the same property under Register Release. The layer exists to enforce that invariant in code rather than trusting the prompt to hold it.

Every module does one part of the same job. The classifier reads the weight of the turn. The prompt engine calibrates the system prompt to that weight. Conductance calibrates across sessions rather than within one. The gate verifies the calibration held before any audio leaves.

The name describes what the code does. That is the whole requirement.

---

## Current state

Railway starts `node server.js`. That file implements a direct pipeline:

```
text or transcript in ─► Anthropic stream ─► ElevenLabs ─► client
```

`server.js` imports four things: `ws`, `http`, the Deepgram SDK, and the Anthropic SDK. It imports nothing from `services/`. The behavioral layer described in this document exists as written code and is exercised by `test-mra.js` and by nothing else.

The live health endpoint returns:

```json
{ "status": "ok", "personas": ["aline", "chase"] }
```

Production runs `claude-sonnet-4-6`.

Verify any of this yourself:

```bash
grep -n "require(" server.js
grep -rn "services/" server.js
```

Both commands are the reason this banner exists. Anyone can run them.

---

## What the integration would change

The current pipeline is a serial relay. A transcript goes in, a static system prompt goes with it, a response comes back, audio goes out. No behavioral classification of the turn. No cross-session memory. No enforcement of the confidante invariants anywhere except inside the prompt text itself.

The target is a pipeline where classification, invariant enforcement, and pathway memory sit inside the response path rather than beside it. Eight research questions, six modules, one integrated system.

The distance between the two is wiring, not authorship. The modules are written. Nothing calls them.

---

## Target component map

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
   │     │  (Sonnet)        │ with calibrated prompt
   │     └────────┬─────────┘
   │              │ raw response
   │              ▼
   │     ┌──────────────────┐
   └────▶│  Invariant Gate  │ Q8: 5 topological checks
         │  (post-LLM,      │ BEFORE any audio leaves
         │   pre-TTS)       │
         └──┬─────┬─────────┘
            │     │
     PASS ──┘     └── FAIL → regenerate with constraints
            │
            ▼
   ┌──────────────────┐
   │  ElevenLabs TTS  │
   │  + Simli Avatar  │ PCM16 @ 16kHz
   └────────┬─────────┘
            │ audio + avatar
            ▼
   ┌──────────────────┐     ┌──────────────────┐
   │  Atelier         │     │  Conductance     │
   │  Analytics       │     │  Reinforcement   │
   │  (Dashboard)     │     │  (Q12: thicken   │
   └──────────────────┘     │   used pathways) │
                            └──────────────────┘
            │
            ▼
       USER HEARS ALINE
```

None of the arrows above exist in `server.js` today.

---

## Target module wiring

| Module | Would read from | Would write to |
|--------|-----------|-----------|
| `classifier.js` | user message | prompt-engine, invariant-gate, backchannel, conductance, atelier |
| `invariant-gate.js` | Claude response + classification | prompt-engine (regen constraints), atelier |
| `prompt-engine.js` | classification + conductance + gate violations | Claude API (system prompt) |
| `conductance.js` | classification (reinforcement) + Supabase (load) | Supabase (write) + prompt-engine (landscape) |
| `backchannel.js` | classification | client WebSocket (presence signal) |
| `atelier.js` | all of the above | Supabase + dashboard WebSocket |

Every file in this table is present in `services/`. No row is currently connected.

---

## Research to code mapping

The files exist. The wiring does not. This table maps each research question to the module written for it.

| Research Question | Intended implementation | File(s) |
|-------------------|----------------|---------|
| **Q5**: Online Relational Predictive Control | Classification to dynamic prompt as adaptive control signal | `classifier.js`, `prompt-engine.js` |
| **Q8**: Topological Invariants | Five invariant checks on every response before delivery | `invariant-gate.js` |
| **Q11**: Deformation Test Bank | Atelier logs classification and gate data for stress-test analysis | `atelier.js` |
| **Q12**: Mycorrhizal Conductance | Cross-session pathway reinforcement and decay | `conductance.js` |
| **Q13**: Sub-800ms Timing | Three-clock architecture, backchannel first | `backchannel.js` |
| **Q15**: Gödelian Gate | Gate and Atelier supply internal metrics; external validation needs Q16 | `invariant-gate.js`, `atelier.js` |
| **Q16**: Phenomenological Measurement | Atelier schema supports DTB integration; measurement requires a study | Supabase schema |
| **Q23**: Oral-Formulaic Composition | Invariant rules injected as upstream generative constraints rather than post-hoc filters | `prompt-engine.js` |

---

## Integration plan

These steps have not been taken. They are what integration requires.

**1. Database migration.** Run `supabase-migration.sql` in the Supabase SQL editor. Creates `conductance_pathways` and `conductance_sessions`, and adds the calibration columns to the existing Atelier tables. Those columns carry the `mra_` prefix in the migration file. Renaming them is a separate migration and is not a prerequisite for wiring.

**2. Wire the modules into `server.js`.** The current file calls Anthropic directly from `generateResponse`. Integration means classification before the call, gate enforcement between the stream and `sendToElevenLabs`, and conductance writes after. The modules in `services/` are unchanged by this step. Only `server.js` changes.

**3. Environment variables.** The integrated version needs `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`, which are set on Railway and currently unused. `MODEL_NAME` stays `claude-sonnet-4-6`.

**4. Deploy.** Push to GitHub. Railway auto-deploys. The `railway.toml` start command does not change.

**5. Verify.** Integration is complete when `/health` returns the component block below and not before. This is the acceptance test for this document.

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

Until that response is live, this document stays marked as specification.

---

## What the logs would show

These samples are illustrative. They are the intended output format of the integrated pipeline, not captured output from a running system.

Current pipeline:

```
Processing: hey how are you
Claude: Hey! I'm doing great, thanks for asking...
```

Target pipeline:

```
────────────────────────────────────────
[Input] "hey how are you"
[Classifier] W1 noise | Mood: WARM_PRESENCE | 2ms
[Backchannel] Sent "Mm." + gentle_nod in 145ms
[Gate] PASS (3ms)
[Timing] A:145ms B:620ms C:980ms
[Response] "There you are. What brings you here tonight?" (W1)
────────────────────────────────────────
```

```
────────────────────────────────────────
[Input] "my father never told me he was proud and it still haunts me"
[Classifier] W21 psychology | Mood: CONFIDANTE | 4ms
[Classifier] Confession depth: 3 signals
[Backchannel] Sent "..." + still_presence in 62ms
[Gate] PASS (2ms)
[Timing] A:62ms B:540ms C:890ms
[Conductance] Reinforced: psychology/trauma 0.200 to 0.350
[Response] "I hear you." (W21)
────────────────────────────────────────
```

---

## Open items

**The integration itself.** Six modules are written and none are called by the deployed service. This is the gap between this document and the running code, and it is the first item, not the last.

**Crisis-path correctness.** `crisis-override.js` injects resources after `invariant-gate.js` runs. The NEVER_ABANDONS invariant as currently written would block resource delivery. This ordering must be verified against real crisis inputs before any of it ships. Wiring the gate without fixing this makes the service worse, not better.

**Q16 measurement protocol.** The MPI to DES to ESM three-phase study needs human researchers. The Supabase schema supports collection. The measurement is a research project, not a feature.

**Simli avatar cues.** The backchannel engine emits `avatar_cue` messages. The frontend would need to map them to Simli behaviors.

**Atelier dashboard calibration view.** The dashboard shows sentiment. The integrated version would emit enriched `TURN_COMPLETE_MRA` events carrying classification, gate, and timing data. Visualizing them needs a new panel. The event name is a literal identifier and renames with the rest of the code, not with this document.

**Emotion dictionary integration.** The 5,400-entry dictionary (`emotion_dictionary_master_v0_2.json`) could deepen the classifier's dimension detection. The current implementation uses keyword matching.
