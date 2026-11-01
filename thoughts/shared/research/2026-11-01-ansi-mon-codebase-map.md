# ANSI music importer: codebase map (paths relative to /Users/spot/Code/DEViLBOX)

1. Registration (template: MDX, chip-dump family, extension match, nativeOnly)
- Registry entry: src/lib/import/formatRegistryData.ts:1841-1851 (key 'mdx', family 'chip-dump', matchMode 'extension', extRegex, nativeOnly, nativeParser {module, parseFn}).
- Name match: FormatRegistry.ts:40-60 detectFormat (pass 1 declared ext/prefix; pass 2 head-as-ext).
- Content sniff: FormatRegistry.ts detectFormatFromContent (~line 86+, switch(ext) at ~102, e.g. case 'sng' uses isGoatTrackerSong). Add `case 'ans'` there if sniffing needed. MDX has isMDXFormat at MDXParser.ts:639.
- Dispatch: parseModuleToSong.ts (detects fmt, ~l.86-100) -> parsers/AmigaFormatParsers.ts:592 calls tryChipDumpParse -> parsers/ChipDumpParsers.ts:19; MDX branch at ChipDumpParsers.ts:86-89 (`/\.mdx$/.test(filename)` then dynamic import + parseMDXFile(buffer)). ModuleLoader.ts:88 loadModuleFile only wraps this (it does not call parsers itself). Add a branch in ChipDumpParsers.ts. prepareModuleImport.ts:34-43 treats family 'chip-dump' as native, no UADE.
- Simplest template: MDXParser.ts (or GameMusicParser for subsong arg).

2. Return type / subsongs
- TrackerSong: src/engine/TrackerReplayer.ts:234 (name, format, patterns, instruments, songPositions, songLength, restartPosition, numChannels, initialSpeed, initialBPM, optional file-data field). Example build: MDXParser.ts:753-767. TrackerFormat string union must get a new member. Cell factory: MDXParser.ts:22 (note, instrument, volume, effTyp, eff, effTyp2, eff2).
- Subsongs, two models:
  a) in-parser index: tryChipDumpParse(buffer, filename, originalFileName, subsong=0) (ChipDumpParsers.ts:19-23); parseGameMusicFile(buffer, originalFileName, subsong) is the example (ChipDumpParsers.ts:32,40). Simplest fit for "one subsong per music block".
  b) FileSubsongFormat registry: src/lib/import/fileSubsongs.ts:24 (interface), FORMATS table :44+, chooseFileSubsong :149, FileSubsongs {count,current,fileName} :17, fileSubsongsField :168. Used by davidWhittaker, hippel, musicAssembler (AmigaFormatParsers.ts:826, 1707, 2256). Needs a fileDataField on the format store and count()/audible(). It is the picker + subsong selector path (subsongSwitch source 'file').
  Recommend (a) plus fileSubsongs entry if the picker UI is wanted; fileSubsongs.ts header explains the model.

3. FurnacePCSPKR instrument
- synthType 'FurnacePCSPKR' declared types/instrument/base.ts:105. Preset: src/constants/furnaceChipPresets.ts:286-294 ({name:'PC Speaker Beeper', type:'synth', synthType:'FurnacePCSPKR', volume:-10, pan:0, effects:[], furnace:{chipType: FurnaceChipType.PCSPKR}}) - reuse it (find by synthType) rather than hand-building.
- Parser example creating a Furnace chip instrument: MDXParser.ts:719-723 and :440-441 (`furnace: {...DEFAULT_FURNACE, chipType, ops}`; DEFAULT_FURNACE at types/instrument/defaults.ts:1408; imports MDXParser.ts:15-17). Furnace-file instruments mapped in FurnaceSongParser.ts:107 (chip -> synthType table).

4. Tempo + note-off in cells
- Tempo: MDXParser.ts:542-559: channel 0 cell, `effTyp = 0x0F; eff = bpm (<=255)` only if effTyp===0 (Fxx; <0x20 is speed, >=0x20 BPM in this engine; check 0x20+ clamp). Also rowTempo.ts:8 tempoForRowMs(rowMs) -> {speed,bpm}, bpmForRowMs :16 (reuse for ms-per-row conversion).
- Note-off: literal `cell.note = 97` (MDXParser.ts:535). Named constant exists: src/lib/voice/writeToPattern.ts:22 `export const NOTE_OFF = 97` (RTMParser.ts:72 XM_NOTE_OFF=97). FurnaceExporter.ts:31 uses 180 for Furnace-side only.

5. MDXParser summary
- Per channel, a command-stream decoder produces timeline events {type note|tempo|..., tick, duration, note, voice, volume} plus loopTick (parseChannel).
- Fixed grid: TICKS_PER_BEAT 48, ROWS_PER_BEAT 4 -> TICKS_PER_ROW 12 (l.459-462); MAX_PATTERN_ROWS 64, MAX_PATTERNS 256 (l.463-464).
- eventsToPatterns (l.466+): row = floor(tick/12), pattern = floor(row/64); note placed at its row; rests = empty rows (no event).
- Note-off: at row floor((tick+duration)/12) if that row is after the note's row, inside the pattern and empty -> note 97 (l.529-539). Notes ending on the same row as the start get none.
- Tempo events -> Fxx on channel 0 (l.542-559); initial BPM from first tempo; songPositions = 0..n-1; loop tick -> restartPosition (l.739-747).
- docs/FORMAT_COMMAND_STREAM_GRID.md headings: 1 Recognise the format class (l.17); 2 Three-layer separation (l.47); 3 Decode command stream (carriers) (l.80); 4 Build display grid, shared TICK timeline (l.117); 5 Legibility of sustained voices: note-off markers (l.151); 6 Regression tests (l.178); 7 Proof discipline (l.198); 8 Applying to next format (l.216). Read 4 and 5 for tick resolution. ANSI music (ms-based Ln/Tn/On) will need a tick size derived from the finest note length (e.g. 64th at L64), not MDX's fixed 12.

6. Tests
- Dir src/lib/import/__tests__/. Template: tfmMusicMakerParser.test.ts (real fixture public/data/songs/tfm-music-maker/rainstorm.tfe -> tryChipDumpParse(buffer,name,name) + detectFormatFromContent(...).nativeParser.module assertion). Full entry point: src/lib/file/__tests__/oneParsePath.contract.test.ts (importTrackerModule with mocks for ToneEngine/notify, fixtures read via readFileSync under ROOT). loadModuleFile ModuleLoader.ts:88 is the File-based top-level. No MDX test exists. Detection tests: FormatRegistry.detection.test.ts, detectFormatFromContent.test.ts.

7. .ans / ansi
- No '.ans' extension anywhere in formatRegistryData.ts, ModuleLoader.ts, FormatCapabilities.ts. No ANSI-music code in src/lib/import.
- CAUTION: '.asc' IS taken: formatRegistryData.ts:1999 (extRegex line, ZX AY family pt3|...|asc|...) and FormatCapabilities.ts:130,179. Use .ans only (or content-sniff) to avoid the collision.
- 'ansi' matches in src/components/dialogs (KeyBindingEditor, ImportModuleDialog etc.) are unrelated words (likely 'ansi' in other strings); not verified file by file. Untracked research doc: thoughts/shared/research/2026-11-01-ansi-music.md.
- Dialog accept list: ImportModuleDialog.tsx - not checked whether it derives from getFormatExtensions (ModuleLoader.ts:513 delegates to FormatRegistry); verify the .ans extension surfaces in the file picker.
