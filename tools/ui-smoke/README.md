# UI smoke tests

End-to-end regression gate against a **live** DEViLBOX instance. The tests
connect to the existing MCP WebSocket bridge at `ws://localhost:4003/mcp`
(same transport the full `tools/playback-smoke-test.ts` uses) and drive
real app flows.

## Two ways to run — pick one based on whether you have a DEViLBOX tab open

### Your tab is open (default)

```bash
# Shell 1:
npm run dev
# Open http://localhost:5173, click once to unlock AudioContext.

# Shell 2:
npm run test:ui-smoke
```

Your visible tab drives the tests. You'll see the song load / play / stop
in your UI — that's by design (no other browser to use).

### Your tab is closed — auto-launches headless Chromium

```bash
# Shell 1:
npm run dev
# DO NOT open http://localhost:5173 in your own browser — close any such tab.

# Shell 2:
DEVILBOX_LAUNCH_BROWSER=true npm run test:ui-smoke
```

## Why the ceremony

The MCP relay on port 4003 supports **exactly one** connected browser. A
new registration kicks the old one off; both have auto-reconnect logic, so
if two are open they ping-pong. CI is fine (no user tab exists there).

Extra env knobs:

- `DEVILBOX_HEADLESS=false` — launch visible Chromium (watch the flow)
- `DEVILBOX_SLOWMO=250` — slow each interaction by 250 ms
- `DEVILBOX_URL=http://localhost:5174` — custom dev server URL

If the bridge is unreachable when the suite starts, every flow **skips
with a clear message** — it never fails on a laptop that hasn't booted
the app yet.

## Current flows

- **01 load-play-mod** — loads the committed Mortimer Twang MOD fixture,
  plays ~1.5 s of audio, asserts RMS > 0 and no critical console errors.
  Catches the "format silently fails to produce sound" regression class.
- **02 view-switch-cycle** — cycles `tracker → dj → vj → tracker` via
  `set_active_view`, asserts no critical errors between transitions.
  Catches the App.tsx router-scar class.

## Adding flows

Each flow is a Vitest `describe` block. Keep them tight (< 5 s each) and
use the MCP bridge's declarative tool surface (`stop`, `play`, `load_file`,
`get_audio_level`, `get_console_errors`, `set_active_view`, …). See
`server/src/mcp/mcpServer.ts` for the full tool catalogue (~130 tools).

Don't introduce Puppeteer unless a flow genuinely needs to synthesise
mouse clicks — the bridge already exposes every operation the existing
smoke harness drives.
