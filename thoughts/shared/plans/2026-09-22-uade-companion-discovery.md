---
date: 2026-09-22
topic: One companion resolver for every UADE load path
tags: [uade, import, companion-files, two-file-formats]
status: final
---

# One companion resolver for every UADE load path

Research: `thoughts/shared/research/2026-09-22_uade-companion-discovery.md`.

## Problem, in the domain's terms

A two-file Amiga format is one module plus the file its player asks for by
name at init. DEViLBOX finds that file three different ways depending on
how the module arrived: a rich rule table on the MCP server, a four-pair
table in the file browser, and nothing at all for a drag-drop. The same
question — "which sibling belongs to this tune?" — has three answers, two
of them incomplete. Invariant to establish: **given a module name and the
names beside it, the set of companions is one pure function, and every
load path asks it.**

## Levels the fix could live at

- Per-path patches (add `.adsc.as` here, `smp.set` there): the current state,
  three copies drifting. No.
- **One pure resolver over NAMES (chosen).** `resolveCompanions(moduleName,
  siblingNames, options)` → ordered relative paths. Server, file browser
  and folder drop each supply their listing and fetch what it returns.
- Player-side discovery (let UADE ask, then search): the player's request
  arrives inside the WASM at init; answering it late means re-init. Not
  worth the plumbing when the name rules are known.

## Design

### A. `src/lib/import/companionResolver.ts` — pure
Inputs: module basename, sibling basenames (same directory), optional
subdirectory listings (`{ 'instr': [...], 'Instruments': [...], 'Samples':
[...] }`), optional parent-directory `Samples` listing. Output: ordered
list of relative paths, tune-specific first.

Rules, in order — each a small named function with its own test:
1. **Shared stem, role first or last.** `stem_of` with `ROLE_WORDS` (Up
   Rough's set plus every prefix the server table already knows: `jpn jpnd
   thm mfp sjs max mcr mcs midi ins dum 4v set kh nt l n sdata sci`). A
   candidate matches when its stem equals the module's AND its role word
   differs (guard 1: a companion never carries the module's own role — the
   `dns.*` decoys).
2. **Extension pairs** the server carries today (`.sng/.ins`, `.dum/.ins`,
   `.4v/.set`), expressed as role-last stems — they fall out of rule 1 once
   `ins`, `dum`, `4v`, `set` are role words. Keep the pair table only as a
   test fixture proving the old cases still resolve.
3. **Suffixed.** Any sibling whose name starts with `<module>.` — generalises
   the server's `.nt .as .l .n` list (`popelich-brutalo.adsc.as`).
4. **`<base>.sdata`**, **`.sci` → `<3>patch.003`**, **`.kh` → `songplay`**:
   kept as explicit special cases, each with its test.
5. **Subdirectories.** `instr/*.x`; `Instruments/*.{instr,ss}` for
   smus/snx/tiny; `Samples/*` for `.sng` in the dir or its parent. Relative
   paths preserved (what `companionRelativeName` protects today).
6. **Shared bank.** `smp.set` only if rules 1–5 produced nothing AND no
   other sibling's stem equals the module's (guard 2). The nobuddiesland /
   monsterbusiness pair decides this.

Bounded: at most 16 candidates; nothing over 4 MB unless it is the only
candidate (the server has no bound today — a discography directory would
be embedded).

### B. Callers
- `server/src/mcp/mcpServer.ts` `load_file`: list the directory (and the
  three subdirectories when present) → resolver → read and base64 the
  results. The 160-line rule block goes.
- `src/components/dialogs/useFileNavigation.ts` `fetchCompanionFiles`: list
  with `listManifestDirectory` / `listServerDirectory` → resolver → fetch.
  The four-pair table goes. SunTronic's parsed `instr/` paths stay as the
  format-specific override they are.
- `src/App.tsx` folder drop: resolver over the dropped names, so a folder
  of eight `.osp` tunes registers one `smp.set` and not seven songs.
  Lone-file drop: unchanged — no siblings exist. (Optional, decision D1.)

### C. Where the module lives
`server/tsconfig.json` has `rootDir: ./src` and the server runs under
`tsx` (`npm run dev`); its `tsc` build is already broken by an existing
`../../src` import. Decision D2 below.

### D. Verification, in increasing difficulty (all via MCP `load_file`, then
by folder drop for the browser path)
| song | must find | must NOT find |
|---|---|---|
| `AudioSculpture/popelich-brutalo.adsc` | `popelich-brutalo.adsc.as` | — |
| `DynamicSynthesizer/dns.starball title` | `smp.starball title` | `dns.ptc`, other `dns.*` |
| `Synth Dream/…/sdr.nobuddiesland end 2` | `smp.nobuddiesland end 2` | `smp.set` |
| `Synth Dream/…/sdr.monsterbusiness 5` | `smp.set` | other tunes' `smp.*` |
| `Synth Pack/…/Dyter-07/dyter07 title.osp` | `smp.set` | other `.osp` |
| `TFMX/- unknown/mdat.fatalheritage ship` | `smpl.fatalheritage ship` | — |
| `Hippel 7V/…/ghostbattle gameover.hip7` | nothing | — ; plays, audio on all four Paula channels |

Pass = the song plays (`get_audio_level` non-silent, `get_dub_bus_state`
`hivelyRenderStats` n/a — use `get_playback_silence`), and the companion
map handed to `loadFile` is exactly the "must find" column.

## Decisions (answered by the owner, 2026-09-22)

- D1: **yes** — prompt with the expected companion name(s).
- D2: **(a)** — `src/lib/import/companionResolver.ts`, server imports it relatively.
- D3: **only what the resolver picks.**

### As asked
- **D1 — Lone-file drop.** When one file is dropped and the resolver, run
  over its name alone, says the format wants a companion (a role word it
  knows), show a prompt naming the expected file(s) ("This is a TFMX
  module — also drop `smpl.fatalheritage ship`"). Recommended: yes, small,
  and it turns "does not work" into "needs this file".
- **D2 — Module location.** (a) `src/lib/import/companionResolver.ts`, server
  imports it relatively as `modlandIndexer` already does — works under
  `tsx`, keeps the server's `tsc` build broken as it is now. (b) a root
  `shared/` directory added to both tsconfigs — clean, touches the server
  build setup. Recommended: (a) now, with the server build noted as
  pre-existing debt; (b) if the server is ever built with `tsc` for deploy.
- **D3 — Folder-drop filtering.** Register only what the resolver returns
  (recommended), or keep registering every dropped file (today's
  behaviour, harmless but wasteful).

## Checklist
- [x] CF-1 `companionResolver.ts`: `ROLE_WORDS`, `stemOf`, rules 1–6, bounds.
- [x] CF-2 Tests, one per rule and per guard, plus the six-song fixture
      table from D as pure name lists (no disk).
- [x] CF-3 Server `load_file` uses the resolver; rule block removed.
- [x] CF-4 File browser `fetchCompanionFiles` uses the resolver over a
      directory listing; four-pair table removed.
- [x] CF-5 Folder drop uses the resolver (per D3).
- [x] CF-6 Lone-file prompt (per D1).
- [x] CF-7 Reachability: one test proving `load_file` reaches the resolver
      (call-count sentinel through the server handler).
- [x] CF-8 `npm run type-check`; import + bridge suites.
- [ ] CF-9 Live: the seven songs through MCP `load_file`, companion map
      asserted per D, audio confirmed.
- [ ] CF-10 Live: folder drop of `Synth Dream/Laurens Tummers` then both
      `sdr.*` tunes from the browser — the discriminating pair.

## Automated verification
- `npx vitest run src/lib/import src/bridge`
- `npm run type-check`

## Manual verification
- Folder-drop the Synth Dream directory; load nobuddiesland, then
  monsterbusiness; both play.

## Execution log (2026-09-22)

- CF-1..CF-8 done: `edcda70c1` resolver, `423ba7c3b` all four callers
  (disk, modland, file browser, folder drop, lone-file hint), `1568bf909`
  `get_format_state.uadeCompanionNames`, `16241118f` `.adsc` routed by its
  companion. CF-8: `npm run type-check` clean; the server's `tsc` errors are
  the pre-existing rootDir issue (D2a).
- Found while running CF-9: `.adsc` was routed to the StarTrekker AM parser
  looking only for `.nt`; an Audio Sculpture module with `.as` reached UADE
  with no companion and was refused (`ret=-1`). Fixed; after it,
  `popelich-brutalo.adsc` registers `popelich-brutalo.adsc.as` and plays
  (rms 0.003, peak 0.024 — quiet, but UADE accepted it).
- CF-9 blocked on two things outside this session: the MCP server is spawned
  by Claude Code from `server/src/mcp/index.ts` and only picks up the new
  `load_file` after a reconnect (the old table has no dns/sdr/osp pairs, so
  the discriminating pair cannot pass through it); and the browser tab
  dropped off the relay after the Audio Sculpture test.
- TFMX loads on its native `tfmx` path (not UADE) — `uadeCompanionNames`
  empty there is expected.
