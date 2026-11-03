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

| Key | Name | Family | Corpus songs | Sample files | Needs | Diff |
|-----|------|--------|--------------|--------------|-------|------|
| amiga_formats_catchall | Amiga Format | amiga-native | 8 | audiosculpture_smallest.adsc|blazing_thunder.hd |SPD | S-M |
| amiga_formats_catchall | Amiga Format | amiga-native | 8 | audiosculpture_smallest.adsc, blazing_thunder.hd | SPD | S-M |
| med | OctaMED | amiga-native | 5 | bounty hunter - outro (remixed).mmd3, captain planet and the planeteers - title.mmdc | SPD | S-M |
| uade_ems | EMS | uade-only | 3 | ballade.song.ems, je taime.ems | SPD | S-M |
| uade_tw | TW | uade-only | 2 | blinkys scary school-sfx.tw, future basketball main.tw | CMD | L |
| uade_sdr | SynthDream | uade-only | 2 | sdr.monsterbusiness_5, sdr.nobuddiesland_jigsaw | CMD | L |
| uade_riff | RiffRaff | uade-only | 2 | riffraff_smallest.riff, sidewinder2.riff | CMD | L |
| uade_bss | Beathoeven Synthesizer | uade-only | 2 | beathoven_smallest.bss, tristar_cracktro.bss | CMD | L |
| uade_ah | Ashley Hogg | uade-only | 2 | SUNTronicTunes/instr/ah, SUNTronicTunes/instr/ah.x | CMD | L |
| uade_tf | Tim Follin | uade-only | 1 | follin_smallest.tf | CMD | L |
| uade_spl | Sound Programming Language | uade-only | 1 | boulderdash.spl | CMD | L |
| uade_pn | Pokeynoise | uade-only | 1 | pn.tetris | CMD | L |
| uade_nt | NoiseTracker | uade-only | 1 | shortsong1.mod.nt | SPD | S |
| uade_mcmd | MCMD | uade-only | 1 | ep-trmonsterbusiness.mcmd | CMD | L |
| uade_dns | Dynamic Synthesizer | uade-only | 1 | dns.ptc | CMD | L |
| uade_dh | David Hanney | uade-only | 1 | tearaway_thomas.dh | SPD (done) | S (done) |
| uade_cus | Custom | uade-only | 1 | skyfox2.cus | CMD | L |
| uade_ast | ActionAmics prefix | uade-only | 1 | dynablaster.ast | CMD | L |
| uade_arp | ARP | uade-only | 1 | pseudofever.arp | CMD | L |
| organya | Organya | chip-dump | 1 | cave_story_-_42_-_xxxx.org | SPD | M |
| okt | Oktalyzer | amiga-native | 1 | 45.okta | SPD | S-M |
| inStereoAmbiguous | InStereo! | amiga-native | 1 | fantasi8.is | SPD | M |
| digi | DigiBooster | amiga-native | 1 | the_day_after.digi | SPD | M |

Next to take: uade_ems (3 songs, nuade `ems` decoder exists), then uade_nt (NoiseTracker variant, plain MOD cells),
then the adsc/hd rows inside amiga_formats_catchall (nuade `audiosculpture` decoder).
