---
date: 2026-04-20
topic: dub-mixer-desk-layout-and-mcp-tool-surface
tags: [dub, ui, mcp, layout, tracker]
status: in-progress
---

# Dub strip — mixer desk redesign + MCP tool surfacing

## Tasks

1. **Done (uncommitted):** Redesign the tracker Dub Deck strip from horizontal
   channel-rows to a **classic mixer-desk layout** — master section (TONE / INSTR /
   PROC) as full-width bands up top, channel strips as vertical columns below.
2. **Blocked on Claude-Code restart:** Surface the new dub MCP tools
   (`release_dub_move` + enhanced `fire_dub_move`) so they can drive the
   untested-FX sweep (task #1 of the previous session).
3. **Deferred:** Actual MCP-driven test pass against SLAM / FILT / SIREN / WOBBLE /
   CRACK / DELAY / BACK / DROP / STOP / STOP! / TOAST / SCREAM / WIDE / RVRSE /
   PING / RADIO / SUB / BASS / CRUSH / SUBH / 380 / DOT — waiting on (2).
4. **Deferred:** Fix Reverb ↔ Delay chain-swap self-oscillation (live-rewire bug;
   known issue before this session).
5. **Deferred:** Add TOAST move to DJ view (carried from previous session).

## Critical References

- `src/components/dub/DubDeckStrip.tsx:408-720` — the render body. Master-section
  band at `:540-643`, vertical channel strips at `:647-716`.
- `src/components/controls/Fader.tsx` — already vertical; bumped from `size="sm"`
  (14×56 px) to `size="md"` (18×80 px) in the new strip.
- `server/src/mcp/mcpServer.ts:626-634` (enhanced `fire_dub_move` w/ full moveId
  list) and `:836-842` (new `release_dub_move`). Schemas wired but not surfaced.
- `src/bridge/MCPBridge.ts:96-97, 284-285` — imports + dispatch map entries.
- `src/bridge/handlers/writeHandlers.ts:408-432` — `_dubHeld` map + counter,
  `fireDubMove` returning `heldHandle`, `releaseDubMove`.
- `.mcp.json` — MCP subprocess command; **no `--watch` flag**, so file edits to
  `mcpServer.ts` do not auto-reload the subprocess.
- `CLAUDE.md` — MCP debugging section: "Claude Code does NOT auto-restart killed
  MCP subprocesses mid-session" (confirmed today).

## Recent Changes (this session, uncommitted)

`DubDeckStrip.tsx` body rebuilt below `!stripCollapsed`:

- **Master section** — TONE / INSTR / PROC stacked into one full-width grouped
  `<div>` with `border-b border-dark-border` separator. INSTR row now renders
  only `category === 'gen'` moves; PROC row renders `category === 'proc'` moves
  and dims when no channel has `dubSend > 0` with the inline hint *"raise a CH
  send to hear processors"*.
- **Channel strips** — `flex items-end gap-1.5 overflow-x-auto` row of
  `min-w-[52px]` vertical columns. Each column stacks:
  - `CH N` label (truncated)
  - M / T / E / ✦ / B op buttons (`w-full`)
  - HOLD sustained-tap toggle
  - `Fader size="md"` (bigger than old sm)
  - send-% readout
- Column background/border reacts to state: accent-primary tint when HOLD
  engaged, dark-bg with light border when any send is up, bgTertiary otherwise.
- Horizontal scroll when pattern has more channels than fit (XM, IT, FTM).

Other uncommitted diff (not mine — from another agent's WIP):
- `src/components/dialogs/FilePreviewPanel.tsx` — partial refactor extracting
  HVSC magic/extension normalization into `src/lib/hvsc/normalizeHVSCDownload.ts`
  (helper already exists from commit `d8ce60f63`). Don't commit alongside the
  dub changes.

Non-source-code changes:
- Dropped `stash@{0}` (`other-agent-WIP-pause-for-sid-push`) — older version of
  my in-flight dub changes; working tree was already ahead.
- Removed untracked draft `src/bridge/handlers/dubHandlers.ts` — duplicated
  logic already present in `writeHandlers.ts`.

## Learnings

- **MCP subprocess is not in watch mode.** Adding tools to `mcpServer.ts` has
  zero effect until Claude Code itself restarts (which re-invokes the command
  in `.mcp.json`). Editing the file, saving, reloading tools via ToolSearch —
  none of these surface the new schema. Express's `tsx watch` DOES reload, but
  the MCP subprocess is a separate Claude-Code-owned child.
- **MCP subprocess can self-host the WS relay on 4003** when Express isn't
  running. Today's state: MCP owned 4003, Express wasn't listening on 3011.
  Starting Express afterwards hit `EADDRINUSE` on 4003 and fell back to
  connecting as a client (`[mcp-bridge] Port 4003 in use, connecting as client
  instead`). The browser dub bus still works in this topology, but starting
  `./dev.sh` would kill MCP via its port-cleanup phase — risky mid-session.
- **Layout quirk:** the old strip put the vertical `Fader` at the *end* of a
  horizontal row, which is what the user called "a bit weird". Switching each
  channel to a vertical stack of buttons + fader reads correctly as a mixer
  desk.

## Artifacts

- No PRs created. All work on `main`, uncommitted.
- Previous dub PR history: #42 (dub-moves-expansion), #29 (dj deck soak), #28
  (scope pollution), #27 (pre-commit hook).

## Next Steps

1. **User: restart Claude Code** to surface `fire_dub_move` (new signature) and
   `release_dub_move` in the tool list. The running MCP subprocess (PID 84884
   at session end) holds the old schema.
2. **After restart** — run the untested-FX sweep in this order:
   ```
   load world class dub.mod
   play, wait 1 s, baseline get_audio_level (durationMs: 1000)
   set_dub_bus_enabled { enabled: true }
   set_dub_channel_send { channelIndex: 0, amount: 0.6 }
   for each moveId in [SLAM, FILT, SIREN, WOBBLE, CRACK, DELAY, BACK, DROP,
                       STOP, STOP!, TOAST, SCREAM, WIDE, RVRSE, PING, RADIO,
                       SUB, BASS, CRUSH, SUBH, 380, DOT]:
       clear_console_errors
       fire_dub_move { moveId, params }           # capture heldHandle
       wait 1500 ms
       get_audio_level (durationMs: 1000)          # peak during
       if heldHandle: release_dub_move { heldHandle }
       wait 1000 ms
       get_audio_level (durationMs: 500)           # tail check
       get_console_errors
   ```
   Compile a pass/fail/silent table; push notable deltas to `localhost:4444/push-updates`.
3. **Commit the uncommitted work in logical chunks** *before* the sweep adds
   more, so reverts stay simple:
   - Chunk A: MCP bridge additions (mcpServer.ts, MCPBridge.ts, writeHandlers.ts)
   - Chunk B: DubDeckStrip.tsx mixer desk + INSTR/PROC split
   - Chunk C: DubBus.ts + moves (radioRiser, reverseEcho, stereoDoubler)
   - Skip: FilePreviewPanel.tsx (not mine — let the other agent ship it).
4. **Chain-swap self-oscillation** — deferred; known bug when toggling
   `reverseChainOrder` at runtime both `echo→spring` and `spring→echo`
   connections remain live, producing a self-loop. Needs a guarded rewire in
   `DubBus.setReverseChainOrder`.

## Other Notes

- Tests green at session end: **28 files, 2077 passed, 5 skipped**
  (`npm run test:ci`).
- `npm run type-check` passes with the new layout.
- Servers running at session end:
  - Vite 5173 (PID 78613)
  - Collab 4002 (PID 78574)
  - MCP WS relay + stdio on 4003 (PID 84884, Claude-Code owned)
  - Express API 3011 (PID 14724, started this session)
- `npm run dev` at project root only launches Vite — it is NOT the fullstack
  runner. Use `./dev.sh` or start `server/` separately.
- `fire_dub_move` returning `heldHandle: string | null` is an API change for
  callers — not a breaking one (field is additive).
