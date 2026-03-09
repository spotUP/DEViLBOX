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

1. DEViLBOX dev server running: `npm run dev` (from project root)
2. Browser open at `http://localhost:5173`
3. Click anywhere in browser to unlock AudioContext
4. MCP server connected (check with `/mcp` in Claude Code)

## Troubleshooting

- **"No browser connected"** → Open browser at localhost:5173
- **Tools not available** → Restart Claude Code to re-handshake with MCP server
- **No audio** → Run `/debug-audio`
- **"Failed to reconnect"** → Kill stale MCP processes: `pkill -f 'mcp/index.ts'`, then restart Claude Code

## Full Documentation

See `docs/MCP_DEBUGGING_GUIDE.md` for complete tool reference and debugging workflows.
