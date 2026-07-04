---
date: 2026-04-20
topic: dub-sweep-and-mcp-catalog-gap
tags: [dub, mcp, sweep, handoff]
status: in-progress
---

# Dub sweep results + MCP tool-catalog blocker

## Status at end of session

7 PRs shipped (#49 → #56). No uncommitted code. Everything in the working tree
is other agents' WIP — do **not** commit it alongside follow-on dub work.

### Shipped PRs this session

| # | Title | Content |
|---|---|---|
| 49 | feat(mcp): surface release_dub_move + enhanced fire_dub_move | `fire_dub_move` now returns `heldHandle`; new `release_dub_move` tool; full moveId enumeration in the schema |
| 50 | feat(dub): mixer-desk layout | DubDeckStrip redesigned vertical-column per channel, master TONE/INSTR/PROC bands up top |
| 51 | chore(dub): diag logs + stereoDoubler tuning | Bolder stereoDoubler defaults (25 ms / 0.55 fb / 0.9 wet) |
| 52 | test(dub): untested-FX sweep harness | `tools/dub-untested-sweep.ts` — WS-bridge driver for 22 dub moves with per-move baseline + CLIP/FLAT/FIRE✗ flags |
| 53 | **fix(dub): oscBass headroom** | Default `level` 0.9 → 0.45, clamp peak at 0.6. Regression test in `src/engine/dub/__tests__/oscBassHeadroom.test.ts` |
| 54 | chore(dub): diag logs + subHarmonic tuning | Fire-time `console.log` on all 6 FLAT moves; subHarmonic threshold 0.06 → 0.035, level 0.7 → 0.85 |
| 56 | chore(sweep): MODLAND_QUERY env-var | `MODLAND_QUERY="world class dub" npx tsx tools/dub-untested-sweep.ts` to auto-load a test song |

### Latest sweep results (pre-fix)

22 moves tested. Test song loaded: **baseline was 0.28 rms while playing** —
data from that run is the canonical reference below.

| Verdict | Moves |
|---|---|
| ✓ working (Δpeak or Δrms > 0.015) | SLAM, FILT, SIREN, WOBBLE, CRACK, DELAY, SCREAM, WIDE, PING, RADIO, SUB, CRUSH |
| CLIP (peak ≥ 0.98) | **BASS** (1.001) → fixed in #53, needs a reload to re-measure |
| FLAT — probe-invisible (likely fine) | 380, DOT (rate-only moves the peak meter can't see), TOAST (needs DJ mic) |
| FLAT — **likely real bugs** | **BACK, DROP, RVRSE, SUBH, STOP, STOP!** |
| Errors | TOAST (`warn: no active DJ mic` — documented) |

## Critical references

- `tools/dub-untested-sweep.ts` — sweep harness. Set `MODLAND_QUERY=...` env to auto-load.
- `server/src/mcp/mcpServer.ts:626-634, 836-842` — `fire_dub_move` / `release_dub_move` schemas (live).
- `src/bridge/handlers/writeHandlers.ts` — `_dubHeld` map + counter drives handle-based release.
- `src/engine/dub/moves/*.ts` — fire-time diag logs added for every move that hit FLAT.
- `/tmp/dub-sweep-*.json` — timestamped snapshots of each sweep run (for diff).

## Next session — where to start

### 1. MCP tools are the blocker for clean testing

The `devilbox-tracker` MCP subprocess is running on port 4003 (PID 15391
at session end), but its tool schemas are **not** in my Claude Code session's
catalogue. Every `ToolSearch` for `fire_dub_move`, `load_modland`,
`get_song_info`, etc. returned **No matching deferred tools found**, even
after `/mcp` reported "Reconnected to devilbox-tracker".

**Will restarting Claude Code fix it?** Probably yes, but kill the running
subprocess first so the new session does a fresh `.mcp.json` handshake:

```sh
# 1. Note the PID (if PID 15391 is still alive):
lsof -nP -iTCP:4003 -sTCP:LISTEN

# 2. Kill the existing MCP subprocess:
kill <PID>

# 3. Quit + reopen Claude Code. The .mcp.json stdio server will respawn
#    cleanly and Claude Code will enumerate all ~130 devilbox-tracker tools
#    during handshake.

# 4. Verify: ToolSearch for "fire_dub_move" should return a match.
```

If the tools still don't show up after that, drop back to
`tools/dub-untested-sweep.ts` — it exercises the same `handlers` map in the
browser via the same bridge (just raw WS instead of stdio-MCP). Same backend,
same results.

### 2. Test plan post-restart

Once the MCP tools are in catalogue:

```
# Load a real dub song so the baseline is audible
load_modland { full_path: "pub/modules/Protracker/<artist>/world class dub.mod" }
# (use search_modland first to find the exact path)

play
# wait 1 s
get_audio_level { durationMs: 1000 }   # baseline must be non-silent

set_dub_bus_enabled { enabled: true }
set_channel_dub_send { channel: 0, amount: 0.6 }

# For each of the 6 FLAT moves:
for move in backwardReverb masterDrop reverseEcho subHarmonic tapeStop transportTapeStop:
    clear_console_errors
    fire_dub_move { moveId: move, channelId: 0 }
    # WATCH THE CONSOLE — the fire-time logs added in #54 will tell you:
    #   [masterDrop] fired — dry gains collected: N  ← N=0 means the real bug
    #   [backwardReverb] fired durationSec=0.8       ← capture-worklet check
    #   etc.
    wait 1500 ms
    get_audio_level { durationMs: 1000 }
    # release if heldHandle
    get_console_errors
```

### 3. Expected FLAT investigation outcomes

- **masterDrop** — if `[masterDrop] fired — dry gains collected: 0` logs,
  the collection loop in `src/engine/dub/moves/masterDrop.ts:25-55` isn't
  finding the active replayer's `.output` GainNode. The engine-loader
  list currently covers Libopenmpt / Hively / UADE / Furnace; extend if
  the test song uses something else.
- **backwardReverb / reverseEcho** — both go through the `ReverseCapture`
  worklet (`DubBus._ensureReverseCapture()`). The fire-time log will
  confirm the moves reach the bus; if the capture worklet doesn't produce
  output, inspect `public/dub/ReverseCapture.worklet.js` + the message
  round-trip inside `DubBus.reverseEcho`.
- **subHarmonic** — defaults bumped in #54 (threshold 0.06 → 0.035,
  level 0.7 → 0.85). Re-run should now trigger on every kick/snare.
- **tapeStop (bus-only)** — only affects dub-bus audio, not the dry mix.
  Visible only with a large channel send; at 0.6 send the peak meter
  may still not see it. Not a bug, measurement limitation.
- **transportTapeStop** — only implemented for LibOpenMPT. If the test
  song is routed through UADE / Furnace / Hively the warning
  `[transportTapeStop] only implemented for LibOpenMPT` fires and the
  bus-only tapeStop carries the effect. Extending to other engines is
  bigger work (needs cross-engine speed abstraction).

### 4. Other agent's WIP still in the tree

- `src/engine/dj/__tests__/scratchPatterns.test.ts` — **untracked**, has
  3 TS errors (`number | undefined` / possibly undefined). Not mine;
  was stashed + popped during my push. Whoever authored it should fix
  the strict-null-check violations before pushing.
- `src/bridge/MCPBridge.ts` + `server/src/mcp/mcpServer.ts` may still
  have the duplicate `fire_dub_move` / `set_dub_bus_enabled` keys that
  the other agent introduced (I saw it earlier in the session; unclear
  if still present). If a pre-push fails with TS1117 in MCPBridge.ts,
  that's this.

### 5. Servers

All four were up at session end. If any went down, standard restart order:

```
# Prefer this if nothing is running:
./dev.sh    # Vite 5173 + Express 3011 + Collab 4002 + MCP 4003

# If only Express is down and MCP is alive on 4003:
cd server && npm run dev
```

The MCP subprocess hosts the WS relay on 4003 as a fallback when Express
isn't running — don't be surprised if Express starts and reports
`EADDRINUSE` on 4003; the Express MCP bridge falls back to connecting as
a client.

## Artifacts

- Sweep results JSON (latest good run): `/tmp/dub-sweep-*.json`
- All shipped PRs merged to `main`. No active branches.
- Other agent's WIP: untracked `src/engine/dj/__tests__/scratchPatterns.test.ts`
  still in working tree; I didn't touch it.
