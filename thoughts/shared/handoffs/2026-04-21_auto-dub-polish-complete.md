---
date: 2026-04-21
topic: auto-dub-polish-complete
tags: [dub, autodub, handoff, biquad, ui-smoke, mcp]
status: final
---

# Auto Dub polish — session complete

Followed up `209640420` (the ship) with a full browser-verify pass,
two targeted polish fixes, CI regression locks, and infrastructure
cleanup. Three commits shipped on `main`, CI → Hetzner auto-deploy
rolling.

## Commits shipped (2026-04-21 mid-session → EOD)

| SHA | Subject |
| --- | --- |
| `471862741` | fix(dub): AutoDub polish — biquad stability + voice preset separation |
| `b42aebfc2` | test(ui-smoke): flow 12 — Auto Dub CI regression lock |

Plus local-only doc: `docs/MCP_DEBUGGING_GUIDE.md` gained a
"Tool-Discovery Race" section. Gitignored, stays on this machine.

Parallel-agent commits landed on top mid-session (no conflicts):
`f9af92483` (Auto-Name Channels + density tuning + wet-cap),
`8187e63f0` (persona audition ▶ button), `273354d81` (DUB 4 pad
sublabels).

## What the polish fixes did

### BiquadFilterNode instability (commit `471862741`)

**Pre-fix:** every `tubbyScream` fire triggered
`BiquadFilterNode: state is bad, probably due to unstable filter
caused by fast parameter automation` within ~3 ms. Root cause:
bandpass Q=3.5 inside a loop-gain>1 feedback path → poles sat too
close to the unit circle, Chromium reset filter state on first
render quantum.

**Fix (`src/engine/dub/DubBus.ts::startTubbyScream`):**
- `bp.Q.value` lowered from 3.5 → 2.2 (still metallic-scream
  character, numerically stable under loop gain).
- Feedback gain held at 0 for 30 ms after connect
  (`tap.gain.setValueAtTime(0, now + 0.03)` before the linearRamp
  to fbAmt). Gives the filter a few render quanta of clean signal
  to reach steady state before the loop closes above unity.

**Post-fix browser verify:** 6 tubbyScream fires on real-song
playback, **zero** BiquadFilterNode warnings. Flow 12 asserts this
in CI.

### Voice preset clobber (commit `471862741`)

**Pre-fix:** persona pick unconditionally called
`setDubBus({ characterPreset })`, silently wiping hand-tuned bus
voicings. Docs said "Custom persona is the opt-out" — UX too
hidden.

**Fix (`src/components/dub/AutoDubPanel.tsx`):**
- `handlePersonaChange` now only sets persona + intensity.
- New `applyPersonaVoice` handler bound to a dedicated "♫" button
  next to the persona dropdown. Renders only when
  `getPersona(persona).suggestedCharacterPreset` is truthy.
- Hand-tuned voicings now survive persona switches. Explicit ♫
  click is how you get "full Tubby sound".

**Verified:** voice=scientist, then switch persona tubby → madProfessor
→ voice stays scientist.

## Regression locks

**Contract test** `src/components/dub/__tests__/AutoDubPanel.contract.test.ts`
(7 tests, wired into `test:ci` + `test:all`):
- `handlePersonaChange` body must NOT contain `setDubBus(` or
  `characterPreset`
- `applyPersonaVoice` must exist, gated on `suggestedCharacterPreset`
- ♫ button render must be gated
- ♫ button onClick must bind `applyPersonaVoice`
- `startTubbyScream`'s `bp.Q.value` must be ≤ 2.5
- `tap.gain.setValueAtTime(0, now + delay)` with delay ≥ 0.02 s
  must exist

Regression-lock ritual confirmed: temporarily reverting the
handlePersonaChange fix made the "must NOT call setDubBus" test
fail; restoring made it pass. Q-check test similarly fails if Q is
bumped back to 3.5.

**Browser-driven flow** `tools/ui-smoke/ui-smoke.test.ts`
(flow 12, ~13 s):
- Loads committed fixture `mortimer-twang-2118bytes.mod`
- Enables dub bus + applies Tubby character preset
- `set_auto_dub_config({ enabled: true, persona: 'tubby', intensity: 0.75 })`
- Asserts `isRunning: true`
- Plays 10 s
- Asserts: 0 BiquadFilterNode warnings, 0 DubRouter noise, 0
  critical errors
- Toggles AutoDub off
- Asserts `isRunning: false` after 1.5 s drain

Required new bridge surface (shipped in `b42aebfc2`):
- `src/bridge/handlers/writeHandlers.ts::setAutoDubConfig`
- `src/bridge/handlers/readHandlers.ts::getAutoDubState`
- wired in `src/bridge/MCPBridge.ts`
- exposed as MCP tools `set_auto_dub_config` + `get_auto_dub_state`
  in `server/src/mcp/mcpServer.ts`

Setter deliberately does NOT auto-apply the persona voicing —
matches the UI's post-clobber-fix behaviour. Callers must call
`set_dub_bus_settings` separately if full persona voice wanted.

## Other work shipped

### `.playwright-mcp/` cleanup
Deleted 152 stale test artifacts (9.7 MB → 0). Directory is
gitignored. Nothing to commit; just disk hygiene.

### MCP startup-timing instrumentation
`server/src/mcp/index.ts` now emits phase timing to stderr:

```
[mcp] subprocess spawned (pid=14158)
[mcp] +3ms relay started
[mcp] +47ms tools registered
[mcp] +48ms ready — DEViLBOX MCP server running on stdio
```

Lets future sessions diagnose the tool-discovery race documented in
`docs/MCP_DEBUGGING_GUIDE.md` (see "Tool-Discovery Race" section).

### Tool-Discovery Race doc (local only)
Documented the failure mode hit early this session: MCP subprocess
alive, TCP ESTABLISHED, `ListMcpResourcesTool` works, but
`ToolSearch` returns zero devilbox tools. Observed cause: Claude
Code caches `tools/list` from the initial handshake window; if
the subprocess isn't ready yet, the empty result gets cached for
the session, and `/mcp` reconnects don't invalidate. Documented
three workarounds: full Claude restart (not `/mcp`), pivot to
Playwright, kill stale MCP subprocesses first.

Not fixed on server side — cache behaviour is in the harness.

## Open items for next session

### 1. Role-targeted moves still not firing (investigation needed)

Parallel-agent `f9af92483` landed Auto-Name Channels exactly to fix
the limitation I flagged ("channelMute on bass doesn't fire because
MOD channels are named 'Channel 1-4'"). Post-ship re-verify was
inconclusive:

- **Confirmed working:** UI input boxes show "Kick" for ch4, "Pad
  1/2/3" for ch1-3 immediately after Import Module on world-class-dub.
- **NOT confirmed:** whether `pattern.channels[i].name` actually
  received the rename. Direct store probe returned pattern count of
  1 (world-class-dub has 15 patterns), suggesting the song had
  already unloaded when I checked — my Playwright session kept
  losing state across Vite HMR reloads.
- **Observed:** with AutoDub + Tubby + 0.75 intensity on the loaded
  song, 30 s of playback fired only `subHarmonic` + `reverseEcho`.
  No `channelMute`, `echoThrow`, `snareCrack`, `channelThrow`, etc.

**Next session should:**

1. Open a clean browser tab at localhost:5173 (no Playwright — the
   HMR reload churn ate my session state mid-verify).
2. Load world-class-dub.mod via the Online tab → search → Import
   Module.
3. Open DevTools console, then run:
   ```js
   const { useTrackerStore } = await import('/src/stores/useTrackerStore.ts');
   const { classifyPattern } = await import('/src/bridge/analysis/MusicAnalysis.ts');
   const pat = useTrackerStore.getState().patterns[0];
   console.table(pat.channels.map((c, i) => ({ i, name: c.name })));
   console.table(classifyPattern(pat));
   ```
   — expected (if Auto-Name is propagating): ch4 name = "Kick",
   classify returns role="percussion" for ch4.
4. If names ARE propagated and roles ARE classified → enable
   AutoDub + Tubby + intensity 0.75, play 30 s, watch console for
   `[channelMute]` / `[echoThrow]` / `[snareCrack]` lines. If still
   no fires, the issue is in AutoDub's rule-roulette density tuning
   (post-`f9af92483`: roll × 0.3, cooldown 6 bars). Inspect
   `src/engine/dub/AutoDub.ts::chooseMove` to see what % of rolls
   actually land on role-targeted rules at Tubby bias.

### 2. Tool-discovery race (parked, not fixable server-side)

Instrumentation is in place; workarounds are documented. If it
repeats, capture the `[mcp] +Nms ready` line from stderr and check
whether the gap is > 1 s.

### 3. flow 12 uses thin fixture

`mortimer-twang-2118bytes.mod` is the committed fixture — has
almost no bass (see `reference_ui_smoke_fixture.md`). Flow 12
still catches the biquad + no-stuck-state invariants, but a richer
fixture would also catch role-targeted regressions if Auto-Name
Channels is wired through properly. Options:

- Add a minimal dub-test fixture to `src/__tests__/fixtures/` (2
  kB file with bass/kick/perc/pad instrument names) — no license
  concerns, author it from scratch.
- Or expose a path through the bridge to fetch from modland cache
  during tests (already have `/api/modland/download` on Express).

## Pointers

- Ship commit: `471862741`
- ui-smoke commit: `b42aebfc2`
- Earlier handoffs:
  - `thoughts/shared/handoffs/2026-04-21_auto-dub-shipped.md`
  - `thoughts/shared/handoffs/2026-04-21_auto-dub-browser-verify-pending.md`
- Memory: `project_auto_dub.md` (fully updated with fix + open items)
- Core files:
  - `src/engine/dub/DubBus.ts::startTubbyScream` (Q + hold fix)
  - `src/components/dub/AutoDubPanel.tsx` (persona/voice separation)
  - `src/components/dub/__tests__/AutoDubPanel.contract.test.ts`
    (static grep regression lock)
  - `tools/ui-smoke/ui-smoke.test.ts::flow 12` (live browser)
- New bridge surface:
  - `src/bridge/handlers/writeHandlers.ts::setAutoDubConfig`
  - `src/bridge/handlers/readHandlers.ts::getAutoDubState`
  - MCP tools: `set_auto_dub_config`, `get_auto_dub_state`
