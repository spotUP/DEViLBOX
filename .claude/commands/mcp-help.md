---
name: mcp-help
description: "List all DEViLBOX MCP tools and slash commands"
---

# /mcp-help — DEViLBOX MCP Tool Reference

## Quick Reference: Slash Commands

| Command | What It Does |
|---------|-------------|
| `/play-modland <query>` | Search & play from Modland archive (190K+ tracker modules) |
| `/play-hvsc <query>` | Search & play C64 SID tunes from HVSC (80K+) |
| `/play-file <path>` | Load & play any music file from disk (188+ formats) |
| `/tracker-status` | Full status report of the running tracker |
| `/debug-audio` | Diagnose why there's no audio output |
| `/compose <type>` | Generate bass/drums/melody/arpeggio patterns |
| `/sound-design <id>` | Analyze & design synth sounds with spectral tools |
| `/mix <action>` | Mixer control: volumes, effects, auto-mix |
| `/edit-pattern <action>` | Read/write tracker pattern data |
| `/mcp-help` | This help listing |

## All MCP Tools by Category

Call `get_mcp_help` for the full runtime listing, or `get_mcp_help(category: "transport")` to filter.

### Most Used Tools

| Tool | What It Does |
|------|-------------|
| `get_song_info` | BPM, channels, patterns, editor mode, playback state |
| `render_pattern_text` | Show pattern as ASCII tracker view |
| `play` / `stop` / `pause` | Playback control |
| `set_bpm` | Change tempo |
| `set_cell` | Write a note/instrument/volume/effect to a cell |
| `get_audio_state` | Audio engine diagnostics |
| `search_modland` / `load_modland` | Find and play Modland modules |
| `search_hvsc` / `load_hvsc` | Find and play HVSC SID tunes |
| `load_file` | Load any music file from disk |
| `batch` | Execute multiple tools atomically |
| `get_mcp_help` | Full categorized tool listing |

## Prerequisites

1. DEViLBOX dev server running **FIRST**: `npm run dev` (starts Express + WS relay on port 4003)
2. Browser open at `http://localhost:5173` (check console for `[mcp-bridge] Connected to MCP relay`)
3. Click anywhere in browser to unlock AudioContext
4. MCP subprocess auto-started by Claude Code (connects to Express relay as client)

## Troubleshooting

### "No browser connected" — Most Common Issue

This means the MCP subprocess → Express relay → Browser chain is broken. **Quick fix:**

```bash
# Check if Express owns port 4003
lsof -nP -iTCP:4003 -sTCP:LISTEN

# Find MCP subprocess PID
ps aux | grep "mcp/index.ts" | grep -v grep

# Check if MCP has a TCP connection (should show ESTABLISHED to port 4003)
lsof -nP -p <MCP_PID> | grep TCP

# If EMPTY — MCP lost its connection. Restart Claude Code to re-spawn it.
# (Claude Code does NOT auto-restart killed MCP subprocesses mid-session)
```

**Root cause:** The MCP subprocess and Express both try to own port 4003. If MCP started first and Express restarted later (Vite HMR, crash), MCP loses its server and has no reconnection logic. **Fix: restart Claude Code** — it will re-spawn the MCP subprocess, which will connect as a client to the existing Express relay. Note: killing the MCP subprocess PID alone is NOT enough; Claude Code does not auto-restart killed MCP subprocesses mid-session.

### Other Issues

- **Tools not available** → Restart Claude Code to re-handshake with MCP server
- **No audio** → Run `/debug-audio`
- **Port 4003 stuck** → `lsof -nP -iTCP:4003`, kill the owning PID, restart `npm run dev`

## Full Documentation

See `docs/MCP_DEBUGGING_GUIDE.md` for complete tool reference and debugging workflows.
