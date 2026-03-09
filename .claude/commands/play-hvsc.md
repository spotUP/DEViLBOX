---
name: play-hvsc
description: "Search the HVSC (80K+ C64 SID tunes) and play a song"
---

# /play-hvsc — Search & Play C64 SID Tunes

Search the High Voltage SID Collection (80K+ C64 SID tunes) and play the result in DEViLBOX.

## Usage

```
/play-hvsc <search query>
```

Examples: `/play-hvsc hubbard commando`, `/play-hvsc galway`, `/play-hvsc monty on the run`

## Prerequisites

- DEViLBOX dev server running (`npm run dev` from project root)
- Browser open at `http://localhost:5173`
- Click anywhere in the browser to unlock AudioContext

## Steps

1. **Search**: Call the MCP tool `search_hvsc` with the user's query:
   ```
   search_hvsc(query: "<user query>", limit: 10)
   ```

2. **Show results**: Display as a numbered list showing: filename, author, HVSC path, SID model (6581/8580), subtune count.

3. **Ask which to play** (if multiple results): Let the user pick, or if only one good match, proceed.

4. **Load & Play**: Call `load_hvsc` with the chosen result's `path`:
   ```
   load_hvsc(path: "<path from search result>")
   ```
   This downloads via CORS proxy (cached 24h), loads into DEViLBOX, and auto-plays.

5. **Verify audio**: Call `wait_for_audio(timeoutMs: 5000)` to confirm sound is playing.

6. **Report**: Tell the user what's playing — song name, composer, SID model, number of subtunes.

## Multi-Subtune SID Files

Many SID files contain multiple tunes. If the user wants a specific subtune:
```
load_hvsc(path: "<path>", subsong: 2)
```
Subtune indices start at 0.

## Browsing Instead of Searching

To browse the HVSC directory tree:
```
browse_hvsc()                              → root (DEMOS, GAMES, MUSICIANS)
browse_hvsc(path: "MUSICIANS/H")           → composers starting with H
browse_hvsc(path: "MUSICIANS/H/Hubbard_Rob") → all Hubbard tunes
```

## Featured Classics

Call `get_hvsc_featured` for a curated list of classic SID tunes (Rob Hubbard, Martin Galway, Jeroen Tel).

## Troubleshooting

- "No browser connected" → Browser must be open at localhost:5173
- "HVSC download failed" → The HVSC mirror may be slow. Try again.
- No audio → Call `get_audio_state` to check AudioContext. User may need to click in browser.
