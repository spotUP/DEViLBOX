---
date: 2026-04-04
topic: gtultra-instrument-editor-improvements
tags: [gtultra, sid, instrument-editor]
status: actionable
---

# GTUltra Instrument Editor — Pending Improvements

## Context
Two agents ran on GTUltraControls.tsx simultaneously and overwrote each other.
Neither agent's full changes persisted. The file is back to its original 415-line state.

## What needs to be done (single clean pass on GTUltraControls.tsx):

### 1. Add "Tables" tab (from table migration agent)
- Third tab: Instrument | Tables | SID Monitor
- Tables tab has 4 sub-tabs: Wave/Pulse/Filter/Speed
- Each shows PatternEditorCanvas with 255 rows × 2 columns (L/R hex bytes)
- Colors: Wave=#60e060, Pulse=#ff8866, Filter=#ffcc00, Speed=#6699ff
- Read from useGTUltraStore → tableData.wave/.pulse/.filter/.speed
- Write via engine.setTableEntry()
- Auto-scroll to current instrument's table pointer (wavePtr/pulsePtr/etc.)
- Column defs: use makeTableColumns() from gtuAdapter.ts

### 2. Remove table channels from pattern view
- gtuAdapter.ts: remove table channel appending in gtUltraToFormatChannels()
- useGTUltraFormatData.ts: remove tableData from the channel building

### 3. Hard-Restart Control
- gatetimer bits 6-7:
  - Bit 6 (0x40): hard-restart disabled when set
  - Bit 7 (0x80): hard-restart immediate when set
- Add checkboxes: "Hard Restart" (inverted bit 6), "Immediate" (bit 7)
- Gate timer value = lower 6 bits only (0-63)

### 4. Panning
- pan field: upper nibble = min, lower nibble = max (0-F each)
- Add two hex inputs or small sliders
- 0=Left, 8=Center, F=Right
- Already added to GTUltraConfig, DEFAULT_GTULTRA, and store

### 5. SID Waveform Extras
- firstwave bits 1-3:
  - Bit 1 (0x02): Sync
  - Bit 2 (0x04): Ring Mod
  - Bit 3 (0x08): Test Bit
- Add three checkboxes below existing TRI/SAW/PUL/NOI buttons

### 6. Pattern Effect Cheatsheet
- Collapsible reference panel:
  ```
  0=NOP 1=PortaUp 2=PortaDn 3=TonePorta
  4=Vib 5=SetAD 6=SetSR 7=SetWave
  8=WavP 9=PulP A=FilP B=FilCtrl
  C=Cutoff D=MasVol E=Funk F=Tempo
  ```

### 7. Table Command Reference
- In the Tables tab, collapsible panel:
  ```
  Wave: 01-0F=Delay 10-DF=Waveform E0-EF=Silent FF=Jump
  F0=NOP F1=PortaUp F2=PortaDn F3=TonePorta F4=Vib
  F5=SetAD F6=SetSR F7=SetWave F9=PulsePtr FA=FilterPtr
  FB=FilterCtrl FC=Cutoff FD=MasterVol
  ```

## Files to modify:
- `src/components/instruments/controls/GTUltraControls.tsx` — all 7 features above
- `src/components/gtultra/gtuAdapter.ts` — remove table channel logic
- `src/components/gtultra/useGTUltraFormatData.ts` — remove tableData from channels
