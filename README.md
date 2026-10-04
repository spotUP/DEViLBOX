# DEViLBOX

A browser tracker and performance desk for chip and Amiga music: it loads
~200 module formats (ProTracker, FastTracker, Hively, Furnace, TFMX, the
Hippel formats, SunTronic, Sonix, the UADE catalogue and many more), shows
them as an editable pattern grid, plays them through native WASM ports of
the original replayers, and hangs a dub mixing desk, DJ decks and a live
performance layer on the output.

Live build: https://devilbox.uprough.net

## Status

Work in progress, used live. Many formats play natively and round-trip
byte for byte; some show an approximate grid from a register scan; a few
load silent. `thoughts/shared/plans/2026-10-02-format-breakage-todos.md`
is the honest list.

## Run it

```bash
scripts/setup.sh        # Node 20, npm install, reports optional toolchains
npm run dev             # Vite on http://localhost:5174
npm run dev:fullstack   # + Express :3011 and the MCP relay :4003 (agent tooling)
npm run type-check      # tsc -b --force, must pass before a commit
npm run test:ci         # the suite the pre-push gate runs
npm run build
```

The compiled `.wasm` engines under `public/` are committed; you need
Emscripten, CMake or Rust only to rebuild one you change. `docs/BUILDING.md`
has the details, `CLAUDE.md` the house rules every contributor (human or
agent) follows.

## Repository map

| Path | What |
|------|------|
| `src/` | the app: engines (`src/engine`), importers and codecs (`src/lib/import`), stores, components |
| `public/` | compiled WASM engines, worklets, the song corpus (`public/data/songs`) |
| `*-wasm/`, `uade-wasm/`, `tfmx-wasm/` | sources of the native engine ports |
| `third-party/` | vendored upstreams the ports are built from (see `THIRD_PARTY_NOTICES.md`) |
| `server/` | Express API and the MCP relay used for automated testing |
| `docs/` | implementation references |
| `thoughts/shared/` | research, plans and session handoffs - the long-form record |

## Licence

GPL-3.0-or-later, see `LICENSE`. Every vendored component is listed with
its licence in `THIRD_PARTY_NOTICES.md`; the few original player sources we
study but may not redistribute are kept out of the tree
(`third-party/PRIVATE_SOURCES.md`).

The song corpus under `public/data/songs` is scene material collected for
testing the importers. If you hold the rights to a tune there and want it
gone, open an issue and it goes.
