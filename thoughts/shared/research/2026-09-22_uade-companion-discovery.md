---
date: 2026-09-22
topic: UADE companion-file discovery — what DEViLBOX does today
tags: [uade, import, companion-files, two-file-formats]
status: final
---

# UADE companion-file discovery — as it is

Prompted by two messages from the Up Rough session (2026-09-22): the owner
dropped seven test songs into DEViLBOX and only TFMX loaded, and only when
both files were dropped by hand. Their rules: four companion shapes, two
guards, tune-specific before shared bank, player by content over prefix.

## Three load paths, three different companion behaviours

### 1. MCP `load_file` (server reads the disk) — the RICH one
`server/src/mcp/mcpServer.ts:1375-1563`. Reads the directory with `readdir`
and applies, in order:

- prefix pairs: `mdat./smpl.`, `midi./smpl.`, `jpn./smp.`, `jpnd./smp.`,
  `thm./smp.`, `mfp./smp.`, `sjs./smp.`, `max./smp.`, `mcr./mcs.` (both ways)
- extension pairs: `.sng/.ins`, `.dum/.ins`, `.4v/.set`
- `smp.set` — ALWAYS taken when present (no "only if the tune has none of
  its own" clause; harmless for playback, since the player asks by name)
- `.kh` → `songplay`
- suffixed: exactly `.nt`, `.as`, `.l`, `.n` appended to the full name
- `<base>.sdata`
- `.sci` → `<3 chars>patch.003`
- `instr/*.x` (SunTronic), `Instruments/*.{instr,ss}` for smus/snx/tiny,
  `Samples/*` for `.sng` (in the dir and its parent)

Then `src/bridge/handlers/writeHandlers.ts:1036-1056` decodes the base64
map and hands it to `loadFile`. This is why "only TFMX loads" was not seen
through MCP: the owner's test went through drag-drop.

### 2. File browser (library / server / cloud) — the THIN one
`src/components/dialogs/useFileNavigation.ts:134-192` `fetchCompanionFiles`:
four prefix pairs only (`mdat./smpl.`, `smpl./mdat.`, `mfp./smp.`,
`midi./smpl.`), plus SunTronic's parsed `instr/` paths. It FETCHES guessed
names (`readStaticFile` from the manifest bundle, then `readServerFile`) —
it never lists the directory, although both listings exist:
`listManifestDirectory` (`src/lib/serverFS.ts:51`) and
`listServerDirectory` (`:102`).

The built-in library has NO two-file UADE format at all
(`src/generated/file-manifest.json`: no `smpl.`, `smp.`, `mdat.`, `.adsc`,
`.osp`, `smp.set` under `/public/data/songs/`), so this path has nothing to
find today.

### 3. Drag-drop — NO discovery
`src/App.tsx:826-836, 861-865`. A folder / multi-file drop puts every
other dropped `File` into `useUIStore.pendingCompanionFiles`; `handleFileDrop`
registers ALL of them, keyed by `companionRelativeName` (which preserves
subdirectories — `src/lib/import/companionRelativeName.ts`). A single
dropped file has no companions and none are looked for. The browser cannot
see siblings of a lone dropped file; it can for folder drops
(`webkitRelativePath`) and for File System Access directory handles.

## Where the companions go
`src/engine/uade/UADEEngine.ts:607-613` writes `useFormatStore.uadeCompanionFiles`
into the WASM virtual filesystem before `load()`, keyed by the relative
name. The 68k player asks for its second file by name at init
(DTP_ExtLoad); if absent it dies as if the format were broken.

## Player selection — content, not prefix
`UADEEngine.load()` sends the bytes with a `filenameHint`; the worklet
(`public/uade/UADE.worklet.js:1071`) reports `player` as detected by the
UADE core. The only prefix use is `uadeScanLists.ts` (`shouldSkipScan`,
`isShortScan`) — scan control, not player choice. Up Rough's BUG 1 (prefix
table picking TFMX-Pro over uade123's TFMX) does not apply here.

## Test material (on this machine)
`~/Desktop/mods/`: `AudioSculpture/popelich-brutalo.adsc` (+ `.adsc.as`),
`DynamicSynthesizer/dns.starball title` (+ `smp.starball title`, with
`dns.ptc` and other `dns.*` songs as decoys), `Synth Dream/Laurens Tummers/`
(`sdr.nobuddiesland end 2` + `smp.nobuddiesland end 2`;
`sdr.monsterbusiness 5` + shared `smp.set`), `Synth Pack/Karsten
Obarski/Dyter-07/*.osp` + `smp.set`, `TFMX/- unknown/mdat.*` + `smpl.*`,
`Hippel 7V/Jochen Hippel/*.hip7` (no companion).

## Reference rules (Up Rough, Python)
`/Users/spot/Code/Up_Rough_Demo_System/tools/uade_stage.py`: `ROLE_WORDS`
(`mdat smpl tfmx tfx sng ins instr smp samples sdata song snd dns sdr osp
adsc`), `stem_of` (role-first → tail, role-last → head), `find_companions`.
Guards: a companion must not carry the module's own role; a shared bank
only when its stem belongs to no other tune; tune-specific first.

## Open questions (for the plan)
- Where a resolver shared by server and browser can live: `server/tsconfig`
  has `rootDir: ./src`; `server/src/services/modlandIndexer.ts` already
  imports `../../src/lib/import/FormatRegistry.ts` and `tsc` rejects it
  (TS6059), so the server is run with `tsx`, not built.
- Whether a lone-file drop should prompt for the expected companion names.
