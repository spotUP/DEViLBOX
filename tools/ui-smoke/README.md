# UI smoke tests

End-to-end regression gate against a **live** DEViLBOX instance. The tests
connect to the existing MCP WebSocket bridge at `ws://localhost:4003/mcp`
(same transport the full `tools/playback-smoke-test.ts` uses) and drive
real app flows.

## Run

```bash
# Shell 1:
npm run dev
# Open http://localhost:5173 in a browser, click once to unlock AudioContext.

# Shell 2:
npm run test:ui-smoke
```

If the dev server is not up when the suite starts, every flow **skips with
a clear message** — it never fails on a laptop that hasn't booted the app
yet. That's intentional: these tests are gated on real infrastructure, so
they run locally / nightly, not in the push-gated CI suite.

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
