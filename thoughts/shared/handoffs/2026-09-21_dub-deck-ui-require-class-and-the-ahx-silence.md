---
date: 2026-09-21
topic: Dub Deck live controls, the require() class, and the AHX silence that outlasted four theories
tags: [dub, hively, ahx, require, hmr, worker-watchdog, instrumentation, x23, x27, x29, x30, x31, x32, h15]
status: implemented
---

# Session handoff — 2026-09-21

15 commits, `e7ce7d1e7..b2b512f98`, **none pushed** (the user asked for no pushes this
session — the pre-push gate runs the full suite and takes too long mid-flow).

## Task(s)

1. Deck UI, as asked for during a live take: move the controls a performer rides out of the
   settings cog, line the move rows up as columns, replace the hover status line with
   tooltips, make the header row survive a narrow window.
2. **"do all todos"** — the open ledger threads.
3. The one that took the rest of the session: **`jennipha.ahx` goes silent**, which turned
   out to be neither the song nor what the ledger said.

## What shipped

### Deck, live controls

- **The always-visible row carries FX WET, INTENSITY and FEEDBACK** (`cd28c1d0f`). Intensity
  was inside `AutoDubPanel`, behind a cog the size of a fingernail, and it decides whether a
  section breathes or drives. Both bus faders read through `useLiveDubParam`, so they follow
  a move instead of freezing at the stored value — a new control wired straight to the store
  would have reopened X17. Each group keeps an 11rem floor and the row wraps.
- **Move rows are one grid, so columns line up across rows** (`fc4e57122`). `auto-fill` +
  `1fr`, 7rem floor from the longest label; a narrow deck drops a column rather than
  shrinking a button under its own text.
- **The hover status line is gone** (`1c83f732e`). It was rendered even when empty, so it
  held a row of vertical space open permanently to describe one button occasionally.
  `useHoverTooltip` portals to `document.body` at fixed coordinates from the hovered
  element's rect — both halves matter, because the deck nests clipping containers and
  anchoring to the pointer makes it trail. Native `title` came off the buttons that now have
  a tooltip; faders and selects keep theirs.
- **Header row wraps** (`8550d9bcb`). It had no `flex-wrap` and its parent scrolls
  vertically only, so everything past DLY-VRB was clipped.

### Ledger threads closed

- **X29 ASCII art** (`8550d9bcb`) — the list switches rendering mode rather than being fixed
  per row. A name is art-like when it is mostly drawing characters OR holds an interior run
  of spaces; a LIST is a picture only on a run of three. In art mode: `whitespace-pre`, no
  truncation, no badges, and the rows share a width so the picture scrolls as ONE image.
  Per-row scrolling would shear the drawing apart.
- **X27 HMR wiping the song** (`1214abc56`) — nothing in the codebase handled HMR at all.
  `keepAcrossHmr` carries the DATA of seven stores and deliberately not the functions, since
  actions live in state and restoring an old snapshot reinstates old closures. **Partial
  fix: this only covers a true hot swap. Vite falls back to a FULL PAGE RELOAD when a module
  is not accepted anywhere, and `hot.data` does not survive that** — which is what happens
  in practice when editing engine files. The real answer is restore-from-autosave on reload.
- **X30 worker watchdog** (`799b32985`) — the message blamed OffscreenCanvas in a session
  whose own report said it was supported. The worker's heartbeat is delivered by the MAIN
  thread's event loop, so a blocked main thread sees no heartbeat whether or not one was
  sent. Stage 1 now asks how much of its own time the main thread got and declines to accuse
  the worker below 70%.
- **H15 Fil4 EQ timer writes — closed by reading the DSP, no listening test needed.**
  `fil4-wasm/src/filters.h:37` ramps both coefficients across the block and clamps each
  change to a factor of two; `fil4_wasm.cpp:104` passes unity for a disabled band with the
  comment "so the section interpolates back to flat gracefully". Smoothed by construction,
  for every gain and every rate — stronger than any ear could establish.
- **The mute-ownership registry adae384a8 claimed but never wrote** (`09175f387`). That
  commit's message describes code that has never existed; the edit failed and was not
  noticed. Implemented rather than amending a message three commits back.

### The `require()` class — the biggest real find

`useTransportStore.setCurrentRow` called three things on every row through `require()`,
under a comment calling it "the file's pattern for avoiding circular imports at startup".
**`require` does not exist in an ESM browser bundle.** Each call threw a ReferenceError on
the first row and was swallowed by the catch beside it, so all three had never run:

- dub lane events never fired,
- `Z00` typed into a cell did nothing,
- the edit cursor never followed the play head — reported as "the pattern scroll is frozen".

Only the third is visible, which is why it survived. Fixed in `1d37340d7`: late binding
kept (the cycle is real), dead mechanism replaced with a leaf registry in the shape
`storeAccess.ts` already uses, hooks self-register, the transport loads them once by dynamic
import. A hook that throws is logged once, not once per row.

**47 more `require()` calls remain in `src/`.** Each is the same dead code in a catch that
makes it look deliberate. Worth a sweep; `grep -rn "= require(" src/` finds them.

## X23 — the AHX silence, and four wrong turns

The reproduction is one call. With an AHX playing:

    set_channel_dub_send(channel=1, amount=0.5)
    get_audio_level: rmsAvg 0.0307 -> rmsAvg 0 / rmsMax 0.0074
    and it does NOT recover when the send is set back to 0.

That comparison is like-for-like — one instrument, before and after, same passage. It is the
only one in this investigation that is.

**Everything I concluded on top of it was wrong, four times.** They are recorded because the
pattern matters more than any of them:

1. *"the bus master insert is spliced where Hively does not flow"* — built on readings taken
   in an already-degraded tab.
2. *"play() before the worklet is ready renders silence"* — it was the **crash-recovery
   dialog** sitting unanswered across every reload. `get_modal_state` reports
   `recoveryPromptOpen`; `resolve_recovery_prompt({action:'restore'})` clears it. The user
   had to tell me twice.
3. *"the break is `engine.output → HivelySynth.output`"* — `synthOutput` reads 0 in the
   HEALTHY state too. That node is not in the song-playback path at all; it serves standalone
   instrument mode. I read a constant as a symptom and nearly had a routing lifecycle
   rewritten to fix something that was never broken.
4. *"isolation slots are muting channels out of the main mix"* — had real code behind it
   (an isolated channel IS muted out of the main mix in the split path), and measured dead:
   `isolationSlots [null,null,null,null]`, `isolatedBits 0`, `channelGains [1,1,1,1]`.

**And the analysis under (1) and (3) was not sound.** It compared `lastMainPeak` — the peak
of one render frame — against `insertIn`, an RMS over 2048 samples, at different moments of
the tune. Music runs a crest factor of 10-20x by itself, so "24x down" and "1.0x" can be the
same healthy path two bars apart. The reading that exposed it had `insertIn` (0.0254) LARGER
than `lastMainPeak` (0.0217), which a faithful path cannot do. Same class as reading
`rmsMax 0.0074` as silence.

### What is genuinely established

- **The Hively worklet is innocent.** Its own counters, with a tap open and the mix quiet:
  `mainZeroReturns 0`, `mainRingFull 0`, ring never starves, and `lastMainPeak` tracks the
  music. Both render paths work.
- **Not a stale synth instance** (`hivelyInstanceCount: 1`) and **not Vite module
  duplication** (`synthHoldsLiveEngine: 1`), both checked directly rather than argued.
- **Not isolation slots.**

### The instrument left behind

All of it survives in `get_dub_bus_state`, so the next session starts from measurement:

| Field | What it answers |
|---|---|
| `masterInsertLevels` | RMS at six points along the master insert |
| `upstreamLevels` | engine output, synth bus, master effects input, master input, blep input, every Hively instance and its chain |
| `hivelyRenderStats` | the worklet's own render counters, isolation slots, channel gains |
| `settingsMeter` | cost and arrival rate of `DubBus.setSettings` |

## Critical references

- `src/lib/dev/rowTickHooks.ts` — the leaf registry that replaced the dead `require` calls.
- `src/lib/dev/keepAcrossHmr.ts` — store data across a hot swap; **does not cover full
  reloads**.
- `src/components/ui/HoverTooltip.tsx` — portal tooltip, flips when there is no room above.
- `src/lib/instruments/asciiArtNames.ts` — art detection; needs a RUN, not a count.
- `src/engine/dub/DubBus.ts` — `getMasterInsertLevels()`, `getSettingsMeter()`,
  `strandedMoveMutes` via `lib/dub/channelSendBaseline.ts`.
- `public/hively/Hively.worklet.js` — `renderStats`, reported through `diagDub`.
- `src/bridge/handlers/readHandlers.ts` — `getUpstreamLevels()`; taps are created on first
  read and report `null` that once, because an analyser attached after the fact measures
  nothing.
- `fil4-wasm/src/filters.h:37` — the interpolation that closed H15.

## Learnings

- **A catch that never speaks will hide a call that cannot succeed, indefinitely.** The
  `require` calls looked deliberate for as long as they have existed.
- **Check the instrument answers the question.** Peak against RMS across different bars is
  not a ratio. Two conclusions rested on it.
- **A constant is not a symptom.** `synthOutput: 0` was true in the healthy state too; I
  only measured the broken one.
- **Read the modal state before diagnosing silence.** The recovery dialog blocked every
  reload and cost two wrong theories.
- **`useAudioStore.masterVolume` is dB.** `0` is unity, not silence — that nearly became a
  fifth wrong turn.
- **MCP and dev-server lifecycle:** the relay dies with the dev server and needs `/mcp` to
  reconnect. Port 5174 was held by a different project (`~/Code/retroranks`) at one point and
  the dev script skips non-DEViLBOX processes, then exits — the browser simply never returns.

## Next steps

1. **The A/B that should have been run first.** Read `masterInsertLevels` and
   `upstreamLevels` immediately before and immediately after the single
   `set_channel_dub_send(1, 0.5)` call, so every number is compared against itself one second
   earlier rather than against a different bar. This either names the node or clears the
   whole chain.
2. **Sweep the remaining 47 `require()` calls.** Same dead code, same silent catch.
3. **X27 is half-done** — HMR data survives a hot swap, not a full page reload.
4. **X31 slider crackle** is still open and the ledger's original hypothesis is disproven:
   the settings path costs 0.69 ms and is already coalesced. Needs one real drag with
   `settingsMeter` + `get_frame_stats` read after.
5. Ear items, which only the user can close: move levels (X25) and the six unanswered
   listening questions (O2).
6. **EQ tab layout, asked for and NOT done:** curve full width, the two sliders in two
   columns instead of stacked. I started it and the edit was rejected mid-flight.

## Other notes

- 15 commits unpushed by request. The pre-push gate runs the full suite (~125 s).
- Never run `npm run test:ci` by hand — hooks run it; targeted tests plus
  `npm run type-check`.
- New tests wired into `test:ci`: `strandedMoveMutes`, `asciiArtNames`, `keepAcrossHmr`,
  `rowTickHooks`, `hoverTooltip`, plus additions to `dubDeckStripInteractions.contract` and
  `trackerWatchdog`.

---

## Addendum — 2026-09-21, later session

**X23: root cause found, fixed, and confirmed by ear** (`55a3ef078`).

The A/B this handoff asked for did not reproduce the silence. It exposed
something else, and the something else was real.

`DubChannelLifecycle.active` records what the WORKLET has enabled. A song load
hands the engine a worklet with none of it, and the record survived — so
`setDesired(ch, true)` saw `want === active`, returned `'none'`, and the enable
was never re-posted. Everything else still worked: the fader moved, the store
updated, the send gain ramped. The channel looked live and was silent, for the
rest of the session, and only a transition through zero could clear it.

Measured on jennipha.ahx: channels 2 and 3 held sends of 0.5 and 0.15 with taps
registered and `dubChannelEnabled` false for both. 0.15 → 0.4 on channel 3 did
nothing. 0.4 → 0 → 0.4 brought it straight back, `activeChannels` [0,1] →
[0,1,3].

Fixed in `rebuildDubConnections`, which drops the belief before its early
returns — the no-engine-yet case is exactly the one that otherwise leaves the
stale record for the next send write. Verified through the product's own path
(load, open send, load a second song, play): all four channels enabled, taps
registered, non-zero level at `bus.input`. User confirmed by ear: "it survives".

**Still open:** the ORIGINAL X23 symptom — `rmsAvg` to 0 with no recovery — did
not reproduce on either song today, on a restored project or a clean load. It
is not accounted for by this fix.

**Also this session**

- The `require()` sweep is done (`30b49598f`). All 40 non-test calls gone.
  `src/__tests__/noCommonJsRequire.test.ts` holds the property over the source
  text, because vitest transforms for Node where `require` DOES resolve — a
  per-call unit test passes against the broken code. Ledger of the sweep:
  `thoughts/spot/require-sweep.md` (gitignored).
- **Consequence to watch:** dub lane events had never fired. They fire now, so a
  song carrying dub automation (jennipha does) moves its own sends and bus
  settings during playback where it used to sit still. Observed live: sends
  drifting to 1 / 0.89 / 1 and `echoIntensity`, `sidechainAmount`, `returnGain`
  changing under playback.
- EQ tab layout done (`6dff67105`) — curve fills its container, sliders in two
  columns at >= 720px.
- 19 commits unpushed.
