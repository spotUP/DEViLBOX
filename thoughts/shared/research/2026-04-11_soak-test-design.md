---
date: 2026-04-11
topic: soak-test-design
tags: [soak-test, gig, dj, vj, mcp, telemetry, brainstorm]
status: draft
---

# Pre-Gig Soak Test — Design

## Problem

DEViLBOX's DJ+VJ rig will be used in production for the first time at a live gig on
**April 18 2026** (one week from now). The project-memory concern is "2+ hour stress
test needed, check memory/GPU under sustained load". An existing `tools/soak-test.ts`
(548 lines) cycles through hundreds of chiptune files testing *format robustness* —
but it never touches the DJ or VJ views, never loads decks, never crossfades, and
measures only heap. That test is useful for validating the track library, but it
doesn't answer the gig question: **will the rig survive two hours of sustained
DJ+VJ use without memory drift, GPU degradation, audio dropout, or frame-time jank?**

## Goal

Build an unattended, scripted 2-hour soak test that drives a realistic DJ+VJ session
via the existing MCP bridge and produces a pass/fail report with gig-blocker gates.
Everything test-side is debug-gated and can be removed after the gig.

## Non-goals

- New user-facing UI, features, or product changes
- Refactor of existing DJ/VJ stores or views
- Manual pre-flight checklist (separate concern; this design is the automated run)
- Teardown/cleanup of the test music library
- CI integration (the report can be diffed manually; CI can come later)

## Chosen approach

**Approach 3 (hybrid).** Rejected approaches 1 and 2:
- *Approach 1 (playwright DOM driver)* — slower, flaky over 2 hours, no room in
  the gig-week timeline for a flaky run.
- *Approach 2 (full DJ/VJ MCP tool surface)* — ~12 new tools is too much durable
  API surface for a debug-only soak test.

Approach 3 adds one generic passthrough MCP tool (`dj_vj_action`) + two telemetry
tools, backed by a single dev-gated browser module (`src/debug/soakActions.ts`)
that exposes `window.__soakActions__`. All scaffolding can be deleted post-gig by
removing the debug module; the telemetry tools stay (reusable).

## Architecture

```
tools/soak-test.ts  (existing MCP client + loop + report, extended)
      │
      ▼  new generic call
┌───────────────────────────────────────────────────────────────┐
│ tracker-mcp bridge (server/src/mcp/mcpServer.ts)              │
│  • dj_vj_action(action, args)     ← generic passthrough        │
│  • get_frame_stats()               ← new telemetry tool         │
│  • get_gpu_stats()                 ← new telemetry tool         │
└───────────────────────────────────────────────────────────────┘
      │
      ▼  (WS relay → existing browser bridge)
┌───────────────────────────────────────────────────────────────┐
│ src/bridge/handlers/soakHandlers.ts  (dev-only)                │
│  → window.__soakActions__[action](args)                       │
│  → window.__soakTelemetry__.getFrameStats()                   │
│  → window.__soakTelemetry__.getGpuStats()                     │
└───────────────────────────────────────────────────────────────┘
      │
      ▼
┌───────────────────────────────────────────────────────────────┐
│ src/debug/soakActions.ts  (dev-only import, wired in main.tsx) │
│  • Loads DJ / VJ stores, wires actions                         │
│  • Starts rAF frame-time recorder (ring buffer)                │
│  • Starts GPU stats collector (WebGL extension queries)        │
└───────────────────────────────────────────────────────────────┘
```

Every piece under `src/debug/` and every new handler is guarded by
`if (import.meta.env.DEV)` so production bundles are unaffected.

## Component specs

### `dj_vj_action` MCP tool

Single generic passthrough. Server-side is a ~15-line entry in
`server/src/mcp/mcpServer.ts` that forwards `{ action, args }` to the browser via
the existing WS relay. Browser handler looks up `window.__soakActions__[action]`
and calls it; throws if unknown.

```ts
// Actions dispatched by the scenario runner
type SoakAction =
  | { action: 'switchView';      args: { view: 'dj' | 'vj' | 'split' } }
  | { action: 'loadDeck';        args: { side: 'A' | 'B'; path: string } }
  | { action: 'playDeck';        args: { side: 'A' | 'B' } }
  | { action: 'stopDeck';        args: { side: 'A' | 'B' } }
  | { action: 'setCrossfader';   args: { value: number } }       // 0..1
  | { action: 'setEQ';           args: { side: 'A' | 'B'; band: 'low' | 'mid' | 'high'; value: number } } // -12..12 dB
  | { action: 'setFilter';       args: { side: 'A' | 'B'; value: number } } // -1..1
  | { action: 'setDeckVolume';   args: { side: 'A' | 'B'; value: number } } // 0..1
  | { action: 'addDeckFx';       args: { side: 'A' | 'B'; type: string } }
  | { action: 'removeDeckFx';    args: { side: 'A' | 'B'; slot: number } }
  | { action: 'setDeckFx';       args: { side: 'A' | 'B'; slot: number; wet: number } }
  | { action: 'switchVjPreset';  args: { scene: 'projectm' | 'isf' | 'three'; index: number } }
  | { action: 'nextVjPreset';    args: {} }
```

Rationale for one generic tool vs many specific ones: the actions are internal
debug hooks, not a reusable API. Centralising through one tool keeps the MCP
surface noise low and the scenario script the single source of truth for the
action shape. Type safety comes from the scenario DSL in `tools/soak-test.ts`,
not from the MCP tool signature.

### `soakActions.ts` (browser-side, dev-only)

`src/debug/soakActions.ts` imports the DJ store, VJ store, and view store, and
exposes each action as a function on `window.__soakActions__`. Each function is
5-10 lines: unpack args, call the relevant store method. No new business logic,
no new state, no duplication of view logic.

Loaded from `src/main.tsx` via:
```ts
if (import.meta.env.DEV) {
  import('./debug/soakActions').then(m => m.installSoakHooks());
}
```

Store method names to wire (needs verification against current store shapes):
- `useDJStore.getState().loadTrackToDeck(side, path)` — or equivalent
- `useDJStore.getState().playDeck(side)`
- `useDJStore.getState().setCrossfader(value)`
- `useDJStore.getState().setDeckEQ(side, band, value)`
- `useDJStore.getState().setDeckFilter(side, value)`
- `useDJStore.getState().addDeckEffect(side, type)`
- `useDJStore.getState().updateDeckEffect(side, slot, updates)`
- `useVJStore.getState().switchPreset(scene, index)`
- View store / `set_active_view` tool (already exists)

If any store method is missing, it's added as a pure dispatcher to the store (no
new features) — this is the expected "plumbing" cost of the design.

### `get_frame_stats()` MCP tool

Returns `{ samples, avgMs, p50Ms, p95Ms, p99Ms, maxMs, jankRatio, windowMs }`
over the interval since the last call, then resets the ring buffer.

Browser-side collector runs one rAF loop started once at dev-mode init:
```ts
let last = performance.now();
const buffer = new Float32Array(30_000); // ~8min at 60fps
let head = 0, count = 0;
function tick(now: number) {
  const delta = now - last;
  last = now;
  buffer[head] = delta;
  head = (head + 1) % buffer.length;
  count = Math.min(count + 1, buffer.length);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

`getFrameStats()` reads the current slice, computes percentiles, resets `count=0`.
Jank = frames > 20ms (below 50fps).

### `get_gpu_stats()` MCP tool

Returns:
```ts
{
  renderer: string;        // from WEBGL_debug_renderer_info
  vendor: string;
  maxTextureSize: number;
  estimatedVramMb: number | null;   // null if browser refuses to expose
  activeTextures: number;            // from Pixi TextureSystem
  activeBuffers: number;             // from Pixi BufferSystem
  drawCallsLastFrame: number | null; // from Pixi renderer stats if available
}
```

Uses the existing Pixi app instance (already a window global `window.__pixiApp__`
or similar — verify during implementation). VRAM estimate via
`ext.getParameter(ext.UNMASKED_RENDERER_WEBGL)` heuristic OR Pixi's own resource
tracker. If the browser/driver refuses to expose VRAM, return `null` gracefully.

### Scenario DSL

Scenarios are data, defined in `tools/soak-scenarios/*.ts`:

```ts
type Step =
  | { t: number; action: string; args: any }
  | { t: number; telemetry: 'frame' | 'gpu' | 'heap' }
  | { t: number; loop: Step[]; every: number; until: number }
  | { t: number; randomPick: 'track' } // resolved at runtime from --music-dir
  | { t: number; log: string };
```

Default scenario `tools/soak-scenarios/gig.ts` — one "track transition cycle":
```
t=0    switchView dj
t=2    loadDeck A <random-track>
t=4    playDeck A
t=15   loadDeck B <random-track>
t=30   playDeck B
t=30   loop every 50ms until t=50:
         setCrossfader ((t-30)/20)        # linear ramp 0 → 1
t=51   stopDeck A
t=52   loadDeck A <random-track>
t=60   setEQ B high -6
t=65   setEQ B high 0
t=70   setFilter B 0.3
t=80   setFilter B 0
t=90   switchVjPreset <cycle>
t=120  telemetry: frame, gpu, heap
# cycle ends at t=120 (2 min), runner wraps back to t=0 with A/B roles swapped
```

Runner loops ~60 cycles = 2 hours. Roles swap each iteration so decks A and B
share load. Track picks are shuffled once at startup from `--music-dir`.

### Report additions

Extends the existing `writeReport()` in `tools/soak-test.ts` with:

**Frame stats section**
```
## Frame time
- Samples: 432000
- p50: 16.4 ms (60 fps)
- p95: 17.1 ms
- p99: 22.3 ms
- Max: 58.7 ms
- Jank ratio: 0.12%  (frames > 20ms)
- p95 sparkline over run: ▁▁▂▂▃▂▂▃▃▄▄▃▃▄▄▅
```

**GPU section**
```
## GPU
- Renderer: Apple M1 Pro
- Vendor: Apple
- VRAM est: 220 MB → 235 MB  (+15 MB drift)
- Active textures: 48 → 52
- Active buffers: 12 → 12
```

**DJ action log**
```
## DJ actions
- loadDeck:      120 ok, 0 failed
- playDeck:      120 ok, 0 failed
- setCrossfader: 48000 ok, 0 failed
...
```

**Pass/fail gate**
Explicit PASS/FAIL section at the end — the runner exits non-zero if any gate
fails. Gates (initial, tune as needed after first run):
- Heap drift < 50 MB over run
- p95 frame time stable (std dev < 5 ms between first-10min and last-10min windows)
- Jank ratio < 1% total
- Zero console errors in the final 30-minute window
- No action-dispatch failures

### Run procedure

```bash
# 1. Start dev server: npm run dev (Vite :5173, Express :3001, WS relay :4003)
# 2. Open browser at http://localhost:5173
# 3. Click anywhere to unlock AudioContext
# 4. Run:
npx tsx tools/soak-test.ts \
  --scenario tools/soak-scenarios/gig.ts \
  --duration 2 \
  --music-dir "/Users/spot/Code/Reference Music/dj-set-library" \
  --snapshot-interval 30 \
  --report "tools/soak-report-$(date +%Y%m%d-%H%M).md"
```

Send `SIGINT` for clean shutdown + partial report.

## File list (new + modified)

**New files:**
- `src/debug/soakActions.ts` — `installSoakHooks()`, all action dispatchers, frame-time rAF recorder, GPU stats collector. Dev-only.
- `src/bridge/handlers/soakHandlers.ts` — browser-side WS bridge handlers for `dj_vj_action`, `get_frame_stats`, `get_gpu_stats`. Dev-only.
- `tools/soak-scenarios/gig.ts` — default 2-hour gig-like scenario.
- `tools/soak-scenarios/types.ts` — `Step`, `SoakAction`, `Scenario` types shared between scenarios and runner.

**Modified files:**
- `server/src/mcp/mcpServer.ts` — register three new tools (`dj_vj_action`, `get_frame_stats`, `get_gpu_stats`), each a ~5-line passthrough.
- `src/main.tsx` — dev-gated import of `soakActions.ts`.
- `tools/soak-test.ts` — add `--scenario` flag, scenario runner loop, telemetry snapshot tracking, extend `writeReport()` with new sections and pass/fail gate. Existing format-cycling code path stays available via an alternate scenario file for regression.

**No semantic changes to:**
- DJ/VJ store behavior — store methods may gain thin pass-through dispatchers
  if something the scenario needs isn't already exposed, but no existing
  method bodies are altered.
- Any production UI
- Existing soak-test format-cycling behavior (preserved behind
  `--scenario tools/soak-scenarios/format-cycle.ts`)

## Success criteria

**Automated (runner exits 0):**
- Heap drift < 50 MB
- Frame time p95 stable (< 5 ms std dev between first-10min and last-10min)
- Jank ratio < 1%
- Zero console errors in final 30-min window
- Zero action-dispatch failures
- All scenario steps completed

**Manual verification after run:**
- `tools/soak-report-*.md` opens and renders correctly
- Frame stats sparkline is non-empty and values look realistic
- DJ action log shows the expected count per action (matches scenario cycle count × cycles)
- GPU stats captured at least once (or explicit "GPU stats unavailable on this driver" note)

## Open questions (resolve during writing-plans phase)

1. **Exact DJ store method names.** The scenario uses logical names (`loadDeck`,
   `setCrossfader`, etc.) — the writing-plans step will read the current DJ store
   and map them 1:1. If a method is missing (e.g. `setDeckEQ(band)` when the
   current store only has per-slot EQ), it's added as a thin dispatcher.

2. **VJ preset switching API.** The VJ view has three scenes (projectm, isf, three).
   Need to verify whether the preset switch is a unified call or scene-specific.
   Writing-plans reads `src/components/vj/*` to confirm.

3. **Pixi resource counts.** Need to verify whether `window.__pixiApp__` (or
   similar) is exposed and whether TextureSystem/BufferSystem have the counts we
   want, or whether we need to maintain them ourselves.

4. **Music library path.** `--music-dir` default — settle on a real directory that
   has ~60+ playable tracks (~2 hours of transitions).

None of these are design blockers — they're implementation details to resolve
while writing the plan.

## Out of scope for this doc

- Detailed implementation plan (that's the next step — `writing-plans`)
- Test of the soak test itself (dogfood: run it for 5min first, iterate)
- Post-gig cleanup (delete `src/debug/soakActions.ts` + dev-gated handlers if
  desired; telemetry tools stay)
