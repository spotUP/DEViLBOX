---
date: 2026-04-04
topic: musicline-editor-improvements
tags: [musicline, editor, plan]
status: draft
---

# MusicLine Editor Improvements Plan

Based on deep audit of original Mline116.asm (32790 lines of 68k assembly).

## Priority 1 — Fix Current Broken Behavior

### P1.1: Follow Selected Channel (not channel 0)
Currently the pattern editor always scrolls following channel 0's row. The real MusicLine follows the **user's selected channel**. When the user clicks a channel column, that channel drives the scroll.

**Files:** `useMusicLineFormatData.ts`, `TrackerView.tsx`
**What:** Track which channel is selected (click handler on channel headers). Pass that channel's row as `formatCurrentRow` to the FormatPlaybackState driver. Each per-channel PatternEditorCanvas still shows its own pattern, but the global view centers on the selected channel's row.
**Effort:** Small

### P1.2: Channel Status Display
The original shows a per-channel status row above the tune list: tune position, part number, step position, transpose per channel. We have none of this.

**Files:** `TrackerView.tsx` (MusicLine section)
**What:** Add a small status bar above the track table matrix showing per-channel info from wasmPositionStore (channelPositions, channelRows). Simple HTML row with 8 columns.
**Effort:** Small

## Priority 2 — Tune List Editor Improvements

### P2.1: Special Commands (Wait/Jump/End)
The tune list entries can be: normal pattern+transpose, Wait (hold), Jump (loop), or End (stop channel). Currently we only display normal entries. Need to display and edit special commands.

**Files:** `MusicLineTrackTableEditor.tsx`, `musiclineAdapter.ts`
**What:** Decode bit 5-7 of tune entry to detect Wait/Jump/End. Display with special characters (W/J/E). Allow insertion via keyboard shortcuts.
**Effort:** Medium

### P2.2: Insert/Delete Tune Lines
The original supports Insert (shift entries down) and Delete (shift entries up) per-channel or all channels.

**Files:** `MusicLineTrackTableEditor.tsx`, `useFormatStore.ts`
**What:** Add keyboard handlers for Return (insert) and Backspace (delete). With Shift = all channels.
**Effort:** Small

## Priority 3 — Instrument Editor

### P3.1: Full 11-Module Instrument Editor
The original has 11 instrument effect modules, each with enable/disable and specific parameters. Our current MusicLine instrument editor likely only has basic params.

**Modules to implement:**
1. ADSR Envelope (Attack/Decay/Sustain/Release — each with Length, Speed, Volume)
2. Vibrato (Dir, Wave, Speed, Delay, Attack, Depth)
3. Tremolo (same as vibrato)
4. Arpeggio (table ref, speed, groove)
5. Loop (Start, Repeat, RepEnd, Length, LpStep, Wait, Delay, Turns)
6. Transform (5 waveform targets + speed)
7. Phase (type + speed)
8. Mix (waveform + speed)
9. Resonance (amp, filter boost)
10. Filter (type, speed)

**Files:** New `MusicLineInstrumentEditor.tsx` or extend existing controls
**What:** Panel with 11 collapsible sections, each with enable checkbox and parameter knobs/inputs. Read/write via WASM inst_* getters/setters.
**Effort:** Large

### P3.2: Arpeggio Table Editor
128 rows x 6 bytes per table, up to 256 tables. Each row: Note + WaveSample + 2 sub-effects.

**Files:** New component or extend existing
**What:** Scrollable grid editor similar to pattern editor but for arpeggio data. 12 visible rows, 6 columns. Read/write via WASM arp_* getters/setters.
**Effort:** Medium

## Priority 4 — Pattern Editor Polish

### P4.1: Playback Follow Modes
Original has 3 modes: no follow, follow pattern, follow tune position. And a "Follow Channel" toggle that makes the pattern view switch to show what the active channel is playing.

**Files:** `useMusicLineFormatData.ts`, `TrackerView.tsx`
**What:** Add toggle button for follow mode. When following, show the selected channel's current part. When not following, show the edit position.
**Effort:** Small

### P4.2: Block Mark Mode
Original has RAmiga+B to enter mark mode, then cursor to select region, then cut/copy/paste. Our PatternEditorCanvas already has block selection — just needs to work in MusicLine format mode.

**Files:** Already handled by PatternEditorCanvas block selection
**What:** Verify block operations work in format mode. May already work.
**Effort:** Verify only

### P4.3: Transpose Operations
Original has transpose all notes up/down (semitone/octave) and transpose selected instrument only.

**Files:** PatternEditorCanvas already has transpose in context menu
**What:** Verify transpose works in format mode for MusicLine patterns. Add "transpose selected instrument" option if missing.
**Effort:** Small

## Execution Order

1. P1.1 — Follow selected channel (fixes scroll behavior)
2. P1.2 — Channel status display (quick visual win)
3. P2.1 — Special commands in tune list
4. P2.2 — Insert/delete tune lines
5. P4.1 — Playback follow modes
6. P3.1 — Full instrument editor (biggest item)
7. P3.2 — Arpeggio editor
8. P4.2 — Verify block operations
9. P4.3 — Verify transpose

## Success Criteria
- Pattern editor scrolls following the user's selected channel
- Per-channel status visible during playback
- Tune list shows and allows editing of Wait/Jump/End commands
- All 11 instrument modules editable
- Arpeggio tables editable
