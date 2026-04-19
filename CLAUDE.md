# DEViLBOX Project Memory

## CRITICAL: Deployment — Hetzner (NOT GitHub Pages)

**!!! NEVER USE `gh-pages` OR `npx gh-pages -d dist` !!!**

DEViLBOX is hosted on **Hetzner** at `devilbox.uprough.net`.

**Deploy is fully automatic:**
1. `git push origin main` — triggers GitHub Actions (`.github/workflows/deploy.yml`)
2. CI builds, creates a GitHub Release with `devilbox-dist.tar.gz`
3. Webhook triggers the Hetzner server to pull and deploy

**To deploy:** just push to main. That's it. CI handles building + deploying.

**If CI build fails:** fix the code issue (type errors, missing files, etc.) and push again.

**Server setup docs:** `scripts/server-setup.sh`

---

## CRITICAL: Always Fix the Root Cause

**!!! NO WORKAROUNDS — FIX THE ACTUAL BUG !!!**

- **NEVER use workarounds, shims, or "good enough" hacks.** If noteOff doesn't work, fix the noteOff code — don't send allNotesOff as a band-aid.
- **NEVER leave a known root cause unfixed** while papering over the symptom. The lazy path creates tech debt that compounds.
- **Trace to the actual source** — if the bug is in C++/WASM, fix the C++/WASM and rebuild. If it's in the store, fix the store. Don't patch around it in a different layer.
- **If a proper fix requires a rebuild, do the rebuild.** The extra 30 seconds is always worth it vs shipping a workaround that breaks later.

---

## CRITICAL: Never Guess or Assume

**!!! ALWAYS CHECK THE FACTS — GO BY THE FACTS !!!**

- **NEVER guess** what code does — read it.
- **NEVER assume** what a function returns, what state a variable is in, or why something fails — verify it.
- **NEVER theorize** for multiple paragraphs about what "might" be happening — add diagnostics, build, run, and look at the actual output.
- **Guessing and assuming takes you nowhere.** It wastes time and leads to wrong fixes.
- When debugging: add targeted diagnostics → build → run → read the output → act on facts.
- When implementing: read the actual source code first, not docs or summaries that may be stale.

---

## CRITICAL: Build Verification Rules

**!!! ALWAYS RUN STRICT BUILD CHECK AFTER CODE CHANGES !!!**

After writing or editing any TypeScript code, ALWAYS run:
```bash
npm run type-check
```

This runs `tsc -b --force` which catches errors that `npx tsc --noEmit` misses:
- Unused variables (TS6133)
- Type mismatches with undefined/null
- Enum syntax errors with `erasableSyntaxOnly`
- Other strict mode violations

**DO NOT mark a task complete until `npm run type-check` passes with no errors.**

---

## CRITICAL: UI Architecture Rules

**!!! SINGLE SOURCE OF TRUTH — NO DUPLICATED CODE !!!**

### Architecture

DEViLBOX uses DOM (React HTML) rendering exclusively.

```
Stores + Hooks (shared data)  →  DOM Components (React HTML/canvas)
```

### Rules

1. **Share stores and hooks** — `useGTUltraStore`, `useGTUltraFormatData`, etc. are the single source of truth for data. Components consume them.
2. **Never duplicate logic** — Data transforms, cell change handlers, adapter functions live in shared hooks/utils (e.g., `useGTUltraFormatData.ts`, `gtuAdapter.ts`). Components only handle presentation.
3. **Always use design tokens — NEVER hardcode colors** — DOM components use Tailwind token classes from `tailwind.config.js` — NEVER raw Tailwind colors (`text-red-400`, `bg-blue-500`). The only exceptions are intentional decorative palettes (channel colors, hot cue colors, oscilloscope voice colors). **See the exact token class reference below.**

### Tailwind Token Class Reference (MANDATORY)

These are the **ONLY** valid color classes. Do NOT invent class names — if it's not in this list, it doesn't exist.

**COMMON MISTAKE:** Using `bg-bg-primary`, `border-border-primary`, `bg-bg-secondary` — these DO NOT EXIST. The correct prefix is `dark-` for backgrounds/borders and `text-` for text colors.

| Purpose | Background | Text | Border |
|---------|-----------|------|--------|
| **Primary surface** | `bg-dark-bg` | `text-text-primary` | `border-dark-border` |
| **Secondary surface** | `bg-dark-bgSecondary` | `text-text-secondary` | `border-dark-borderLight` |
| **Tertiary surface** | `bg-dark-bgTertiary` | `text-text-muted` | — |
| **Hover state** | `bg-dark-bgHover` | — | — |
| **Active state** | `bg-dark-bgActive` | — | — |
| **Inverse text** | — | `text-text-inverse` | — |
| **Primary accent** | `bg-accent-primary` | `text-accent-primary` | `border-accent-primary` |
| **Secondary accent** | `bg-accent-secondary` | `text-accent-secondary` | `border-accent-secondary` |
| **Highlight accent** | `bg-accent-highlight` | `text-accent-highlight` | `border-accent-highlight` |
| **Error / destructive** | `bg-accent-error` | `text-accent-error` | `border-accent-error` |
| **Success** | `bg-accent-success` | `text-accent-success` | `border-accent-success` |
| **Warning** | `bg-accent-warning` | `text-accent-warning` | `border-accent-warning` |

**Opacity variants:** Append `/<opacity>` — e.g., `bg-accent-primary/10`, `bg-accent-error/20`, `border-accent-primary/50`.

**Focus rings:** `focus:ring-accent-primary` (use `focus:ring-1` not `focus:ring-2` in compact panels).

**Inputs & controls:** `bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs`

**Compact panel typography:** `text-[10px] font-mono` for labels, `text-[9px] font-mono` for badges. NEVER `text-sm font-semibold` in side panels — that's for full-page layouts.

### UI Component Usage (MANDATORY)

Use the design system components from `src/components/ui/` — NEVER build one-off inline buttons/modals:

| Need | Use | NOT |
|------|-----|-----|
| Any clickable action | `<Button variant="primary\|default\|ghost\|danger">` | `<button className="px-4 py-2 bg-...">` |
| Dialog/popup | `<Modal>` + `<ModalHeader>` + `<ModalFooter>` | `<div className="fixed inset-0 ...">` |
| Dropdown select | `<CustomSelect>` from `@components/common/CustomSelect` | `<select className="...">` |
| Continuous value | `<Knob>` from `@components/controls/Knob` | `<input type="range">` |
| Boolean toggle | `<Toggle>` from `@components/controls/Toggle` | `<input type="checkbox">` |
| Toast message | `notify.success\|error\|warning()` | `alert()` or custom toast div |

---

## CRITICAL: Git Safety Rules

**!!! ABSOLUTE RULE - NEVER VIOLATE !!!**

### NEVER overwrite local changes without explicit user approval

Before running ANY of these destructive git commands, you MUST:

1. **STOP and WARN the user** about potential data loss
2. **Show exactly what local changes exist** (`git status`, `git diff --stat`)
3. **Explain the impact** - how many files, lines of code, hours of work at risk
4. **Get EXPLICIT approval** - user must type "yes" or confirm
5. **Suggest saving first** - recommend `git stash` or creating a backup branch

**FORBIDDEN COMMANDS** (without user approval AND saving local changes first):
- `git reset --hard` - DESTROYS all local changes
- `git checkout .` - DESTROYS all local changes
- `git restore .` - DESTROYS all local changes
- `git clean -f` - DELETES untracked files permanently
- `git pull` (when local changes exist) - Can cause merge conflicts or loss
- `git fetch origin && git reset --hard origin/main` - DESTROYS everything

**SAFE ALTERNATIVES:**
- `git stash` - Saves local changes before any destructive operation
- `git stash -u` - Saves local changes INCLUDING untracked files
- `git branch backup-YYYY-MM-DD` - Creates backup branch before reset
- `git diff > backup.patch` - Saves changes as patch file

**WHY THIS MATTERS:**
On 2025-01-29, 20 hours of local development work was permanently lost when
`git reset --hard` was run without saving local changes first. This catastrophic
data loss must NEVER happen again.

**WHEN IN DOUBT: DO NOT RUN THE COMMAND. ASK THE USER FIRST.**

---

## MCP Server — Live Tracker Control

DEViLBOX has an MCP server that gives Claude **full programmatic control** of the running tracker app via ~130 tools. It can read/write patterns, control playback, analyze audio, search music archives, and more.

### Prerequisites

1. **Dev server running FIRST:** `npm run dev` (starts Vite on :5173, Express on :3011, **WS relay on :4003**)
2. **Browser open:** Navigate to `http://localhost:5173` — the MCP bridge auto-connects in dev mode
3. **Click in the browser** to unlock the AudioContext (required for audio tools)

### Architecture (Three-Link Chain)

```
Claude Code ←stdio→ MCP Subprocess ←WS:4003/mcp→ Express Relay ←WS:4003→ Browser SPA
```

**Three independent processes must ALL be running and connected:**

1. **Express Dev Server** (owns port 4003): Central WS message broker
2. **MCP Subprocess** (connects to port 4003 as client): Tool definitions, stdio to Claude
3. **Browser SPA** (connects to port 4003 as client): Executes tool calls against the running app

The `.mcp.json` at project root configures auto-start. Claude Code spawns the MCP subprocess automatically.

### CRITICAL: "No browser connected" Troubleshooting

This error means the MCP subprocess has no WebSocket link to the relay/browser. **Most common cause:** the MCP subprocess started before Express and owned port 4003, then Express restarted and reclaimed the port — leaving the MCP subprocess disconnected.

**Quick diagnosis:**
```bash
# Who owns port 4003?
lsof -nP -iTCP:4003 -sTCP:LISTEN
# Should be the Express dev server node process

# Does the MCP subprocess have a TCP connection?
ps aux | grep "mcp/index.ts" | grep -v grep  # get PID
lsof -nP -p <MCP_PID> | grep TCP
# If EMPTY → MCP is disconnected → restart Claude Code to re-spawn it
# (Claude Code does NOT auto-restart killed MCP subprocesses mid-session)
```

**Fix order:** Always start Express first (`npm run dev`), then start/restart Claude Code. If the MCP connection breaks mid-session, **restart Claude Code** — it will re-spawn the MCP subprocess which connects as a client to the Express relay.

**Full troubleshooting guide:** `docs/MCP_DEBUGGING_GUIDE.md`

### Quick Start — Use `get_mcp_help` First

Call `get_mcp_help` to see all ~130 tools grouped by category. Optionally filter: `get_mcp_help(category: "transport")`.

### Key Tool Categories

| Category | Examples | What For |
|----------|----------|----------|
| **Song/Pattern** | `get_song_info`, `get_pattern`, `set_cell`, `render_pattern_text` | Read/write tracker data |
| **Transport** | `play`, `stop`, `set_bpm`, `seek_to` | Playback control |
| **Mixer** | `set_channel_volume`, `set_channel_mute`, `solo_channel` | Mix control |
| **Instruments** | `get_instruments_list`, `get_synth_config`, `update_synth_config` | Synth programming |
| **Audio Analysis** | `get_audio_analysis`, `get_audio_level`, `wait_for_audio` | Debugging audio |
| **Console Debugging** | `get_console_errors`, `clear_console_errors`, `play_fur` | Capture browser errors, load+play .fur in one call |
| **AI Composition** | `analyze_song`, `generate_pattern`, `transform_pattern` | Music generation |
| **Modland** | `search_modland`, `load_modland` | Search & play 190K+ tracker modules |
| **HVSC** | `search_hvsc`, `load_hvsc` | Search & play 80K+ C64 SID tunes |
| **File Loading** | `load_file` | Load any of 188+ music formats from disk |
| **Batch** | `batch` | Execute multiple tools atomically in sequence |

### Console Debugging — Format Error Triage

Three tools for catching WASM crashes, JS errors, and worklet failures that only appear at runtime:

- **`clear_console_errors`** — wipe the buffer before loading a new file (gets clean per-song errors)
- **`play_fur(path)`** — load a `.fur` file from disk AND immediately start playback in one call
- **`get_console_errors`** — returns `{entries: [{level, message, timestamp}]}` of everything captured since last clear

The browser captures: `console.error`, `console.warn`, `window.onerror` (Uncaught:), and `unhandledrejection` (UnhandledRejection:).

**Standard debug loop for a single format:**
```
clear_console_errors()
play_fur("/path/to/song.fur")
# wait 3-5 seconds
get_console_errors()   → look for WASM panics, "table index out of bounds", worklet errors
get_audio_level()      → check for silence (isSilent: true = loaded but no audio)
```

**Batch audit loop across all .fur demos:**
```python
DEMOS = "/Users/spot/Code/DEViLBOX/third-party/furnace-master/demos"
for chip_dir in os.listdir(DEMOS):
    for fur_file in glob(f"{DEMOS}/{chip_dir}/*.fur"):
        clear_console_errors()
        play_fur(fur_file)
        sleep(3)
        errors = get_console_errors()   # crashes = bad
        level  = get_audio_level()      # isSilent = broken but no crash
        # → classify as works / crashes / silent
        # → POST to http://localhost:4444/update
```

**Updating the format status tracker at localhost:4444:**
```bash
curl -X POST http://localhost:4444/update \
  -H "Content-Type: application/json" \
  -d '{"key": "fur-nes-demo", "data": {"auditStatus": "fixed", "notes": "works"}}'
```

The tracker is the source of truth for format audit progress. Load the current state with `GET /get-data`.

### Format Status Tracker — localhost:4444

A live dashboard tracking audio-correlation audit results for all 731 .fur demo files.

- **`GET /get-data`** → full status dict: `{key: {auditStatus, envCorr, chip, song, divergeAt, rmsdB}}`
- **`POST /update`** → `{key: string, data: {...}}` — update one entry; pushes SSE to all browsers
- **`POST /push-updates`** → `{updates: {key: data, ...}}` — bulk update many entries at once
- Keys follow pattern: `fur-<chip>-<song>` (chip = directory name, song = filename lowercased, spaces/dashes stripped)
- `auditStatus` values: `fixed` | `fail` | `unknown` | `crashes` | `silent`

### Common Patterns

```
# Orient yourself
get_song_info → BPM, channels, patterns, editor mode

# Debug silence
get_audio_state → check initialized, contextState, masterMuted
get_synth_errors → check for WASM crashes
get_playback_state → check isPlaying

# Search and play music
search_modland(query: "commando") → get full_path
load_modland(full_path: "pub/modules/...") → downloads + auto-plays

search_hvsc(query: "hubbard") → get path
load_hvsc(path: "MUSICIANS/H/Hubbard_Rob/Commando.sid") → plays

# Multi-step operations
batch(operations: [{tool: "set_bpm", args: {bpm: 140}}, {tool: "play", args: {}}])
```

### Full Documentation

See `docs/MCP_DEBUGGING_GUIDE.md` for complete tool reference, debugging workflows, and architecture details.

---

## Format Status Tracker — localhost:4444

A live dashboard tracking format audit results. Server at `tools/format-server.ts`, dashboard at `tools/format-status.html`. State persisted to `tools/format-state.json`.

**Start:** `npx tsx tools/format-server.ts &` — serves on port 4444.

### Pushing Updates (live — browsers update instantly via SSE)

```bash
# Single entry
curl -X POST http://localhost:4444/update \
  -H 'Content-Type: application/json' \
  -d '{"format":"fur-gameboy-cheap","auditStatus":"fixed","envCorr":0.993,"notes":"17/17 pass"}'

# Bulk (preferred for batch operations)
curl -X POST http://localhost:4444/push-updates \
  -H 'Content-Type: application/json' \
  -d '{"fur-gameboy-cheap":{"auditStatus":"fixed","envCorr":0.993,"notes":"17/17 pass"}}'
```

### Key Convention

Audit entries: `fur-<chip>-<songname>` (e.g. `fur-gameboy-cheap`, `fur-nes-thecheetahmen`).
New keys auto-create rows in the dashboard — no HTML changes needed.

### Audit Data Fields

| Field | Type | Description |
|-------|------|-------------|
| `auditStatus` | `"fixed"\|"fail"\|"unknown"` | Overall audit result |
| `envCorr` | `number` (0-1) | Envelope correlation vs reference (>=0.90 = PASS) |
| `rmsDbDiff` | `number` | RMS difference in dB |
| `notes` | `string` | Free-text (e.g. "17/17 pass", "9 silent instruments") |

### SSE Events (live push to browsers)

- `event: update` — from `POST /update`
- `event: bulk-update` — from `POST /push-updates`
- `event: connected` — sent on SSE connect

Full docs: `docs/FORMAT_STATUS_TRACKER.md`

---

## CRITICAL: Knob/Control Handling Pattern

**!!! ALWAYS USE THIS PATTERN FOR CONTROLS !!!**

### The Problem: Stale State in Callbacks

When React components handle rapid user input (knobs, sliders, etc.), callbacks can capture **stale state** from previous renders. This causes:
- Knobs interfering with each other (moving one knob resets others)
- Sluggish/laggy controls
- Lost parameter changes
- Frustrating user experience

### The Solution: Use Refs for Current State

**ALWAYS** use a `ref` to track the current config state, just like TB-303Controls does:

```typescript
export const MyControls: React.FC<Props> = ({ config, onChange }) => {
  const configRef = useRef(config);

  // Keep ref in sync with props
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Update helper - uses configRef.current, NOT config
  const updateParameter = useCallback((key: string, value: number) => {
    onChange({
      ...configRef.current,  // ← Use ref, NOT config prop!
      [key]: value
    });
  }, [onChange]); // ← Remove config from dependencies

  return (
    <Knob
      value={config.someParam}
      onChange={(v) => updateParameter('someParam', v)}
    />
  );
};
```

### Reference Implementation

**TB303Controls** (`src/components/instruments/controls/JC303StyledKnobPanel.tsx`) is the **reference implementation**. When creating new synth controls:

1. **Copy the pattern** from TB303Controls
2. Use `configRef.current` in ALL callbacks that modify state
3. Remove `config` from `useCallback` dependencies (keep only `onChange`)

### Files Fixed Using This Pattern

- ✅ `src/components/instruments/controls/JC303StyledKnobPanel.tsx` (reference)
- ✅ `src/components/instruments/synths/modular/views/ModularRackView.tsx` (fixed 2026-02-14)

### What NOT to Do

❌ **WRONG** - Uses stale `config` prop:
```typescript
const handleChange = useCallback((key, value) => {
  onChange({ ...config, [key]: value });  // BUG: stale config!
}, [config, onChange]);
```

✅ **CORRECT** - Uses current `configRef`:
```typescript
const handleChange = useCallback((key, value) => {
  onChange({ ...configRef.current, [key]: value });
}, [onChange]);
```

### MIDI-Driven Snappiness: `paramKey` imperative fast path

Every knob in the app **MUST** use `@components/controls/Knob`. When the knob's value can be driven by a MIDI CC (via `parameterRouter`), pass the matching `paramKey` prop:

```tsx
<Knob
  value={config.filter.cutoff}
  onChange={(v) => updateFilter('cutoff', v)}
  paramKey="cutoff"   // ← matches PARAMETER_ROUTES key in parameterRouter.ts
  ...
/>
```

**What it does:** the Knob auto-subscribes to `subscribeToParamLiveValue(paramKey, …)`. On every MIDI CC (~100Hz), the router fires subscribers synchronously and the Knob writes `x1/y1/x2/y2` on the indicator line + `d` on the arc directly to the DOM — **fully bypassing React render**. Mouse drag still works via the normal `value`/`onChange` path because the Knob's drag code uses its own internal state.

**Every knob that takes MIDI must pass `paramKey`.** No exceptions. Mixing imperative DJ knobs with non-imperative synth knobs is why knobs felt inconsistent (2026-04-17 fix).

The param keys match the `PARAMETER_ROUTES` table in `src/midi/performance/parameterRouter.ts`:
- TB303 main: `cutoff`, `resonance`, `envMod`, `decay`, `accent`, `overdrive`, `slideTime`, `tuning`, `volume`
- DJ: `dj.crossfader`, `dj.deckA.eqHi`, `dj.deckA.filter`, `dj.masterVolume`, etc.
- Siren: `siren.osc.frequency`, `siren.lfo.rate`, `siren.delay.time`, etc.
- Furnace FM: `furnace.algorithm`, `furnace.op1TL`, etc.

### Knob Perf Invariants (do not break)

The `Knob` component is the **only** rotary-knob component in the app:
- No CSS transitions on the SVG pointer/arc — each render IS the animation frame.
- No idle drop-shadow filter (active-only) — GPU filter passes are expensive.
- `React.memo` skips value-prop re-renders when `paramKey` / `imperativeSubscribe` is set.
- DJ param writes are rAF-batched via `scheduleDJStoreSync` → single `setState` → single immer run → single subscriber broadcast per frame.

If you're tempted to add a transition, a custom knob, or a raw `<input type="range">` — don't. Extend `Knob` or `Fader` (linear sibling, TODO) instead.

---

## Furnace Synth Implementation

*** IMPORTANT ***

When debugging or implementing Furnace chip synths, instruments, or imports:

1. **ALWAYS reference the CLEAN upstream Furnace sources** at `/Users/spot/Code/Reference Code/furnace-master/`
   - Platform implementations: `src/engine/platform/` (e.g., `gb.cpp`, `nes.cpp`, `rf5c68.cpp`)
   - WASM wrapper (our code): `/Users/spot/Code/DEViLBOX/furnace-wasm/common/FurnaceDispatchWrapper.cpp`
   - Build sources (may have local modifications): `/Users/spot/Code/DEViLBOX/third-party/furnace-master/`
   - **NEVER read from `third-party/` as reference** — it may contain local modifications
2. **NEVER guess** - Always reference the actual Furnace source code
3. **Get proof/evidence** - Read the relevant platform file
4. **Implement 1:1** - Match the Furnace source exactly, including:
   - Register write sequences
   - Timing/order of writes
   - Envelope formats
   - Frequency calculations
   - Key-on/key-off sequences

Reference code location: `/Users/spot/Code/Reference Code/furnace-master/src/engine/platform/`

### Lock-Step Command Debugging (preferred method)

**DO NOT compare WAV files to debug playback accuracy.** Instead, run both renderers in lock-step and compare dispatch commands tick-by-tick. The first mismatch reveals the exact bug.

**Step 1 — Generate reference command log (upstream Furnace CLI):**
```bash
"/Users/spot/Code/Reference Code/furnace-master/build-headless/furnace" \
  -output /dev/null -loops 0 -view commands \
  "path/to/song.fur" 2>/dev/null | grep "^[[:space:]]*[0-9]" > /tmp/ref-cmds.txt
```
Format: `tick | chan: COMMAND_NAME(val1, val2)`

**Step 2 — Generate DEViLBOX command log (WASM headless renderer):**
```bash
npx tsx tools/furnace-audit/render-devilbox.ts "path/to/song.fur" /dev/null --cmdlog
```
Creates `.cmdlog.txt` file. Format: `tick cmd chan val1 val2 ret`

**Step 3 — Compare tick-by-tick:**
Find the first tick where commands diverge. The diverging command reveals which effect, macro, or register write is handled differently.

**Why this works:** WAV comparison is affected by blip_buf resampling phase artifacts (1-sample offset = 0.89 envCorr at 10ms). Command comparison is deterministic — any mismatch is a real bug in the sequencer or instrument loading.

**Key insight from V2M debugging:** Running both implementations in lock-step with internal state comparison finds issues that would take hours to find via WAV comparison.

### Loop Seek Infrastructure (2026-03-23):
- `furnace_dispatch_set_skip_writes(handle, skip)` added to wrapper (extern "C")
- 33 remaining lock-step fails need tick-level seek with this flag
- Row-level seek crashes (Bxx/Dxx re-trigger loops), tick-level seek without skip corrupts state
- The reference's playSub(true) does: reset → setSkipRegisterWrites(true) → tick-seek → setSkipRegisterWrites(false)

*** IMPORTANT ***

---

## localStorage Schema Versioning

Schema versioning in `src/hooks/useProjectPersistence.ts` — bump `SCHEMA_VERSION` when
changing default instrument configs or stored data structures. Old data is discarded on load.
See the version history comments in that file.

---

## DB303 / TB-303 Synth — Definitive Reference

*** READ THIS ENTIRE SECTION BEFORE TOUCHING ANY 303 CODE ***

### History of Confusion

Between 2026-02-09 and 2026-02-12, we went through **6+ audit cycles** that produced
conflicting results every time because different C++ source files were read. The wrong
sources have now been deleted. DO NOT recreate them or read stale docs about 303 params.

**Wrong sources that were deleted (DO NOT reference):**
- `juce-wasm/db303/` — DELETED. Was a different JUCE build, NOT the running WASM.
- `juce-wasm/open303/` — DELETED. Another copy, also not running.
- `mame-wasm/db303/` — DELETED. Yet another copy, also not running.
- `docs/TB303_*.md`, `docs/DB303_*.md` — DELETED. Contained outdated/conflicting info.
- `claudedocs/parameter_ranges_verification.md` — DELETED. Wrong values.

### Source of Truth Chain (PROVEN)

The correct and ONLY sources, in order of authority:

1. **`public/db303/DB303.wasm`** — The actual running WASM binary.
   - MD5: `c618210d83ad1bbf613afb84a5adc117`
   - Identical to `db303-local/db303.wasm` (verified via MD5 match).

2. **`db303-local/default-preset.xml`** — The reference app's startup defaults.
   - The reference app (`db303-local/db303-index-unmin.js`) calls
     `fetch("presets/default-preset.xml")` during `loadDefaults()` at init (line 2784).
   - These XML values OVERRIDE the JS hardcoded defaults.

3. **`db303-local/db303-index-unmin.js`** — The reference app's JS source.
   - Shows how the UI sends values to WASM (all 0-1 normalized).
   - Shows the hardcoded JS defaults (which get overridden by the XML on init).
   - Shows which params are inverted (`passbandCompensation` has `invert: !0`).

4. **`Reference Code/jc303-main/src/JC303.cpp`** — The JUCE wrapper source.
   - Contains `setParameter()` which converts 0-1 → real DSP values.
   - Uses `linToLin()` and `linToExp()` from `GlobalFunctions.h`.
   - This conversion layer is COMPILED INTO the WASM. JS never needs to convert.

5. **`Reference Code/jc303-main/src/dsp/open303/rosic_Open303.cpp`** — The DSP engine.
   - Shows internal value ranges (cutoff in Hz, envMod 0-100%, etc.).
   - DO NOT use these ranges in TypeScript — the WASM converts internally.

### Parameter Pipeline

```
TypeScript (0-1) → AudioWorklet (passthrough) → WASM setParameter (converts 0-1 → real) → Open303 DSP
```

- `DB303Synth.ts` sends 0-1 normalized values via `postMessage` to worklet.
- `DB303.worklet.js` calls `this.synth[setterName](numericValue)` — no transformation.
- WASM `JC303.cpp::setParameter()` converts: e.g., cutoff 0-1 → 314-2394 Hz (exponential).
- Open303 DSP uses real-world values internally.

**RULE: TypeScript ALWAYS sends 0-1. NEVER convert to Hz/ms/% in JS.**

### Conversion Table (from JC303.cpp::setParameter)

| Parameter       | 0-1 Input | Real DSP Value     | Mapping     |
|-----------------|------------|--------------------| ------------|
| cutoff          | 0.0-1.0    | 314 - 2394 Hz      | Exponential |
| resonance       | 0.0-1.0    | 0 - 100%           | Linear      |
| envMod          | 0.0-1.0    | 0 - 100%           | Linear      |
| decay           | 0.0-1.0    | 200 - 2000 ms      | Exponential |
| accent          | 0.0-1.0    | 0 - 100%           | Linear      |
| tuning          | 0.0-1.0    | 400 - 480 Hz       | Linear      |
| volume          | 0.0-1.0    | -60 - 0 dB         | Linear      |
| waveform        | 0.0-1.0    | 0 - 1 (saw→square) | Linear      |
| normalDecay     | 0.0-1.0    | 30 - 3000 ms       | Linear      |
| accentDecay     | 0.0-1.0    | 30 - 3000 ms       | Linear      |
| softAttack      | 0.0-1.0    | 0.3 - 3000 ms      | Exponential |
| slideTime       | 0.0-1.0    | 2 - 360 ms         | Linear      |

### filterSelect — CRITICAL

Only TWO valid values:
- **`0`** = DiodeLadder (the classic 303 filter, produces screams)
- **`5`** = MissThang-20 (Korg alternative filter)

**Any other value (1, 2, 3, 4, 255, etc.) is INVALID** and puts the filter in an
undefined state, killing resonance and the characteristic 303 sound.

The reference app sets `filterSelect(0)` on init (line 2358 of db303-index-unmin.js).
The default-preset.xml has `filterSelect: 255` which is invalid but gets sent to WASM
which presumably clamps or ignores it. DEViLBOX defaults to `filterSelect: 0`.

**Previous bug:** DEViLBOX used `filterSelect: 1` for months, which is invalid and
was likely the primary reason the 303 couldn't produce its characteristic screaming
sound on high-pitched notes.

### Inverted Parameters

Two parameters are inverted before sending to WASM (matching reference app's `invert: !0` flag):
- **`passbandCompensation`**: App state 0.09 → WASM gets `1 - 0.09 = 0.91`
- **`resTracking`**: App state 0.257 → WASM gets `1 - 0.257 = 0.743`

The reference app's XML stores these as knob positions. For `resTracking`, the XML also
stores the inverted value (line 727: `1 - i.resTracking`), so reading requires double
inversion: XML 0.743 → `1 - 0.743 = 0.257` (app state) → `1 - 0.257 = 0.743` (WASM).
For `passbandCompensation`, the XML stores the knob value directly (0.09).

This inversion is done in `DB303Synth.ts` at the `set()` and `applyConfig()` methods.

**Previous bug (fixed 2026-02-12):** App state was 0.9 and 0.7 respectively (copied from
JS hardcoded defaults instead of XML runtime defaults). This sent 0.1 and 0.3 to WASM
instead of the correct 0.91 and 0.743.

### Correct Default Values (from default-preset.xml)

These are the values DEViLBOX uses in `DEFAULT_TB303` (src/types/instrument.ts):

| Parameter              | Value  | Source                    |
|------------------------|--------|---------------------------|
| cutoff                 | 0.5    | default-preset.xml        |
| resonance              | 0.5    | default-preset.xml        |
| envMod                 | 0.5    | default-preset.xml        |
| decay                  | 0.5    | default-preset.xml        |
| accent                 | 0.5    | default-preset.xml        |
| **filterSelect**       | **0**     | Reference init code            |
| **normalDecay**        | **0.164** | default-preset.xml             |
| **accentDecay**        | **0.006** | default-preset.xml             |
| softAttack             | 0         | default-preset.xml             |
| **accentSoftAttack**   | **0.1**   | default-preset.xml             |
| **passbandCompensation** | **0.09** | default-preset.xml (→WASM 0.91) |
| **resTracking**        | **0.257** | XML 0.743 inverted (→WASM 0.743) |
| **filterInputDrive**   | **0.169** | default-preset.xml             |
| **diodeCharacter**     | **1**     | default-preset.xml             |
| **duffingAmount**      | **0.03**  | default-preset.xml             |
| oversamplingOrder      | 2         | Reference init code            |

### How Accent Works (from rosic_Open303.cpp)

The 303 accent is triggered by MIDI velocity:
- `velocity >= 100` → accented note (`hasAccent = true`)
- `velocity < 100` → normal note

On an accented note, the DSP:
1. Sets `accentGain = accent` (the global accent amount, 0-1)
2. Uses `accentDecay` for the filter envelope (very fast → sharp filter spike)
3. Uses `accentAmpRelease` for amp release (shorter)

On a normal note:
1. Sets `accentGain = 0`
2. Uses `normalDecay` for the filter envelope (slower)

The accent sweep is smoothed by an RC circuit (rc2, 15ms time constant) which creates
the characteristic curved sweep. Consecutive accented notes build up progressively
because the RC doesn't fully discharge — this is the "escalating scream" effect
described in hardware analysis (firstpr.com.au/rwi/dfish/303-unique.html).

### What Makes the 303 "Scream"

Reference: https://www.firstpr.com.au/rwi/dfish/303-unique.html

The screaming sound on high-pitched notes comes from:
1. **DiodeLadder filter (filterSelect=0)** — the nonlinear diode ladder resonates
2. **High resonance** (0.85+) — pushes toward self-oscillation
3. **Filter envelope sweep** — envMod determines range, decay determines speed
4. **Filter drive** (filterInputDrive) — saturates the filter input
5. **Diode character** (diodeCharacter) — adds nonlinear harmonics

If filterSelect is NOT 0 (DiodeLadder), the filter won't have the right character.

### TB-303 Hardware Architecture (from firstpr.com.au analysis)

The 303's unique sound comes from its unusual envelope and accent circuit design,
which has no parallel in standard modular synth components.

**Two Envelope Generators:**
- **VEG (Volume Envelope Generator):** Sharp attack, exponential decay, FIXED decay time.
  Only drives the VCA. The note's volume shape is always the same.
- **MEG (Main Envelope Generator):** Sharp attack, exponential decay, VARIABLE decay
  (controlled by Decay knob). Drives the filter cutoff frequency. On accented notes,
  MEG uses a FIXED short decay instead of the knob setting.

**The Accent Sweep Circuit (key to the scream):**
The accent circuit uses a diode, 47kΩ resistor, 100kΩ pot, and 1µF capacitor.
When accented notes play in succession, the capacitor doesn't fully discharge between
notes, causing the filter peak to rise PROGRESSIVELY higher with each note. This is
described as "the cry of a living creature becoming increasingly distressed."

The filter response produces "a quick, smooth curve" rather than the angular response
you would get from a standard ADSR envelope generator.

**Accent does FOUR things simultaneously** (Chris Meyer / Patreon analysis):
1. **Snaps filter envelope decay to minimum** — overrides the Decay knob setting
2. **Adds shortened filter envelope to VCA** — creates multi-segment envelope
   (instant attack → fast decay → slow decay), louder peak than normal notes
3. **Adds a SECOND slower envelope to filter cutoff** — summed with the normal
   fast-decay envelope, creating: instant attack → very fast decay → slower
   re-attack → slower decay (complex multi-segment shape)
4. **The second filter envelope ACCUMULATES** — if re-triggered before fully
   decaying, it starts from its current level, climbing higher each note.
   This is the "escalating scream" / "cry of a living creature" effect.

**The Filter (Tim Stinchcombe analysis):**
- The 303 filter is **4-pole** (not 2-pole as commonly stated) — diode ladder
- Coupling capacitors around the filter core create **~6 additional poles** that
  act as a hidden high-pass filter with a fixed cutoff around **8 Hz**
- When you increase resonance on the LPF, you ALSO increase resonance on this
  hidden HPF, creating a **resonant bass boost** at 8 Hz that extends up through
  50-100+ Hz. This is why the 303 gets "fatter" at high resonance instead of
  losing bass like a typical resonant LPF.

**Devil Fish Modifications (relevant to our DevilFish params):**
- Independent MEG time control for normal vs accented notes (normalDecay/accentDecay)
- Ability to reduce Env Mod to zero
- Extended Env Mod range at full clockwise rotation

**Key insight:** "There are a number of things that only the TB-303 can do — which
cannot be done with a modular synth using standard modules." The accent is not just
"louder and brighter" — it's four interacting effects that create complex multi-segment
envelopes, and the accumulation behavior has no equivalent in standard ADSR modules.

### Common Mistakes (DO NOT REPEAT)

1. **Reading the wrong C++ source.** The JUCE builds (`juce-wasm/`, `mame-wasm/`) were
   DIFFERENT from the running WASM. They have been deleted.

2. **Using `filterSelect: 1`.** Only 0 and 5 are valid. 1 is undefined behavior.

3. **Confusing JS hardcoded defaults with runtime defaults.** The JS code has
   `accentDecay: 0.1` hardcoded, but the app loads `default-preset.xml` on init
   which overrides it to `0.006`. The XML values are the effective defaults.

4. **Converting 0-1 to Hz/ms in TypeScript.** The WASM does all conversion internally.
   TypeScript ALWAYS sends 0-1 normalized values.

5. **Reading `rosic_Open303.cpp` and thinking those are the values to send from JS.**
   The DSP expects real values (Hz, ms, %), but the WASM wrapper (JC303.cpp) converts
   from 0-1. JS sends 0-1, not real values.

6. **Treating the `tb303DevilFishPresets.ts` file as authoritative.** That file uses
   raw Hz/ms/% values and is only used in test files. The actual presets are in
   `tb303Presets.ts` which uses 0-1 normalized values.

### File Locations

| File | Purpose |
|------|---------|
| `src/types/instrument.ts` | `DEFAULT_TB303` — default config, source of truth for app defaults |
| `src/constants/tb303Presets.ts` | Factory presets (0-1 normalized). Uses `DF_DEFAULTS` shared object. |
| `src/engine/db303/DB303Synth.ts` | TypeScript API layer. `applyConfig()` and `set()` entry points. |
| `public/db303/DB303.worklet.js` | AudioWorklet. Routes params to WASM. Forces `filterSelect(0)` on init. |
| `public/db303/DB303.wasm` | The running WASM binary (site-rip, NOT built from juce-wasm/). |
| `db303-local/default-preset.xml` | Reference defaults (source of truth for default values). |
| `db303-local/db303-index-unmin.js` | Reference app JS (source of truth for param handling). |
| `Reference Code/jc303-main/` | JC303 source (source of truth for WASM internals). |
| `src/hooks/useProjectPersistence.ts` | Schema versioning — bump when changing defaults. |

---

## Hardware UI WASM Modules — Extraction Pattern

Hardware UIs (PT2, FT2) compile real reference source code to WASM via Emscripten, then blit the framebuffer to a React canvas each rAF frame.

### Architecture

```
Reference C source → WASM bridge (pt2_sampled.c / ft2_sampled.c) → Emscripten MODULARIZE
→ factory `createXXX({})` injected via script tag → React rAF loop calls `_tick()` then blits fb
```

### Build Commands

```bash
cd <module>/build && emcmake cmake .. && emmake make
# PT2: cd pt2-sampled-wasm/build && emcmake cmake .. && emmake make
# FT2: cd ft2-sampled-wasm/build && emcmake cmake .. && emmake make
```

### Critical Rules

- **NEVER let an agent generate binary data arrays** (font bitmaps, sprite data). Always `cp` from reference:
  - `cp "third-party/pt2-clone-master/src/gfx/pt2_gfx_font.c" pt2-sampled-wasm/src/`
  - Agent-generated binary data renders silently garbled (e.g., "FWk RACHT" instead of "ALL RIGHT")
- `EM_JS` and `EMSCRIPTEN_KEEPALIVE` macros produce false IDE errors — they are NOT real build errors
- Mouse `mouseup`/`mousemove` events go on `document`, not canvas, to handle drag-outside-canvas
- Call `_tick()` before blit each rAF frame so C-side update flags are processed before rendering
- Add null guard `if (m._module_tick)` to handle browser cache serving old WASM without the export

### Framebuffer Blit (BGRA→RGBA byte swap)

```typescript
/* WASM little-endian ARGB 0xAARRGGBB stored as [BB,GG,RR,AA] */
/* Canvas ImageData wants [RR,GG,BB,AA] */
dst[off] = src[off+2]; dst[off+1] = src[off+1]; dst[off+2] = src[off]; dst[off+3] = 255;
```

### PT2 Module

- Framebuffer: 320×255. Sampler occupies rows 121–254 (SAMPLER_Y=121, SAMPLER_H=134)
- Output: `public/pt2/PT2SampEd.js` + `.wasm`
- Config buffer: 11 bytes `[volume, finetune, loopStart(4 LE), loopLength(4 LE), loopType]`
- Source: `pt2-sampled-wasm/src/` — extracted from `third-party/pt2-clone-master/`

### FT2 Module

- Framebuffer: 632×400. Sample editor occupies most of the screen.
- Output: `public/ft2/FT2SampEd.js` + `.wasm`
- Source: `ft2-sampled-wasm/src/` — extracted from `third-party/fast tracker 2/`

---
