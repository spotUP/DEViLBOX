# N14 survey: lock synth types to the project's format

Read-only survey, about 20 tool calls. Paths relative to src/. Line numbers are from grep and may be off by a few.

## 1. How the app knows the song is format-specific

There is no single field. startNewSong (lib/song/startNewSong.ts:38-52, startFormatSong) loads the template through openSong like a dropped file, so the project becomes "format X" only as a side effect: a per-engine blob in useFormatStore (hivelyFileData, hippelFileData, uadeEditableFileData, and about 35 others, enumerated in lib/formatCompatibility.ts:250-275), plus editorMode (stores/useFormatStore.ts:70, 537, 677; set to 'furnace' / 'hively' near 1293-1302) and songFormat (useFormatStore.ts:245, the parser's TrackerSong.format string, "recorded once at apply time"). The registry formatId (EditableFormatRegistry.ts:59-61) is NOT stored anywhere after the template loads. The closest existing "which format" function is getActiveFormatLimits() (lib/formatCompatibility.ts:250), which returns a coarse FormatConstraints (name, chipType) and returns null for Furnace, Klystrack, EaglePlayer, nuade and while checks are suppressed (_suppressDepth). It is not usable as the gate source as is. Recommended single source of truth: add one field, activeFormatId (the EditableFormatRegistry formatId), set when openSong finishes a template or file load whose format has a descriptor, cleared in the new-generic-song / reset path (useFormatStore.ts ~1654 resets originalModuleData) and in startGenericSong. Must be set for ordinary file opens too, not only New Song, otherwise the lock applies only to fresh projects (decision for the owner).

## 2. Every path that creates or changes a synth type

Store chokepoints (gate here = covers everything below):
- createInstrument, stores/useInstrumentStore.ts:1134 (already runs a format check: getActiveFormatLimits at 1135, instrument count only).
- addInstrument, :1158 (comment at 1159 says synth compat is "deferred to export-time validation").
- updateInstrument, :389 (synthTypeChanging detected at :416, preset load at :417, applySynthTypeDefaults at :540). Line 138 comment: "Called from ALL store entry points that can change synthType".
- cloneInstrument, :175 (copies an existing type, so safe if existing ones are valid).
- Other store entry points exist (grep synthType in the store, e.g. a convert-type function near :203 with targetSynthType). Check them when implementing.

UI callers (all go through the store methods above):
- Add dialog: components/instruments/AddInstrumentDialog.tsx:72,77,133.
- Synth type grid: components/instruments/SynthTypeSelector.tsx:28 (ALL_SYNTH_TYPES filter), :42 handleTypeChange, :91 grid. Also components/instruments/shared/CategorizedSynthSelector.tsx and shared/EditorHeader.tsx.
- Catalogue: constants/synthCategories/{categories,helpers,index}.ts (SYNTH_CATEGORIES, ALL_SYNTH_TYPES at helpers.ts:11, SYNTH_INFO).
- Preset browser: components/instruments/presets/LoadPresetModal.tsx:211,213,223,225,527,529. Furnace presets: FurnacePresetBrowser.tsx.
- Instrument list: components/instruments/InstrumentList.tsx:96-104 (createInstrument), special cases for GTUltraSynth/UADESynth/SF2Synth at 245-260.
- Edit modal save-as-new: components/instruments/EditInstrumentModal.tsx:187-189.
- Sample paths: SamplePackBrowser.tsx, SampleEditor.tsx, dialogs/ImportAudioDialog.tsx, components/tracker/CellContextMenu.tsx, components/midi/TD3PatternDialog.tsx, AUPluginPicker.tsx, KontaktInstrumentBrowser.tsx, SuperColliderEditor.tsx, hooks/drumpad/usePadContextMenu.ts, lib/drumpad/defaultKitLoader.ts, midi/performance/previewGenerator.ts, constants/wamPlugins.ts.
- File import (.xi, .sf2, modules): lib/file/UnifiedFileLoader.ts, hooks/tracker/useModuleImport.ts (these legitimately replace the whole song; they must run with the lock released).
- Voice-to-notes / generators: lib/voice/writeToPattern.ts, lib/song/songBranches.ts, hooks/dialogs/useExportDialog.ts, App.tsx.
- MCP: bridge/handlers/writeHandlers.ts createInstrument :1302-1307 (calls the store), cloneInstrument :1323; update_instrument handler in the same file (calls updateInstrument).

## 3. Existing restriction mechanisms

None for synth types. grep for allowedSynths / compatibleSynths / instrumentKind / allowedSynthTypes in src finds nothing relevant. What exists:
- FormatConstraints (lib/formatCompatibility.ts:17-33): counts, sample size, chipType. No kind list.
- getFormatCapabilities (lib/formats/FormatCapabilities, consulted first via the registry per EditableFormatRegistry.ts:20) covers editing capabilities, not synth kinds.
- EditableSynthRef (EditableFormatRegistry.ts:52-57): the format's SynthRegistry voice (synthType + controls component) for formats backed by a synth, e.g. Sonix. This is the one existing per-format "which synth type" declaration; it names only the synth kind, not the sample kind.
- Export-time validation only: the "deferred to export-time validation" comment at useInstrumentStore.ts:1159.
- Furnace / klystrack / hively editors have their own limits and chip pickers; no shared gate.

## 4. Does the descriptor declare instrument kinds?

No. EditableFormatDescriptor (EditableFormatRegistry.ts:59-85) has formatId, label, patternCodec, exporter, synth?, fixtures, newSong. Only synth? hints at a kind, for some formats (builtins at EditableFormatRegistry.builtins.ts:16+ mostly have no synth field). Owner constraint: many formats hold BOTH synth and sample instruments (Furnace chips with PCM channels, SoundMon / Future Composer synth + sample, Hippel), so the gate must be a SET of allowed kinds, never one kind. Proposed descriptor field: `instruments?: { allowed: ReadonlySet or string[] of synthType }` (or a kind-set that expands to synthTypes: 'sampler', 'chip:<id>', 'sid', ...). Derive defaults so the 150-odd descriptors do not each need hand editing: sample-only trackers (MOD family, chuckBiscuits, composer667, ...) = {Sampler, Player}; formats with `synth` = {Sampler, Player, synth.synthType} when they also have samples; Furnace = {Sampler, the FurnaceChip types of the chosen chip}. Formats that cannot be classified stay unrestricted (undefined = no lock), so rollout is incremental and honest. Alternative sources to read from: the loaded song's existing instruments (the kinds already present in the template), which is wrong for blank templates with zero instruments.

## 5. Recommended design

One pure function in lib/formats/ (next to the registry): `isSynthAllowed(formatId | null, synthType): boolean` plus `allowedSynthTypes(formatId): SynthType[] | null`, driven by the new `instruments.allowed` set on the descriptor, and one store selector `useAllowedSynthTypes()` reading activeFormatId. Consumers: (a) the store chokepoints createInstrument / addInstrument / updateInstrument reject (return -1 / no-op + notify.error) a disallowed synthType, which covers presets, drag-drop, clone-then-edit, MCP create_instrument/update_instrument and file imports of single instruments at once; importers that replace the whole song clear activeFormatId first; (b) SynthTypeSelector, CategorizedSynthSelector, EditorHeader, AddInstrumentDialog and LoadPresetModal filter or disable entries with the same selector, with a tooltip naming the format (UI is the presentation of the same gate, not a second rule). One reachability test: drive startNewSong('format X') then MCP create_instrument with an incompatible type and assert rejection, with a sentinel that the gate ran; per-format set contents tested in the pure function.

Risks/open: activeFormatId must be set on regular file opens too (decision); getActiveFormatLimits' null cases show how many load paths bypass the format stores; sample-only vs synth formats need a per-format classification pass (150+ descriptors), do it by deriving from `synth` and exporter sample support and leave unclassified ones unlocked.
