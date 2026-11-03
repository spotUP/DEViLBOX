---
date: 2026-11-03
topic: Formats with no editable grid (oscilloscope-only), by difficulty
status: census; first row (David Hanney) done in the commit named in thoughts/spot/todos.md
---

# Editability census, 2026-11-03

Counted from: `FORMAT_REGISTRY` in `src/lib/import/formatRegistryData.ts` (281 entries; 87 have no `nativeParser`),
joined to the corpus `public/data/songs/formats` (682 files) by each entry's extensions/prefixes. Scope-only means
`gridOpensInScopeView(song)` (`gridEstimated` or `gridUnmatchedReason` set), reached through the UADE catch-all in
`UADEPrefixParsers.ts` and the scan fallbacks in `UADEParser.ts`. Not a name grep. 87 entries have no parser; the 22
rows below are those with at least one corpus song (the other 66 have none, so nothing to test against). The
registry-less `amiga_formats_catchall` row is a bucket of 8 files of several formats (adsc, hd, ...).

Needs: SPD = stored-pattern decoder (cells sit in the file), SCAN = scan-grid, CMD = command-stream recipe
(docs/FORMAT_COMMAND_STREAM_GRID.md). Difficulty: S = a nuade `tracker_info` decoder exists in
`third-party/nuade/players/<name>/` that documents the layout; M = layout known but packed or indirect; L = compiled
replayer, no stored cells. Difficulty is an estimate except for David Hanney (done); verify the layout before starting a row.

| Key | Name | Family | Corpus songs | Sample files | Needs | Diff | Verified by content |
|-----|------|--------|--------------|--------------|-------|------|---------------------|
| amiga_formats_catchall (hd) | Amiga Format | amiga-native | 1 of 8 | blazing_thunder.hd | CMD | S-M | song: AmigaDOS hunk (000003f3) + `70ff4e75 H.DAVIES` stub, 92244 B; howiedavies/hd_module.c documents per-voice position lists + command-byte patterns (hd_voice_list, hd_pattern, hd_handler), so compiled command stream, not cells |
| amiga_formats_catchall (adsc) | Amiga Format | amiga-native | 1 of 8 | audiosculpture_smallest.adsc | n/a | n/a | BANK: header `ST1.2 ModuleINFO`, 4104 B, no cells; closed |
| med | OctaMED | amiga-native | 5 | bounty hunter - outro (remixed).mmd3, captain planet and the planeteers - title.mmdc | SPD | S | song x2: `MMD3` modlen 0x1d124 = file size 119076; `MMDC` modlen 0xbbd8 = size 48088; stored blocks. Refs: nuade mmdc/, medley/, MEDParser.ts, MMDCParser.ts (other 3 files not opened) **DONE for MMD0-MMD3 (grid + byte-exact export); OPEN: live playback of MMD3 edits and the whole MMDC format.** MMD0/1/2/3 now carry a uadePatternLayout whose encodeCell keeps stored bytes for untouched fields, and MEDExporter.patchMedModule patches the original module (routed by layout id med_mmd0/med_mmd1); test medEditable.test.ts (mmd3 + mmd0). MMD3 plays through libopenmpt, which has no live cell write, so an MMD3 edit reaches export only. MMDC is NOT stored blocks: each block is a 2-byte header (tracks, lines-1) then a run-length stream (header <0x80 = literal count, else zero run ~header) over 3-byte MMD0 cells (nuade mmdc_module.c); MMDCParser's layout (MOD offset 1084) is fake. Needs an RLE block decoder, a repacker that relocates block/sample offsets and modlen, and a cell-write path (nuade has no write API; UADE chip-RAM diff needs same size) |
| uade_ems | EMS | uade-only | 3 | ballade.song.ems, je taime.ems | SPD (done c68678902) | S-M | settled |
| uade_tw | TW | uade-only | 2 | blinkys scary school-sfx.tw, future basketball main.tw | CMD | L | song (header only): `6000` bra into code, "Music by Sound Images" text; compiled player. blinkys is an -sfx tune, may hold little music. No nuade dir |
| uade_sdr | SynthDream | uade-only | 2 | sdr.monsterbusiness_5, sdr.nobuddiesland_jigsaw | CMD | M | song (header only): offset-table header, 2014 B / 5102 B; nuade synthdream/ (sdr_module.c) exists |
| uade_riff | RiffRaff | uade-only | 2 | riffraff_smallest.riff, sidewinder2.riff | CMD | M | song: hunk + `70ff4e75 RIFFRAFF`, both 20976 B; nuade riffraff/rr_module.c exists |
| uade_bss | Beathoeven Synthesizer | uade-only | 2 | beathoven_smallest.bss, tristar_cracktro.bss | CMD | M | song: hunk + `BEATHOVEN100/109`; nuade beathoven/ (beathoven_songs.c) exists |
| uade_ah | Ashley Hogg | uade-only | 2 | SUNTronicTunes/instr/ah, SUNTronicTunes/instr/ah.x | n/a | n/a | COMPANION x2: both sit in `instr/` (SAMPLE_DIR_NAMES in companionResolver.ts), 5008/5624 B raw sample/instrument bytes, no header; closed. Needs a real .ah song to test (none in corpus) |
| uade_tf | Tim Follin | uade-only | 1 | follin_smallest.tf | CMD | M | song: `601a` hunk-less exe header, 25010 B; nuade timfollin/ (tfol_layout.h) exists |
| uade_spl | Sound Programming Language | uade-only | 1 | boulderdash.spl | CMD | M | song: hunk + `!SOPROL!`, 71584 B; nuade spl/spl_module.c exists |
| uade_pn | Pokeynoise | uade-only | 1 | pn.tetris | CMD | M | song (header only): 3696 B Atari POKEY data (`ffff` binary load); nuade pokeynoise/pn_info.c exists |
| uade_nt | NoiseTracker | uade-only | 0 (n/a) | shortsong1.mod.nt | n/a | n/a | COMPANION: Startrekker AM (ST1.2 ModuleINFO, 264 B, no cells); song is shortsong1.mod |
| uade_mcmd | MCMD | uade-only | 1 | ep-trmonsterbusiness.mcmd | CMD | M | song: `MCMD` magic, 9102 B, command words; nuade mcmd/mcmd.c exists | DONE 2026-11-03: MCMDParser.ts grid = first subsong, one pattern per track row, 4 voices, 2-byte pattern-pool rows (note, info); export = generic layout patch (formatId `mcmd`). Note shown = index+1 (bijection 2..95); portamento/alt-fseq flags, param bytes, no-instrument bit kept from stored bytes. Shared pool patterns: an edit hits every use. Test `mcmdEditable.test.ts`; audio still UADE (no nuade engine wiring) |
| uade_dns | Dynamic Synthesizer | uade-only | 1 | dns.ptc | CMD | M | song: `6000` bra table + "PTC music by Chris Huelsbeck", 14096 B; nuade dynamicsynthesizer/dns_module.c exists |
| uade_dh | David Hanney | uade-only | 1 | tearaway_thomas.dh | SPD (done) | S (done) | settled |
| uade_cus | Custom | uade-only | 1 | skyfox2.cus | CMD | L | song: hunk + `DELIRIUM`, 22272 B; compiled per-tune player, no nuade dir |
| uade_ast | ActionAmics prefix | uade-only | 1 | dynablaster.ast | CMD | M | song (header only): offset-table header, 140880 B; nuade actionamics/ exists |
| uade_arp | ARP | uade-only | 1 | pseudofever.arp | CMD | L | song (header only): `ARP.` magic + offset table, 39488 B; no nuade dir |
| organya | Organya | chip-dump | 1 | cave_story_-_42_-_xxxx.org | SPD | S | song but EMPTY: `Org-02` header 18 B + 16 tracks x 6 B = 114 B = whole file, every note count 0; layout trivial/known, but no cells to test. Needs a real .org |
| okt | Oktalyzer | amiga-native | 1 | 45.okta | ED | S | song: `OKTASONG`, chunk walk CMOD,SAMP,SPEE,SLEN,PLEN,PATT,11x PBOD,15x SBOD ends exactly at 135162 B; stored 4-byte cells. Refs: nuade oktalyzer/, OktalyzerParser.ts | **2026-11-03: already opened with a grid (OktalyzerParser), not scope-only. Real gaps fixed: lossy encoder (note-36 vs decoder +12, unmapped effects dropped), resynth export (176490 B vs 135162), live edit sent grid terms to WASM, `okt.` prefix not routed natively. Test: oktalyzerEditable.test.ts.**
| inStereoAmbiguous | InStereo! | amiga-native | 1 | fantasi8.is | SPD | M | song (header): `ISM!V1.2` + "Sound Invasion Music System V1.2", 45656 B; refs nuade instereo1/, InStereo1Parser.ts; cells not walked |
| digi | DigiBooster | amiga-native | 1 | the_day_after.digi | DONE | M | EDITABLE (2026-11-03): DigiBooster1Layout.ts + DigiBoosterParser.parseOriginalDigiBooster give a uadePatternLayout (formatId `digiBooster1`); native export patches the original, repacks only an edited pattern (size field rewritten); test digiEditable.test.ts |

Next to take (verified song + stored cells + layout reference), ranked:
1. okt (45.okta): chunk walk proven, 4-byte cells, nuade oktalyzer/ + OktalyzerParser.ts.
2. med (.mmd3, .mmdc): stored blocks, MEDParser/MMDCParser + nuade mmdc/medley.
3. inStereoAmbiguous (fantasi8.is): song, cells; InStereo1Parser.ts + nuade instereo1/; walk cells first.
4. digi (the_day_after.digi): song with cells, but a V1.7 layout no parser here covers; OpenMPT only.
5. organya: layout trivial but the only sample has zero notes; get a real .org first.
6. CMD rows with a nuade layout (hd, riff, bss, spl, tf, mcmd, dns, sdr, pn, ast) via docs/FORMAT_COMMAND_STREAM_GRID.md; hd first (hd_voice_list/hd_pattern documented).
Closed n/a: uade_nt, adsc, uade_ah (companions/banks). Settled: uade_ems, uade_dh. Rows marked "header only" were not walked end to end.
