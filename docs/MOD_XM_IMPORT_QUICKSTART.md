# MOD/XM Import Quick Start Guide

## For Developers: Using the Native Import System

This guide shows how to use the newly implemented native MOD/XM import system in DEViLBOX.

---

## Basic Usage

### 1. Import a MOD/XM File

```typescript
import { loadModuleFile } from '@/lib/import/ModuleLoader';
import { convertXMModule, convertMODModule } from '@/lib/import/ModuleConverter';
import { convertToInstrument } from '@/lib/import/InstrumentConverter';

async function importModuleFile(file: File) {
  // Load the file (auto-detects XM/MOD and uses native parser)
  const moduleInfo = await loadModuleFile(file);

  // Check if native parser was used
  if (moduleInfo.nativeData) {
    const { format, importMetadata, instruments, patterns } = moduleInfo.nativeData;

    // Convert patterns to DEViLBOX format
    const converted = format === 'XM'
      ? convertXMModule(
          patterns,
          importMetadata.originalChannelCount,
          importMetadata,
          instruments.map(i => i.name)
        )
      : convertMODModule(
          patterns,
          importMetadata.originalChannelCount,
          importMetadata,
          instruments.map(i => i.name)
        );

    // Convert instruments
    const convertedInstruments = instruments.flatMap((inst, idx) =>
      convertToInstrument(inst, idx, format)
    );

    return {
      patterns: converted.patterns,
      instruments: convertedInstruments,
      metadata: importMetadata,
    };
  } else {
    // Fallback: libopenmpt path (for IT, S3M, etc.)
    // Use existing import logic
  }
}
```

### 2. Add to Stores

```typescript
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

async function importAndAddToStores(file: File) {
  const imported = await importModuleFile(file);

  // Add patterns to tracker
  const trackerStore = useTrackerStore.getState();
  imported.patterns.forEach(pattern => {
    trackerStore.addPattern(pattern);
  });

  // Add instruments
  const instrumentStore = useInstrumentStore.getState();
  imported.instruments.forEach(instrument => {
    instrumentStore.addInstrument(instrument);
  });

  console.log(`Imported ${imported.patterns.length} patterns and ${imported.instruments.length} instruments`);
}
```

---

## Advanced Usage

### 3. Transform Sample to Synth

```typescript
import { analyzeSample, suggestSynthConfig } from '@/lib/import/InstrumentConverter';
import { useInstrumentStore } from '@/stores/useInstrumentStore';

function transformSampleToSynth(instrumentId: number, targetSynthType: 'TB303' | 'PolySynth' | 'ChipSynth') {
  const store = useInstrumentStore.getState();
  const instrument = store.instruments.find(i => i.id === instrumentId);

  if (!instrument || instrument.synthType !== 'Sampler') {
    throw new Error('Instrument is not a sampler');
  }

  // Analyze the sample
  const sample = instrument.metadata?.preservedSample;
  if (!sample) {
    throw new Error('No preserved sample data');
  }

  const analysis = analyzeSample(
    {
      id: instrumentId,
      name: instrument.name,
      pcmData: sample.audioBuffer,
      loopType: sample.loop ? 'forward' : 'none',
      length: 0, // Would need to calculate from audioBuffer
      // ... other sample properties
    },
    instrument.metadata?.originalEnvelope
  );

  // Get suggested config
  const synthConfig = suggestSynthConfig(targetSynthType, analysis);

  // Create new instrument with synth
  const newInstrument = {
    ...instrument,
    synthType: targetSynthType,
    [targetSynthType.toLowerCase()]: synthConfig, // e.g., tb303: synthConfig
    metadata: {
      ...instrument.metadata,
      transformHistory: [
        ...(instrument.metadata?.transformHistory || []),
        {
          timestamp: new Date().toISOString(),
          fromType: 'Sampler',
          toType: targetSynthType,
        },
      ],
    },
  };

  // Update instrument
  store.updateInstrument(instrumentId, newInstrument);

  console.log(`Transformed instrument ${instrumentId} from Sampler to ${targetSynthType}`);
}
```

### 4. Revert Synth to Sample

```typescript
function revertToSample(instrumentId: number) {
  const store = useInstrumentStore.getState();
  const instrument = store.instruments.find(i => i.id === instrumentId);

  if (!instrument?.metadata?.preservedSample) {
    throw new Error('No preserved sample data to revert to');
  }

  // Revert to original sample
  const revertedInstrument = {
    ...instrument,
    synthType: 'Sampler',
    sample: instrument.metadata.preservedSample,
  };

  store.updateInstrument(instrumentId, revertedInstrument);

  console.log(`Reverted instrument ${instrumentId} to original sample`);
}
```

### 5. Access Import Metadata

```typescript
function getImportInfo(pattern: Pattern) {
  const metadata = pattern.importMetadata;

  if (!metadata) {
    console.log('Pattern was not imported');
    return;
  }

  console.log(`Format: ${metadata.sourceFormat}`);
  console.log(`File: ${metadata.sourceFile}`);
  console.log(`Channels: ${metadata.originalChannelCount}`);
  console.log(`Patterns: ${metadata.originalPatternCount}`);
  console.log(`Instruments: ${metadata.originalInstrumentCount}`);

  if (metadata.modData) {
    console.log(`Module Type: ${metadata.modData.moduleType}`);
    console.log(`Initial Speed: ${metadata.modData.initialSpeed}`);
    console.log(`Initial BPM: ${metadata.modData.initialBPM}`);
    console.log(`Frequency Type: ${metadata.modData.amigaPeriods ? 'Amiga' : 'Linear'}`);
  }

  // Access original samples
  if (metadata.originalSamples) {
    Object.entries(metadata.originalSamples).forEach(([id, sample]) => {
      console.log(`Sample ${id}: ${sample.name} (${sample.bitDepth}-bit, ${sample.length} frames)`);
      console.log(`  Loop: ${sample.loopType} (${sample.loopStart} - ${sample.loopStart + sample.loopLength})`);
      console.log(`  Volume: ${sample.volume}/64, Finetune: ${sample.finetune}, RelNote: ${sample.relativeNote}`);
    });
  }

  // Access envelope data
  if (metadata.envelopes) {
    Object.entries(metadata.envelopes).forEach(([id, env]) => {
      if (env.volumeEnvelope?.enabled) {
        console.log(`Instrument ${id} Volume Envelope: ${env.volumeEnvelope.points.length} points`);
      }
      if (env.panningEnvelope?.enabled) {
        console.log(`Instrument ${id} Panning Envelope: ${env.panningEnvelope.points.length} points`);
      }
      if (env.autoVibrato) {
        console.log(`Instrument ${id} Auto-Vibrato: ${env.autoVibrato.type} (depth: ${env.autoVibrato.depth})`);
      }
    });
  }
}
```

---

## FT2 Effect Commands

### Using FT2 Effects in Patterns

All effects use FastTracker II format: `XYZ` where X is the command (0-F) and YZ is the parameter (hex).

```typescript
import type { TrackerCell } from '@/types/tracker';

// Example cells with FT2 effects
const cells: TrackerCell[] = [
  {
    note: 'C-4',
    instrument: 1,
    volume: 0x40,  // Max volume (64)
    effect: 'A0F',  // Volume slide down (speed 0F)
  },
  {
    note: 'E-4',
    instrument: 1,
    volume: null,
    effect: '320',  // Tone portamento (speed 20)
  },
  {
    note: 'G-4',
    instrument: 1,
    volume: 0x72,  // Volume column: 0x70-0x7F = volume slide up
    effect: '488',  // Vibrato (speed 4, depth 8)
    effect2: 'A20', // Volume slide up (speed 2) - converted from volume column
  },
];
```

### Common FT2 Effects

```typescript
// Arpeggio: Cycle between 3 notes
effect: '037'  // Major chord (0, +3, +7 semitones)

// Pitch slides
effect: '110'  // Pitch slide up (speed 10)
effect: '220'  // Pitch slide down (speed 20)
effect: '300'  // Tone portamento (reuse last speed)

// Vibrato/Tremolo
effect: '488'  // Vibrato (speed 4, depth 8)
effect: '746'  // Tremolo (speed 7, depth 6)

// Volume
effect: 'A0F'  // Volume slide down (speed F)
effect: 'AF0'  // Volume slide up (speed F)
effect: 'C40'  // Set volume to 0x40 (64/64)

// Pattern flow
effect: 'B00'  // Jump to pattern 0 in order list
effect: 'D00'  // Pattern break (go to next pattern, row 0)
effect: 'F06'  // Set speed to 6 ticks/row
effect: 'F7D'  // Set BPM to 125

// Extended commands (Exy)
effect: 'E12'  // Fine pitch slide up by 2
effect: 'E24'  // Fine pitch slide down by 4
effect: 'EA4'  // Fine volume slide up by 4
effect: 'EB2'  // Fine volume slide down by 2
effect: 'EC3'  // Note cut at tick 3
effect: 'ED2'  // Note delay by 2 ticks
effect: 'E60'  // Pattern loop start
effect: 'E63'  // Pattern loop 3 times
```

See `/docs/FT2_EFFECTS.md` for complete reference.

---

## Envelope Conversion

### Converting Point-Based Envelopes to ADSR

```typescript
import { convertEnvelopeToADSR, analyzeEnvelopeShape } from '@/lib/import/EnvelopeConverter';
import type { EnvelopePoints } from '@/types/tracker';

// XM envelope with 5 points
const xmEnvelope: EnvelopePoints = {
  enabled: true,
  points: [
    { tick: 0, value: 0 },      // Start at 0
    { tick: 10, value: 64 },    // Attack to max in 10 ticks
    { tick: 40, value: 32 },    // Decay to 50% in 30 ticks
    { tick: 80, value: 32 },    // Sustain at 50% for 40 ticks
    { tick: 100, value: 0 },    // Release to 0 in 20 ticks
  ],
  sustainPoint: 2,  // Index 2 (value 32)
  loopStartPoint: null,
  loopEndPoint: null,
};

// Convert to ADSR
const adsr = convertEnvelopeToADSR(xmEnvelope);
console.log(adsr);
// {
//   attack: 32,    // ~10 ticks * 3.2ms/tick
//   decay: 96,     // ~30 ticks * 3.2ms/tick
//   sustain: 50,   // 32/64 * 100
//   release: 64,   // ~20 ticks * 3.2ms/tick
// }

// Analyze envelope shape
const shape = analyzeEnvelopeShape(xmEnvelope);
console.log(shape);
// {
//   type: 'sustained',
//   hasQuickAttack: true,
//   hasSustain: true,
//   hasLongRelease: false,
// }
```

### Reverse: ADSR to Envelope Points

```typescript
import { adsrToEnvelopePoints } from '@/lib/import/EnvelopeConverter';
import type { EnvelopeConfig } from '@/types/instrument';

const adsr: EnvelopeConfig = {
  attack: 50,
  decay: 500,
  sustain: 30,
  release: 200,
};

const envelopePoints = adsrToEnvelopePoints(adsr);
console.log(envelopePoints);
// {
//   enabled: true,
//   points: [
//     { tick: 0, value: 0 },
//     { tick: 16, value: 64 },    // Attack
//     { tick: 172, value: 19 },   // Decay to sustain
//     { tick: 222, value: 19 },   // Sustain hold
//     { tick: 285, value: 0 },    // Release
//   ],
//   sustainPoint: 2,
//   loopStartPoint: null,
//   loopEndPoint: null,
// }
```

---

## Testing

### Running Import Tests

```typescript
import { parseXM } from '@/lib/import/formats/XMParser';
import { parseMOD } from '@/lib/import/formats/MODParser';

async function testXMImport(filepath: string) {
  const response = await fetch(filepath);
  const buffer = await response.arrayBuffer();

  const result = await parseXM(buffer);

  console.log(`XM File: ${result.header.moduleName}`);
  console.log(`Channels: ${result.header.channelCount}`);
  console.log(`Patterns: ${result.header.patternCount}`);
  console.log(`Instruments: ${result.header.instrumentCount}`);
  console.log(`Speed: ${result.header.defaultTempo}, BPM: ${result.header.defaultBPM}`);

  result.instruments.forEach((inst, idx) => {
    console.log(`Instrument ${idx}: ${inst.name} (${inst.samples.length} samples)`);
    inst.samples.forEach((sample, sampleIdx) => {
      console.log(`  Sample ${sampleIdx}: ${sample.name} (${sample.bitDepth}-bit, ${sample.length} frames)`);
    });

    if (inst.volumeEnvelope?.enabled) {
      console.log(`  Volume Envelope: ${inst.volumeEnvelope.points.length} points`);
    }
  });

  return result;
}

async function testMODImport(filepath: string) {
  const response = await fetch(filepath);
  const buffer = await response.arrayBuffer();

  const result = await parseMOD(buffer);

  console.log(`MOD File: ${result.header.title}`);
  console.log(`Format: ${result.header.formatTag} (${result.header.channelCount} channels)`);
  console.log(`Patterns: ${result.header.patternCount}`);
  console.log(`Song Length: ${result.header.songLength}`);

  result.instruments.forEach((inst, idx) => {
    if (inst.samples.length > 0) {
      const sample = inst.samples[0];
      console.log(`Sample ${idx + 1}: ${sample.name} (${sample.length} words)`);
      console.log(`  Volume: ${sample.volume}/64, Finetune: ${sample.finetune}`);
      console.log(`  Loop: ${sample.loopType} (${sample.loopStart} - ${sample.loopStart + sample.loopLength})`);
    }
  });

  return result;
}
```

---

## Troubleshooting

### Issue: Import fails with "Invalid XM file"

**Cause:** File is not a valid XM file or is corrupted.

**Solution:**
```typescript
// Check file header
const buffer = await file.arrayBuffer();
const view = new DataView(buffer);
const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 17));

if (header !== 'Extended Module: ') {
  console.error('Not a valid XM file');
  // Try MOD parser or libopenmpt fallback
}
```

### Issue: Samples sound wrong

**Cause:** Sample rate mismatch or incorrect base note.

**Solution:**
```typescript
// Check sample metadata
const sample = instrument.samples[0];
console.log(`Base Note: ${sample.relativeNote}, Finetune: ${sample.finetune}`);

// XM uses C-4 as base (MIDI 60), MOD uses C-2 (MIDI 36)
// Adjust baseNote in InstrumentConverter if needed
```

### Issue: Effects not working

**Cause:** Effect processor not initialized or wrong format.

**Solution:**
```typescript
// Verify effect format (FT2: XYZ hex)
const cell: TrackerCell = {
  note: 'C-4',
  instrument: 1,
  volume: null,
  effect: 'A0F',  // Must be uppercase hex
};

// Check PatternScheduler is using EffectProcessor
const scheduler = getPatternScheduler();
console.log('Effect processor:', scheduler.effectProcessor);
```

### Issue: Envelopes not applied

**Cause:** Envelope conversion failed or ADSR values out of range.

**Solution:**
```typescript
import { convertEnvelopeToADSR } from '@/lib/import/EnvelopeConverter';

// Check envelope conversion
const adsr = convertEnvelopeToADSR(xmEnvelope);
console.log('Converted ADSR:', adsr);

// Verify ranges: attack/decay 0-2000ms, sustain 0-100%, release 0-5000ms
if (adsr.attack < 0 || adsr.attack > 2000) {
  console.error('Attack out of range:', adsr.attack);
}
```

---

## API Reference

### ModuleLoader

```typescript
// Load module file (auto-detects format)
loadModuleFile(file: File): Promise<ModuleInfo>

// Preview module audio
previewModule(info: ModuleInfo): Promise<void>

// Stop preview
stopPreview(info: ModuleInfo): void

// Check if file is supported
isSupportedModule(filename: string): boolean

// Get supported extensions
getSupportedExtensions(): string[]
```

### ModuleConverter

```typescript
// Convert XM module
convertXMModule(
  patterns: XMNote[][][],
  channelCount: number,
  metadata: ImportMetadata,
  instrumentNames: string[]
): ConversionResult

// Convert MOD module
convertMODModule(
  patterns: MODNote[][][],
  channelCount: number,
  metadata: ImportMetadata,
  instrumentNames: string[]
): ConversionResult

// Legacy: Convert libopenmpt data
convertModule(song: RawSongData): ConversionResult
```

### InstrumentConverter

```typescript
// Convert parsed instrument to DEViLBOX format
convertToInstrument(
  parsed: ParsedInstrument,
  instrumentId: number,
  sourceFormat: 'MOD' | 'XM' | 'IT' | 'S3M'
): InstrumentConfig[]

// Analyze sample characteristics
analyzeSample(
  sample: ParsedSample,
  envelope?: EnvelopePoints
): SampleAnalysis

// Suggest synth config based on analysis
suggestSynthConfig(
  targetSynthType: SynthType,
  analysis: SampleAnalysis
): any
```

### EnvelopeConverter

```typescript
// Convert point-based envelope to ADSR
convertEnvelopeToADSR(
  envelope: EnvelopePoints | undefined,
  defaultSustain?: number
): EnvelopeConfig

// Analyze envelope shape
analyzeEnvelopeShape(
  envelope: EnvelopePoints | undefined
): {
  type: 'pluck' | 'pad' | 'percussive' | 'sustained' | 'unknown';
  hasQuickAttack: boolean;
  hasSustain: boolean;
  hasLongRelease: boolean;
}

// Convert ADSR to envelope points
adsrToEnvelopePoints(adsr: EnvelopeConfig): EnvelopePoints

// Interpolate envelope value at tick
interpolateEnvelopeValue(
  envelope: EnvelopePoints,
  tick: number
): number
```

---

## Export MOD/XM Files

### Programmatic Export

#### Export as XM

```typescript
import { exportAsXM, type XMExportOptions } from '@/lib/export/XMExporter';

async function exportToXM(patterns: Pattern[], instruments: InstrumentConfig[]) {
  const options: XMExportOptions = {
    channelLimit: 16,                // Max 32 channels
    moduleName: 'My Song',           // 20 chars max
    bakeSynthsToSamples: true,       // Render synths as samples
    stripInstrumentEffects: true,    // Remove effect chains
    defaultSpeed: 6,                 // Ticks per row
    defaultBPM: 125,                 // Beats per minute
  };

  const result = await exportAsXM(patterns, instruments, options);

  // Download the file
  const url = URL.createObjectURL(result.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;  // e.g., "My_Song.xm"
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Check warnings
  if (result.warnings.length > 0) {
    console.warn('Export warnings:', result.warnings);
    result.warnings.forEach(warning => {
      console.warn(`  - ${warning}`);
    });
  } else {
    console.log('✅ XM exported successfully!');
  }
}
```

#### Export as MOD

```typescript
import { exportAsMOD, type MODExportOptions } from '@/lib/export/MODExporter';

async function exportToMOD(patterns: Pattern[], instruments: InstrumentConfig[]) {
  const options: MODExportOptions = {
    channelCount: 4,                 // 4, 6, or 8 channels
    moduleName: 'My Song',           // 20 chars max
    bakeSynthsToSamples: true,       // Render synths as samples
  };

  const result = await exportAsMOD(patterns, instruments, options);

  // Download the file
  const url = URL.createObjectURL(result.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;  // e.g., "My_Song.mod"
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Check warnings
  if (result.warnings.length > 0) {
    console.warn('Export warnings:', result.warnings);
  }
}
```

#### Lossless Re-Export

If you imported an XM/MOD file and want to re-export it without any data loss, the exporters automatically detect this and preserve the original sample data:

```typescript
// Import XM file
const moduleInfo = await loadModuleFile(xmFile);
const { patterns, instruments } = await importModuleFile(xmFile);

// Edit patterns or add effects...
patterns[0].channels[0].rows[0].note = 'C-5';

// Re-export as XM (lossless if samples weren't transformed)
const result = await exportAsXM(patterns, instruments, {
  moduleName: 'My Edited Song',
});

// No warnings if:
// - All instruments are still Samplers (not transformed to synths)
// - Channel count hasn't exceeded 32
// - Pattern length hasn't exceeded 256 rows
```

### Using the Export Dialog (UI)

Users can export via the integrated export dialog:

```typescript
// The ExportDialog component now includes XM and MOD export modes
import { ExportDialog } from '@/lib/export/ExportDialog';

function MyComponent() {
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      <button onClick={() => setShowExport(true)}>
        Export
      </button>
      <ExportDialog
        isOpen={showExport}
        onClose={() => setShowExport(false)}
      />
    </>
  );
}
```

The export dialog provides:
- **XM Export**: Channel count selection (2-32), bake synths option, warnings display
- **MOD Export**: Format selection (4/6/8 channel), bake synths option, warnings display

### Export Limitations

#### XM Limitations
- Max 32 channels (extra channels truncated with warning)
- Max 256 patterns
- Max 128 instruments
- Max 256 rows per pattern
- Synth instruments must be rendered as samples
- Instrument effect chains will be lost
- Volume column only supports specific effects

#### MOD Limitations
- Max 8 channels (M.K. = 4, 6CHN = 6, 8CHN = 8)
- Max 64 rows per pattern (extra rows truncated)
- Max 31 samples
- 8-bit samples only (16-bit samples downsampled)
- Note range: C-0 to B-3 (Amiga period table)
- No volume column support
- No effect2 support
- No envelopes (ADSR lost)

### Handling Warnings

Both exporters provide detailed warnings for lossy conversions:

```typescript
const result = await exportAsXM(patterns, instruments, options);

// Example warnings:
// - "Pattern 0 has 10 channels but exporting as 8-channel XM. Extra channels truncated."
// - "Synth instrument 'TB-303 Bass' will be rendered as sample."
// - "Instrument 'Lead' has 3 effects that will be lost (XM doesn't support effect chains)."
// - "Pattern 5 has 80 rows but MOD supports max 64. Extra rows truncated."
// - "Note E-4 is out of range for MOD format (C-0 to B-3 supported)."

// Display warnings to user
if (result.warnings.length > 0) {
  const warningList = result.warnings.map(w => `• ${w}`).join('\n');
  alert(`Export completed with warnings:\n\n${warningList}`);
}
```

---

## Next Steps

1. ✅ **Integration**: Wire up native parsers in import UI
2. **Testing**: Import test files and verify accuracy
3. **UI**: Add transformation controls to instrument editor
4. ✅ **Export**: Implement XM/MOD export system
5. **Documentation**: Write user guide for import workflow

---

**Last Updated:** 2026-01-22
**Status:** Import/Export system complete, testing pending
