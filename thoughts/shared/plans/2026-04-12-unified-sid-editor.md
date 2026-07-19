---
date: 2026-04-12
topic: unified-sid-synth-editor
tags: [sid, synth-editor, goattracker, cheesecutter, sidmon, plan]
status: draft
---

# Unified SID Synth Editor — Implementation Plan

## Goal
Build a unified SID instrument editor that works across GoatTracker Ultra, CheeseCutter, and SidMon II. The editor shares common SID components but supports format-specific quirks via an adapter layer.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            UnifiedSIDEditor.tsx                   │
│  ┌──────────┬──────────┬──────────┬────────────┐ │
│  │ Envelope │ Waveform │ Filter   │ Format Tab │ │
│  │ (shared) │ (shared) │ (shared) │ (specific) │ │
│  └──────────┴──────────┴──────────┴────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │ Tables (shared component, format-driven)      │ │
│  └──────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │ SID Register Monitor (shared)                 │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│         SIDInstrumentAdapter (interface)          │
│                                                   │
│  getADSR() → {a,d,s,r}                          │
│  setADSR(a,d,s,r)                               │
│  getWaveform() → {tri,saw,pul,noi,gate,...}      │
│  setWaveform(...)                                │
│  getFilter() → {cutoff,resonance,mode}           │
│  setFilter(...)                                  │
│  getTables() → {wave?,pulse?,filter?,speed?}     │
│  setTableEntry(table,row,side,value)             │
│  getSidRegisters() → Uint8Array(25)              │
│  getFormatFeatures() → FeatureFlags              │
│  getFormatSpecificUI() → React.ReactNode | null  │
│                                                   │
│  Implementations:                                 │
│    GTUltraAdapter     → full tables, panning,     │
│                         gate timer, sound designer │
│    CheeseCutterAdapter → tables (read-only until   │
│                          WASM bridge extended)     │
│    SidMonAdapter      → direct params, arpeggio,   │
│                         PCM samples, vibrato       │
└─────────────────────────────────────────────────┘
```

## Phases

### Phase 1: Extract Shared Components from GTUltra
**Goal:** Pull reusable SID components out of GTUltraControls.tsx into standalone components.

**Files to create:**
- `src/components/instruments/sid/SIDEnvelopeSection.tsx` — ADSR 4-slider + EnvelopeVisualization
- `src/components/instruments/sid/SIDWaveformSection.tsx` — TRI/SAW/PUL/NOI toggles + gate/sync/ring/test
- `src/components/instruments/sid/SIDFilterSection.tsx` — cutoff knob + resonance knob + LP/HP/BP toggles + freq response viz
- `src/components/instruments/sid/SIDRegisterMonitor.tsx` — live register display (3 voices + filter), polling
- `src/components/instruments/sid/SIDTableEditor.tsx` — generic hex table with left/right columns, execution position marker

**Extraction rules:**
- Components receive values via props, fire onChange callbacks
- No store dependencies — adapter provides data
- Hex formatting, SID-specific constants (ATTACK_MS, DECAY_MS) shared via `src/lib/sid/sidConstants.ts`

**Verification:**
- `npm run type-check` passes
- GTUltraControls refactored to use the new shared components — must look and work identically

### Phase 2: Adapter Interface + GTUltra Adapter
**Goal:** Define the adapter interface and implement the GTUltra adapter as proof of concept.

**Files to create:**
- `src/components/instruments/sid/SIDInstrumentAdapter.ts` — interface definition
- `src/components/instruments/sid/adapters/GTUltraAdapter.ts` — maps GTUltraStore/Engine to adapter interface
- `src/components/instruments/sid/UnifiedSIDEditor.tsx` — the unified editor shell that renders shared sections + format-specific tabs

**Adapter interface:**
```typescript
interface SIDInstrumentAdapter {
  // Identity
  formatName: string;  // "GoatTracker Ultra" | "CheeseCutter" | "SidMon II"
  instrumentIndex: number;
  instrumentName: string;

  // ADSR (all formats have this)
  getADSR(): { attack: number; decay: number; sustain: number; release: number };
  setADSR(a: number, d: number, s: number, r: number): void;

  // Waveform (format-dependent: GTU=bits, SidMon=enum, CC=table)
  getWaveform(): { tri: boolean; saw: boolean; pul: boolean; noi: boolean; gate: boolean; sync?: boolean; ring?: boolean; test?: boolean } | null;
  setWaveform(wf: Partial<...>): void;

  // Filter (direct for SidMon, table-based for GTU/CC)
  getFilter(): { cutoff: number; resonance: number; mode: 'lp' | 'hp' | 'bp' } | null;
  setFilter(f: Partial<...>): void;

  // Vibrato (direct for SidMon, table-based for GTU)
  getVibrato(): { delay: number; speed: number; depth: number } | null;
  setVibrato(v: Partial<...>): void;

  // Tables (GTU and CC have these, SidMon uses arpTable instead)
  hasTables(): boolean;
  getTableNames(): string[];
  getTable(name: string): { left: Uint8Array; right: Uint8Array } | null;
  setTableEntry(name: string, row: number, side: 'left' | 'right', value: number): void;
  getTablePointer(name: string): number;
  setTablePointer(name: string, value: number): void;

  // Arpeggio (SidMon has direct table, GTU uses speed table)
  getArpeggio(): { table: number[]; speed: number } | null;
  setArpeggio(arp: Partial<...>): void;

  // SID register monitor
  getSidRegisters(chipIndex: number): Uint8Array | null;
  getSidCount(): number;

  // Feature flags — what this format supports
  features: {
    hasTables: boolean;
    hasDirectFilter: boolean;
    hasDirectVibrato: boolean;
    hasDirectArpeggio: boolean;
    hasPanning: boolean;
    hasGateTimer: boolean;
    hasPCMSamples: boolean;
    hasSoundDesigner: boolean;
    hasEditableParams: boolean;  // false for CheeseCutter until WASM extended
  };

  // Format-specific extra UI (gate timer, panning, PCM, sound designer)
  renderFormatSpecific?: () => React.ReactNode;
}
```

**Verification:**
- GTUltra editor renders identically through UnifiedSIDEditor + GTUltraAdapter
- All existing functionality preserved

### Phase 3: CheeseCutter Adapter (Read-Only)
**Goal:** Build CheeseCutter instrument viewer using the unified editor.

**Files to create:**
- `src/components/instruments/sid/adapters/CheeseCutterAdapter.ts`
- Update `src/components/cheesecut/CheeseCutterView.tsx` to include instrument editor panel

**What works immediately (read-only from parsed data):**
- ADSR display (AD/SR bytes from CCInstrument)
- Table pointer display (wavePtr, pulsePtr, filterPtr)
- Table viewers (wavetable, pulse table, filter table from store)
- SID register monitor (cc_get_sid_regs exists in WASM)

**What needs WASM bridge extension (Phase 5):**
- Editing ADSR → needs `cc_set_instrument_byte(inst, byteIdx, value)`
- Editing table entries → needs `cc_set_table_entry(table, row, value)`
- Changes need to write back to the 64KB RAM image

**Verification:**
- Load a .ct file, see instrument parameters displayed
- SID register monitor shows live register values during playback

### Phase 4: SidMon Adapter
**Goal:** Integrate SidMon II into the unified editor.

**Files to create:**
- `src/components/instruments/sid/adapters/SidMonAdapter.ts`

**Mapping:**
- ADSR → direct fields (already 0-15 SID format)
- Waveform → enum 0-3 mapped to toggle flags
- Filter → direct cutoff/resonance/mode fields
- Vibrato → direct delay/speed/depth fields
- Arpeggio → 8-entry table + speed
- PCM → format-specific tab (reuse existing SidMonControls PCM section)
- No tables (hasTables=false)

**Verification:**
- SidMon instruments render correctly in unified editor
- All parameter changes work (knobs, sliders, arpeggio editing)
- PCM tab shows waveform + loop controls

### Phase 5: CheeseCutter WASM Bridge Extension
**Goal:** Make CheeseCutter instruments editable at runtime.

**Files to modify:**
- `cheesecutter-wasm/src/cc_bridge.cpp` — add instrument editing API:
  ```c
  void cc_set_instrument_byte(int inst, int byteIdx, uint8_t value);
  uint8_t cc_get_instrument_byte(int inst, int byteIdx);
  void cc_set_wave_table(int row, uint8_t val1, uint8_t val2);
  void cc_set_pulse_table(int row, uint8_t value);
  void cc_set_filter_table(int row, uint8_t value);
  ```
  These write directly to the 64KB RAM image at the correct offsets.

- `public/cheesecutter/CheeseCutter.worklet.js` — expose new message types
- `src/engine/cheesecutter/CheeseCutterEngine.ts` — add parameter editing methods
- Rebuild WASM: `cd cheesecutter-wasm/build && emcmake cmake .. && emmake make`

**Verification:**
- Edit ADSR on a CheeseCutter instrument → hear the change immediately
- Edit table entries → hear the change on next table execution

### Phase 6: Polish & Unification
**Goal:** Final visual polish, consistent styling, feature parity.

- Ensure all 3 adapters expose SID monitor
- Shared keyboard shortcuts for table editing
- Format-specific color accents (GTU=cyan, CC=amber, SidMon=pink)
- Sound Designer tab shared where applicable
- Responsive layout for different panel sizes

## Success Criteria

### Automated
- `npm run type-check` passes
- No console errors when switching between formats

### Manual
- Load .sng (GTUltra) → editor shows all tabs, tables editable, SID monitor live
- Load .ct (CheeseCutter) → editor shows ADSR + tables (read-only in Phase 3, editable after Phase 5)
- Load .sd2 (SidMon) → editor shows all params, arpeggio table, PCM if applicable
- Switching instruments updates the editor immediately
- Parameter changes audible in real-time (GTU and SidMon)

## Estimated Scope
- Phase 1: ~200 lines extracted/refactored
- Phase 2: ~300 lines (adapter interface + GTU adapter + unified shell)
- Phase 3: ~150 lines (CC adapter + view integration)
- Phase 4: ~150 lines (SidMon adapter)
- Phase 5: ~100 lines C + rebuild + ~100 lines TS
- Phase 6: ~200 lines polish

**Total: ~1200 lines across 6 phases**
