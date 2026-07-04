---
date: 2026-04-21
topic: auto-dub-browser-verify-pending
tags: [dub, autodub, handoff, verification-pending]
status: final
---

# Auto Dub — browser smoke-test pending

Auto Dub shipped to `main` in `209640420` earlier this session. All
automated checks are green (`tsc -b --force`, 24 AutoDub unit tests,
full `test:ci` 2317/2317, `test:compliance`, pre-push hooks). The
feature is **not yet verified under real playback in a browser**.

Full ship details — files, architecture, learnings — live in the
sibling handoff `2026-04-21_auto-dub-shipped.md`. This document only
covers the verification gap and what the next session needs to do.

## Why it wasn't verified in this session

Session's MCP tool registry didn't have the DEViLBOX tools loaded
(`ToolSearch` for `get_song_info` / `play_fur` / `load_modland`
returned no matches). Multiple stale `server/src/mcp/index.ts`
subprocesses were running (PIDs 99792, 89385, 86017 at session end)
but none bound to this Claude Code session.

Per CLAUDE.md's MCP troubleshooting guide, Claude Code does **not**
auto-respawn MCP subprocesses mid-session — fixing this needs a
Claude Code restart so the new session spawns a fresh MCP subprocess
that binds to the tool registry.

Dev-server side was fine: ports 5173 (Vite), 4003 (WS relay), 3011
(Express) all listening. The app was reachable, the bridge just
wasn't.

## Verification steps for the next session

Assumes dev server still running + Claude Code restarted so MCP
tools are available.

1. **Restart Claude Code** (if not already), confirm MCP is live:
   ```
   get_mcp_help()                # should return category list
   get_song_info()               # should return BPM + channel count
   ```
   If either fails → follow `docs/MCP_DEBUGGING_GUIDE.md`.

2. **Load a real dub-friendly song.** Something with a clear
   percussion channel and a slow-ish BPM so the bar-phase rules
   have time to trigger visibly. Known-good options:
   ```
   search_modland(query: "world class dub")   # thick bass, clear drums
   load_modland(full_path: <the first result>)
   ```
   The MOD fixture `mortimer-twang` in ui-smoke is explicitly NOT
   suitable — see `reference_ui_smoke_fixture.md`, almost no bass.

3. **Enable the dub bus.** In browser: go to tracker view → click
   the dub-bus enable control in `DubDeckStrip`. Or via MCP if a
   tool exists; otherwise just drive the browser. The `AutoDubPanel`
   toggle will unlock once `busEnabled = true`.

4. **Enable Auto Dub.** Click `AUTO DUB OFF` in the header next to
   the A/B toggle. Pick persona **King Tubby** from the dropdown —
   this auto-applies the `tubby` bus character preset and sets
   intensity to 0.55. Nudge intensity up to ~0.75 for a punchier
   test.

5. **Press play.** Watch for:
   - `clear_console_errors()` before play, then
     `get_console_errors()` after 8 bars → no crashes, no unhandled
     rejections.
   - Listen: on bar 3 of every 4-bar cycle, expect an echo throw
     on a percussion channel. On odd bars (1/3/5/7...) expect a
     bass-channel mute. Every 8 bars on bar 7 expect tape-stop /
     filter-drop flavour.
   - `get_audio_level()` should NOT be `isSilent: true` — audio
     has to be hitting the dub bus for the moves to be audible.

6. **Kill switch.** Hit the DubBus KILL button (or fire the
   `dub-panic` window event). Auto Dub must (a) stop firing and
   (b) flip its own toggle OFF. If the UI still shows ON but no
   moves fire, that's a bug — the kill-switch race in
   `AutoDubPanel`'s `dub-panic` listener.

## Expected bugs to watch for

None of these are known — they're just the usual shapes of failure
for this kind of rule engine. If the user sees any, file a bug
against `src/engine/dub/AutoDub.ts`:

- **Silent play.** Engine running (`isAutoDubRunning()` true) but
  no audible moves after 16 bars. → check `useTransportStore.isPlaying`
  is true; check `useMixerStore.channels.length > 0`; check
  `detectTransientsFromOscilloscope()` returns non-empty when drums
  hit (or at least the Phase-1 fallback is kicking in via
  `getChannelCount()`). Easiest diagnostic: add a one-line
  `console.log` in `tickImpl` before `chooseMove` and reload.

- **Stuck holds.** User flips AUTO DUB off and a `channelMute` or
  `dubSiren` stays active. → `stopAutoDub()` is supposed to iterate
  `_heldDisposers` and call each `.dispose()`. If a disposer throws,
  the `try/catch` should swallow it. If the mute stays, the returned
  disposer from `fire()` is probably `null` / `undefined` for that
  move type — check `DubRouter.fire`'s return.

- **Persona preset clobber.** User hand-tunes bus voicing, picks a
  persona from the dropdown, loses their tuning. → documented
  behaviour: the "Custom" persona is the opt-out. If users complain,
  replace the on-pick auto-apply with an explicit "Apply persona
  voicing" button (would need a new memory note when changed).

- **Double-mount fire storm.** AutoDubPanel is mounted in both
  `DJView` and `DubDeckStrip`. If both views are visible
  simultaneously, BOTH `useEffect`s will try to start/stop the
  engine. Idempotent guards (`isAutoDubRunning()`) should make this
  a no-op, but if you see moves firing at 2× the expected rate,
  that's the first suspect — the singleton guard is not holding.

## If verification passes cleanly

- Update `project_auto_dub.md` memory — strike the
  "Not yet verified in browser" disclaimer.
- Consider adding a ui-smoke flow (flow 11?) that drives the
  AutoDub toggle + a persona pick + asserts `dub.*` moves fire by
  polling `useDubStore` or routing state. The `route_parameter`
  MCP handler added earlier this week makes that straightforward.

## If something breaks

The feature is opt-in and off by default. If it fires incorrectly
or causes audio issues, the fix path is:

1. User flips `AUTO DUB OFF` → no more moves
2. `AUTO DUB` panel only appears when the dub bus is enabled — if
   the dub bus itself is off, Auto Dub never runs at all

No hotfix needed — just leave the feature off until the bug is
fixed in a follow-up commit. There's no production path where Auto
Dub is on without explicit user action.

## Pointers

- Ship handoff (this session): `thoughts/shared/handoffs/2026-04-21_auto-dub-shipped.md`
- Commit: `209640420`
- Memory: `project_auto_dub.md`
- Core file: `src/engine/dub/AutoDub.ts` (`chooseMove`, `startAutoDub`, `stopAutoDub`)
- Test file: `src/engine/dub/__tests__/AutoDub.rules.test.ts` (24 tests, deterministic seeded RNG)
