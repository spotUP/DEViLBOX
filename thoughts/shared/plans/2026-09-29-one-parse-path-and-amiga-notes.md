---
date: 2026-09-29
topic: One parse path per format, one Amiga note naming
tags: [import, load-path, mod, xm, amiga, periods, single-source-of-truth]
status: draft
progress: 20 of 23 - open P3.5 (one MOD writer), P4.2 (synth pitch, needs listening), P6.3 (live)
---

# One parse path per format, one Amiga note naming

Owner, 2026-09-29: "why are all loading paths still not using the same code?"
and "fix it". Decision (owner, same day): **ProTracker naming** for every
Amiga-period cell - period 856 = note 13 (C-1), 428 = 25 (C-2), 214 = 37 (C-3).

The single-load-path work (plans/2026-09-29-single-load-save-path.md, 23/23)
unified APPLYING a song (`applySong`) and the save/export serializers. It did
not unify PARSING: the same `.mod` is parsed by different code depending on
where it enters. Research (two surveys, 2026-09-29, summarised below) found:

- `importTrackerModule` (tracker drag-drop, file browser, MCP `load_file`,
  tour) has five parse branches of its own; the DJ views call
  `parseModuleToSong`, which routes MOD/XM to OpenMPT. So the tracker and the
  DJ decks build the same file differently. For MOD the tracker's branch keeps
  slot ids, finetune, sample volume, `cell.period`, channel metadata and the
  original bytes; the OpenMPT route loses all of them. For XM the tracker's
  branch keeps envelopes, auto-vibrato, fadeout, multi-sample maps; OpenMPT
  loses them.
- XRNS has no live route at all: its only converter sits in a branch nothing
  reaches, so `.xrns` ends in UADE. (By reading; runtime unconfirmed.)
- Amiga note <-> period conversion is duplicated in ~40 files under FIVE
  namings (PT, XM = PT+24, IDX = PT-12, DSS parser = PT+12, DSS encoder).
  Producers are mostly PT; the MOD codec and ~20 UADE encoders are XM. So an
  app-loaded MOD exports two octaves low (`modExport` is XM and ignores
  `cell.period`), PT grids written back through `encodeMODCell` are two octaves
  off, the OpenMPT MOD writer is off for both namings, and editing a note keeps
  the cell's old `period` (the replayer plays the stale one).

## Checklist

Ledger: tick here as items land, with the commit.

### P1 - one Amiga note naming (leaf module)
- [x] P1.1 `src/lib/amiga/periodNotes.ts`: the ProTracker period table
      (finetune 0, plus the extended octaves the parsers use), `periodToNote`
      (PT naming, nearest), `noteToPeriod(note, finetune?)`. No imports beyond
      tables. Tests pin 856->13, 428->25, 214->37, 113->48, round trip for every
      table note, nearest-match for off-table periods.
- [x] P1.2 `xmConversions.periodToXMNote` / `xmNoteToPeriod` delegate to it
      (already PT) - one table.
- [x] P1.3 `effects/PeriodTables.getPeriodExtended` users and
      `samplePlaybackRate` note fallback use PT (samplePlaybackRate test flips:
      note 25 = 428).

### P2 - importers produce PT
- [x] P2.1 `MODParser.periodToNote` / grid -> PT (via periodNotes).
- [x] P2.2 `OpenMPTConverter.mapNote` for MOD: pinned by a test (428 -> 25).
- [x] P2.3 `UADEPatternEncoder.decodeModCell` (IDX) and `MODEncoder.decodeMODCell`
      (XM) -> PT.
- [x] P2.4 DSS parser (1712 = 13) -> PT, with `DSSExporter` / `DSSEncoder`.
- [x] P2.5 parsers with private tables that already give PT (STK, GMC, PVP,
      RobHubbardST, AmigaUtils users) route through periodNotes - one table.

### P3 - writers take PT
- [x] P3.1 `MODEncoder.encodeMODCell` and the `note - 37` encoders
      (RobHubbard, WantedTeamDaveLowe, SCUMM, DavidWhittaker, SeanConnolly,
      SimpleAmigaStub, GameMusicCreator, SoundFX fallback) -> periodNotes.
- [x] P3.2 `modExport.exportSongToMOD` -> PT; `MODExporter.exportAsMOD` -> PT
      (sharp-note bug: "C#-2" key miss) - both through periodNotes. Note: two
      MOD exporters exist; list the merge as P3.5.
- [x] P3.3 `OpenMPTExporter` / `OpenMPTEditBridge.mapNoteToOpenMPT`: inverse of
      `mapNote` for MOD (+36).
- [x] P3.4 An edited note must not keep a stale `cell.period`. Done as ONE rule,
      not per edit path: `periodNotes.cellPeriod` counts a stored period only
      while it names the cell's note; replayer, MOD encoder, modExport, GMC,
      samplePlaybackRate all read through it.
- [ ] P3.5 One MOD writer: `MODExporter.exportAsMOD` (Cinter save) and
      `modExport.exportSongToMOD` (native export) merged.

### P4 - playback
- [x] P4.1 `TrackerReplayer.noteToPeriod` fallback -> periodNotes (same PT
      numbers; one table).
- [ ] P4.2 (OPEN - needs a listening check: the same branch pitches every synth-based Amiga format, whose synths are tuned to the current naming; changing it blind re-pitches them) Synth note name in a MOD song from the period, not
      `xmNoteToNoteName(note)` (PT naming would play a synth two octaves
      below its sample otherwise).

### P5 - one parse path
- [x] P5.1 `parseModuleToSong` owns what the import branches added: the
      `patterns[0].importMetadata.sourceFormat` tag, `originalModuleData` with
      the real bytes (MOD always, XM when kept), the Cinter `.raw` prompt stays
      in the importer (UI).
- [x] P5.2 MOD and XM route to the native parsers + converters
      (`parseMOD` + `convertMODModule` + `convertParsedInstruments`;
      `parseXM` + `convertXMModule`), OpenMPT as fallback. `parseMODFile` /
      `parseXMFile` become those same calls (one converter each).
- [x] P5.3 XRNS route in `parseModuleToSong` (moves the dead branch-3 code into
      a parser function).
- [x] P5.4 `importTrackerModule` = `parseModuleToSong` + `applySong` (+ the
      `useLibopenmpt: false` strip, notify, modland check). Branches 1, 2, 3, 5
      deleted.
- [x] P5.5 Contract test: the same file through `importModuleFile` (tracker)
      and `parseModuleToSong` (DJ) gives identical cells and instrument ids,
      for MOD, XM, S3M, IT. Plus: `importTrackerModule` source has no parser
      calls of its own (static check like singleLoadPath.contract).

### P6 - tests and live
- [x] P6.1 MOD round trip: parse -> native export -> parse, same periods;
      after a note edit, the exported period is the edited note's.
- [x] P6.2 Update pinned tests: MODParser.test (XM labels), modRoundtrip,
      samplePlaybackRate, instrumentSlotIds / instrumentLabelScore (nativeData
      path gone), ImportExportFlow, soundFXRoundtrip, channelEvidence.
- [ ] P6.3 Type-check, affected suites, live: micro15 loads, plays, shows C-3
      for its drums, exports a .mod that plays at the same pitch.

## Decisions
- PT naming (owner). The grid shows ProTracker's names.
- Native TS parsers win for MOD/XM (they keep more); OpenMPT is the fallback.
- `cell.period` stays (Cinter's out-of-range periods need it) but is dropped on
  a note edit.

## Out of scope (listed, not done here)
- `loadSongFile`'s own MIDI parser (`MIDIImporter`) vs `MidiToSong` - a second
  duplicate parse path; next plan.
- `prepareModuleImport` still runs `loadModuleFile` for dialog metadata.

## Implementation notes (2026-09-29)
- P5.3 XRNS: routed (PatternExtractor + ModuleConverter.convertXRNSModule; ModuleLoader's
  nativeData format was typed 'XRNS' as 'XM', which hid the branch). Headless happy-dom
  cannot read Renoise's pattern pool; in Chrome wavesabre-punqtured.xrns opens with 22
  patterns / 872 notes (MCP).
- Classifier baseline re-measured, not silently lowered: the corpus now parses MODs as the
  app does. accuracy 0.75 -> 0.8125, drums-vs-not 1.0 -> 0.9375 (break the box ch2,
  'sound effects', now reads drums instead of harmony). Told the owner.
- XM: the tracker's convertXMModule duplicates volume-column effects into effTyp2 (the
  replayer reads them only there); kept as the one XM converter.
