---
name: play-modland
description: "Search the Modland archive (190K+ tracker modules) and play a song"
---

# /play-modland — Search & Play from Modland

Search the Modland archive of 190K+ tracker modules and play the result in DEViLBOX.

## Usage

```
/play-modland <search query>
```

Examples: `/play-modland commando protracker`, `/play-modland horizon future composer`

## Prerequisites

- DEViLBOX dev server running (`npm run dev` from project root)
- Browser open at `http://localhost:5173`
- Click anywhere in the browser to unlock AudioContext

## Steps

1. **Search**: Call the MCP tool `search_modland` with the user's query:
   ```
   search_modland(query: "<user query>", limit: 10)
   ```
   If the user specified a format, add `format: "<format>"`.
   If the user specified an author, add `author: "<author>"`.

2. **Show results**: Display the results as a numbered list showing: filename, format, author, full_path.

3. **Ask which to play** (if multiple results): Let the user pick, or if only one result, proceed.

4. **Load & Play**: Call `load_modland` with the chosen result's `full_path`:
   ```
   load_modland(full_path: "<full_path from search result>")
   ```
   This downloads (with caching), loads into DEViLBOX, and auto-plays.

5. **Verify audio**: Call `wait_for_audio(timeoutMs: 5000)` to confirm sound is playing.

6. **Report**: Tell the user what's playing, the format, and author.

## Troubleshooting

- "No browser connected" → Browser must be open at localhost:5173
- "No results found" → Try shorter/broader search terms. Use `get_modland_formats` to see available format names.
- No audio → Call `get_audio_state` to check if AudioContext is running. User may need to click in browser.

## Available Format Filters

Call `get_modland_formats` to list all formats. Common ones:
Protracker, Screamtracker 3, Fasttracker 2, Impulsetracker, Future Composer 1.4, TFMX, Oktalyzer, Soundtracker, Art Of Noise, Hippel, Sidmon
