# UADE Instrument Replacement During Playback

## Summary

Enable live instrument replacement for all UADE-based formats (~88 formats). Two paths:

1. **Live chip RAM patching** -- fixed-size parameter edits (volume, finetune, loop points, envelopes, wavetables) write directly to chip RAM. Instant, no playback interruption.
2. **Rebuild + reload** -- sample data replacement rebuilds the entire module binary, stops UADE, reloads, resumes from the start of the current pattern.

## Architecture

```
User edits instrument
  |
  v
Is it a sample replacement? (new PCM data, size change)
  |
  +-- NO --> UADEChipEditor.patchInstrumentField(layout, instrIndex, fieldName, value)
  |            encode field -> write bytes to chip RAM -> instant on next note
  |
  +-- YES -> UADEModuleRebuilder.rebuild(song, updatedInstruments)
               capture current order position
               -> serialize full module with new sample data
               -> UADE stop -> load rebuilt binary -> seek to current pattern start -> play
```

### Integration Point

`src/stores/useInstrumentStore.ts` `updateInstrument()` currently routes to:
- `TrackerReplayer.updateInstrument()` for MOD/XM/IT/S3M
- `syncInstrumentToWasm()` for Furnace instruments

Add a new UADE route:
- Detect UADE format via `song.uadePatternLayout` or `song.uadeEditableFileData`
- If sample data changed: `UADEModuleRebuilder.rebuild()` path
- If only parameters changed: `UADEInstrumentPatcher.patchField()` path

## Component 1: UADEInstrumentLayout (Declarative Descriptor)

New interface describing where instrument data lives in the module binary, analogous to `UADEPatternLayout` for pattern cells.

```typescript
// src/engine/uade/UADEInstrumentLayout.ts

export interface InstrumentFieldDescriptor {
  /** Byte offset from the start of this instrument's header */
  offset: number;
  /** Size in bytes (1, 2, or 4) */
  size: 1 | 2 | 4;
  /** Encoding */
  type: 'u8' | 'u16be' | 'u32be' | 's8' | 's16be';
  /** Scaling -- some formats store length in words (multiply by 2 for bytes) */
  unit?: 'bytes' | 'words';
  /** Bitmask for sub-byte fields (e.g. finetune uses lower nibble) */
  mask?: number;
  /** Clamp range */
  max?: number;
}

export interface UADEInstrumentLayout {
  formatId: string;

  // -- Instrument header table --
  /** File byte offset where the instrument header table begins */
  instrTableOffset: number;
  /** Size of each instrument header in bytes */
  instrHeaderSize: number;
  /** Number of instruments in the module */
  maxInstruments: number;
  /** Field map: parameter name -> byte descriptor within the header */
  fields: Record<string, InstrumentFieldDescriptor>;

  // -- Sample data --
  /** How sample data is organized */
  sampleLayout: SampleLayout;

  // -- Optional: custom sections (envelopes, wavetables, macros) --
  /** Format-specific section encoders for complex instrument data.
   *  These handle structures that don't fit the simple field descriptor model
   *  (e.g. FC volume envelopes, SoundMon wavetables, TFMX macros). */
  sectionEncoders?: Record<string, SectionEncoder>;
}

export type SampleLayout =
  | { type: 'contiguous'; startOffset: number }
    // Samples are packed contiguously after a fixed offset.
    // Each sample's position is computed from preceding sample lengths.
  | { type: 'pointer-table'; tableOffset: number; pointerSize: 2 | 4; endian: 'be' | 'le' }
    // Instrument headers contain pointers to sample data.
  | { type: 'fixed-slots'; slotSize: number; startOffset: number }
    // Each instrument has a fixed-size sample slot.
  | { type: 'custom'; getSampleOffset: (instrIndex: number, song: TrackerSong) => { offset: number; size: number } }
    // Format-specific calculation.

export interface SectionEncoder {
  /** Encode the section data from InstrumentConfig into bytes for chip RAM write */
  encode(config: InstrumentConfig, instrIndex: number): Uint8Array;
  /** Chip RAM offset of this section (relative to module base or absolute) */
  getOffset(instrIndex: number, layout: UADEInstrumentLayout): number;
  /** Size of this section in bytes (must match original to avoid overflow) */
  getSize(instrIndex: number): number;
}
```

## Component 2: UADEInstrumentPatcher (Live Chip RAM Patching)

Handles Path 1 -- instant parameter edits during playback.

```typescript
// src/engine/uade/UADEInstrumentPatcher.ts

export class UADEInstrumentPatcher {
  constructor(private editor: UADEChipEditor) {}

  /**
   * Write a single instrument field to chip RAM.
   * The 68k replayer picks up the new value on the next note trigger.
   */
  async patchField(
    layout: UADEInstrumentLayout,
    instrIndex: number,  // 0-based
    fieldName: string,
    value: number,
  ): Promise<void> {
    const field = layout.fields[fieldName];
    if (!field) return;

    const moduleBase = await this.editor.getModuleBase();
    const addr = moduleBase
      + layout.instrTableOffset
      + instrIndex * layout.instrHeaderSize
      + field.offset;

    const clamped = field.max != null ? Math.min(value, field.max) : value;
    const scaled = field.unit === 'words' ? Math.floor(clamped / 2) : clamped;
    const masked = field.mask != null ? (scaled & field.mask) : scaled;

    switch (field.size) {
      case 1: await this.editor.writeU8(addr, masked); break;
      case 2: await this.editor.writeU16(addr, masked); break;
      case 4: await this.editor.writeU32(addr, masked); break;
    }
  }

  /**
   * Write a complex section (envelope, wavetable, macro) to chip RAM.
   * Uses the format's registered SectionEncoder.
   */
  async patchSection(
    layout: UADEInstrumentLayout,
    instrIndex: number,
    sectionName: string,
    config: InstrumentConfig,
  ): Promise<void> {
    const encoder = layout.sectionEncoders?.[sectionName];
    if (!encoder) return;

    const moduleBase = await this.editor.getModuleBase();
    const offset = encoder.getOffset(instrIndex, layout);
    const data = encoder.encode(config, instrIndex);
    const maxSize = encoder.getSize(instrIndex);

    // Never write more than the original section size (prevent buffer overflow)
    const safeData = data.length <= maxSize ? data : data.subarray(0, maxSize);
    // Zero-pad if smaller
    const padded = new Uint8Array(maxSize);
    padded.set(safeData);

    await this.editor.writeBytes(moduleBase + offset, padded);
  }
}
```

## Component 3: UADEModuleRebuilder (Sample Replacement)

Handles Path 2 -- rebuild module binary when sample data changes.

```typescript
// src/engine/uade/UADEModuleRebuilder.ts

export class UADEModuleRebuilder {
  /**
   * Rebuild the module binary with updated sample data.
   * Returns the new binary, ready to load into UADE.
   */
  static rebuild(
    originalBinary: ArrayBuffer,
    layout: UADEInstrumentLayout,
    instruments: InstrumentConfig[],
  ): ArrayBuffer {
    // 1. Copy original binary as base
    // 2. For each instrument with changed sample data:
    //    a. Convert new sample to 8-bit signed Amiga PCM
    //    b. Update sample length/loop fields in the instrument header
    //    c. Replace sample data bytes in the binary
    // 3. If any sample changed size:
    //    a. Recompute all sample offsets (contiguous layout)
    //       or update pointer table entries (pointer-table layout)
    //    b. Rebuild the binary with new offsets
    // 4. Return rebuilt binary
  }

  /**
   * Full cycle: rebuild -> stop -> reload -> resume.
   */
  static async replaceAndReload(
    song: TrackerSong,
    layout: UADEInstrumentLayout,
    instruments: InstrumentConfig[],
  ): Promise<void> {
    const engine = UADEEngine.getInstance();

    // 1. Capture current position
    const position = engine.getCurrentPosition(); // { order, row }

    // 2. Rebuild binary
    const original = song.uadeEditableFileData;
    if (!original) throw new Error('No editable file data for UADE module');
    const rebuilt = UADEModuleRebuilder.rebuild(original, layout, instruments);

    // 3. Stop playback
    engine.stop();

    // 4. Load rebuilt module
    await engine.loadModule(rebuilt, song.uadeEditableFileName ?? 'module.mod');

    // 5. Seek to start of current pattern and play
    await engine.seekToOrder(position.order);
    engine.play();

    // 6. Update song's file data reference for future rebuilds
    song.uadeEditableFileData = rebuilt;
  }
}
```

### Sample Conversion

New samples from the Sampler instrument are 16-bit PCM (WAV). UADE expects 8-bit signed Amiga PCM. Conversion:

```typescript
function convertTo8bitAmiga(audioBuffer: AudioBuffer): Uint8Array {
  const float32 = audioBuffer.getChannelData(0); // mono
  const out = new Int8Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    out[i] = Math.round(Math.max(-128, Math.min(127, float32[i] * 127)));
  }
  return new Uint8Array(out.buffer);
}
```

Resample to match the original Amiga sample rate (typically 8363 Hz for C-3 period 428) if the new sample has a different rate.

## Component 4: GenericInstrumentLayoutFactory

Analogous to `GenericEncoderFactory.ts` for pattern cells. Most formats follow a small number of instrument header patterns. The factory generates `UADEInstrumentLayout` from a declarative description.

### Layout Families

**Family 1: ProTracker (30-byte headers)**
~20 formats: MOD, SoundFX, Oktalyzer, UNIC, Startrekker, etc.

```typescript
const PROTRACKER_INSTRUMENT_LAYOUT: UADEInstrumentLayout = {
  formatId: 'protracker',
  instrTableOffset: 20,       // byte 20 in MOD file
  instrHeaderSize: 30,
  maxInstruments: 31,
  fields: {
    // name is 22 bytes at offset 0 but not patchable via this interface
    length:    { offset: 22, size: 2,  type: 'u16be', unit: 'words' },
    finetune:  { offset: 24, size: 1,  type: 'u8', mask: 0x0F },
    volume:    { offset: 25, size: 1,  type: 'u8', max: 64 },
    loopStart: { offset: 26, size: 2,  type: 'u16be', unit: 'words' },
    loopLen:   { offset: 28, size: 2,  type: 'u16be', unit: 'words' },
  },
  sampleLayout: { type: 'contiguous', startOffset: -1 }, // computed from header + patterns
};
```

**Family 2: Pointer-table formats**
~15 formats: FC, TFMX, Hippel-CoSo, SonicArranger, etc.
Instrument headers contain 32-bit pointers to variable-length instrument blocks.

**Family 3: Compact header formats**
~15 formats: SidMon, DeltaMusic, GameMusicCreator, etc.
Small fixed-size instrument headers with format-specific field packing.

**Family 4: Complex/Custom formats**
~15 formats: OctaMED, DigiBooster, Symphonie, etc.
Require per-format layout implementations.

**Family 5: Stub/non-editable**
~23 formats (SimpleAmigaStubEncoder family): Only rebuild+reload path available. No live field patching because the instrument structure is unknown or too complex to describe declaratively.

### Factory Interface

```typescript
// src/engine/uade/GenericInstrumentLayoutFactory.ts

export type InstrumentLayoutFamily =
  | { kind: 'protracker'; instrTableOffset?: number; maxInstruments?: number }
  | { kind: 'noteIndex'; instrTableOffset: number; instrHeaderSize: number;
      maxInstruments: number; fields: Record<string, InstrumentFieldDescriptor> }
  | { kind: 'pointerTable'; tableOffset: number; pointerSize: 2 | 4;
      maxInstruments: number; fields: Record<string, InstrumentFieldDescriptor> }
  ;

export function generateInstrumentLayout(
  formatId: string,
  family: InstrumentLayoutFamily,
  sampleLayout: SampleLayout,
  sectionEncoders?: Record<string, SectionEncoder>,
): UADEInstrumentLayout;
```

## Component 5: Per-Format Layout Declarations

Each of the 88 encoder files gets an instrument layout declaration added alongside its existing pattern encoder. Example for a ProTracker-family format:

```typescript
// In MODEncoder.ts (existing file)
import { registerInstrumentLayout } from '../UADEInstrumentLayout';
import { generateInstrumentLayout } from '../GenericInstrumentLayoutFactory';

registerInstrumentLayout(generateInstrumentLayout(
  'protracker',
  { kind: 'protracker' },
  { type: 'contiguous', startOffset: -1 },  // auto-computed
));
```

For formats with complex instrument structures (FC, SoundMon, TFMX), the section encoders from `chipRamEncoders.ts` are wired in:

```typescript
// In FCEncoder.ts
import { encodeFCVolEnvelope, encodeFCFreqMacro } from '../chipRamEncoders';

registerInstrumentLayout(generateInstrumentLayout(
  'futureComposer',
  { kind: 'pointerTable', tableOffset: 0, pointerSize: 4, maxInstruments: 10,
    fields: { /* FC instrument header fields */ } },
  { type: 'pointer-table', tableOffset: 0, pointerSize: 4, endian: 'be' },
  {
    volEnvelope: {
      encode: (config) => encodeFCVolEnvelope(config.fc!),
      getOffset: (instrIdx, layout) => /* compute from pointer table */,
      getSize: () => 64,
    },
    freqMacro: {
      encode: (config) => encodeFCFreqMacro(config.fc!.synthTable, config.fc!.arpTable ?? []),
      getOffset: (instrIdx, layout) => /* compute from pointer table */,
      getSize: () => 64,
    },
  },
));
```

For stub formats (SimpleAmigaStubEncoder family), register a minimal layout with no fields -- only the rebuild+reload path is available:

```typescript
registerInstrumentLayout({
  formatId: 'stubFormat',
  instrTableOffset: 0,
  instrHeaderSize: 0,
  maxInstruments: 0,
  fields: {},
  sampleLayout: { type: 'custom', getSampleOffset: () => ({ offset: 0, size: 0 }) },
});
```

## Component 6: Store Integration

### Change Detection

In `useInstrumentStore.updateInstrument()`, after the existing engine-specific update blocks:

```typescript
// UADE instrument replacement
if (song?.uadePatternLayout || song?.uadeEditableFileData) {
  const layout = getInstrumentLayout(song.uadePatternLayout?.formatId ?? '');
  if (layout) {
    const isSampleChange = updates.sample?.audioBuffer != null
                        || updates.sample?.url != null;

    if (isSampleChange) {
      // Path 2: rebuild + reload
      UADEModuleRebuilder.replaceAndReload(song, layout, get().instruments);
    } else {
      // Path 1: live chip RAM patching
      const patcher = new UADEInstrumentPatcher(uadeChipEditor);
      // Patch changed fields
      for (const [fieldName, value] of changedFields(oldConfig, updatedConfig, layout)) {
        patcher.patchField(layout, instrIndex, fieldName, value);
      }
      // Patch changed sections (envelopes, wavetables)
      for (const sectionName of changedSections(oldConfig, updatedConfig, layout)) {
        patcher.patchSection(layout, instrIndex, sectionName, updatedConfig);
      }
    }
  }
}
```

### Changed Field Detection

```typescript
function changedFields(
  oldConfig: InstrumentConfig,
  newConfig: InstrumentConfig,
  layout: UADEInstrumentLayout,
): [string, number][] {
  const changes: [string, number][] = [];
  // Map InstrumentConfig fields to layout field names
  // e.g. sample.volume -> 'volume', metadata.modPlayback.finetune -> 'finetune'
  // Compare old vs new, collect changes
  return changes;
}
```

## Resume Behavior

When `UADEModuleRebuilder.replaceAndReload()` fires:

1. Read current order position from UADE engine
2. Stop playback
3. Load rebuilt module binary
4. Seek to order position (start of that pattern)
5. Start playback

The user experiences a brief (~100-200ms) gap in audio. The music resumes from the start of whichever pattern was playing.

## File Map

| File | Status | Purpose |
|------|--------|---------|
| `src/engine/uade/UADEInstrumentLayout.ts` | NEW | Interface + registry |
| `src/engine/uade/UADEInstrumentPatcher.ts` | NEW | Live chip RAM field/section patching |
| `src/engine/uade/UADEModuleRebuilder.ts` | NEW | Rebuild binary + reload cycle |
| `src/engine/uade/GenericInstrumentLayoutFactory.ts` | NEW | Declarative layout generator |
| `src/engine/uade/chipRamEncoders.ts` | MODIFY | Wire existing encoders as SectionEncoders |
| `src/engine/uade/encoders/*.ts` (88 files) | MODIFY | Add instrument layout registration |
| `src/stores/useInstrumentStore.ts` | MODIFY | Add UADE routing in updateInstrument() |
| `src/engine/uade/UADEEngine.ts` | MODIFY | Add getCurrentPosition() and seekToOrder() if not present |

## Success Criteria

### Automated
- `npm run type-check` passes with no errors
- All 88 encoder files register an instrument layout (grep-verifiable)

### Manual
- Load a ProTracker MOD via UADE, change instrument volume during playback -- hear the change on the next note trigger (no playback interruption)
- Load a Future Composer file, edit the volume envelope -- hear the envelope change live
- Load any UADE format, replace instrument 1's sample with a new WAV -- music stops briefly, resumes from pattern start with new sample audible
- Rebuild+reload preserves the correct pattern position (doesn't restart from song beginning)
