/**
 * PixiDrumKitMapper — GL-native drum kit key mapper for the instrument editor.
 *
 * Displays a scrollable grid of MIDI notes (C1-B5, 60 notes) with:
 * - Note name labels on the left
 * - Assigned sample name + volume for mapped keys
 * - Click to select a slot; click again to assign a sample from available sample instruments
 * - Color-coded mappings based on sample ID
 *
 * DOM reference: src/components/instruments/editors/DrumKitEditor.tsx
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Graphics } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import {
  PixiLabel,
  PixiButton,
  PixiScrollView,
  PixiSelect,
  PixiSlider,
  type SelectOption,
} from '../../components';
import { useInstrumentStore } from '@stores';
import type { InstrumentConfig, DrumKitKeyMapping, DrumKitConfig } from '@typedefs/instrument';

// ── Constants ──────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const ROW_H = 28;
const NOTE_COL_W = 52;
const MIN_NOTE = 24; // C1
const MAX_NOTE = 83; // B5
const NOTE_COUNT = MAX_NOTE - MIN_NOTE + 1;

// Mapping colors (used to tint rows for assigned keys)
const MAPPING_COLORS = [
  0xef4444, 0xf97316, 0xf59e0b, 0xeab308, 0x84cc16,
  0x22c55e, 0x10b981, 0x14b8a6, 0x06b6d4, 0x0ea5e9,
  0x3b82f6, 0x6366f1, 0x8b5cf6, 0xa855f7, 0xd946ef,
  0xec4899, 0xf43f5e,
];

function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[midi % 12]}${octave}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

function getMappingColor(sampleId: string): number {
  return MAPPING_COLORS[hashString(sampleId) % MAPPING_COLORS.length];
}

// ── Types ──────────────────────────────────────────────────────────────────

interface PixiDrumKitMapperProps {
  instrument: InstrumentConfig;
  width: number;
  height: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export const PixiDrumKitMapper: React.FC<PixiDrumKitMapperProps> = ({
  instrument,
  width,
  height,
}) => {
  const theme = usePixiTheme();
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);
  const instruments = useInstrumentStore((s) => s.instruments);

  const drumKit: DrumKitConfig = instrument.drumKit || {
    keymap: [],
    polyphony: 'poly',
    maxVoices: 8,
    noteCut: false,
  };

  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const [assignMode, setAssignMode] = useState(false);
  const drumKitRef = useRef(drumKit);
  drumKitRef.current = drumKit;

  // Sample instruments available for assignment
  const sampleOptions: SelectOption[] = useMemo(() => {
    return instruments
      .filter((inst) => inst.type === 'sample' && inst.sample?.url)
      .map((inst) => ({
        value: String(inst.id),
        label: inst.name,
      }));
  }, [instruments]);

  // Build a lookup: note -> mapping
  const noteToMapping = useMemo(() => {
    const map = new Map<number, DrumKitKeyMapping>();
    for (const m of drumKit.keymap) {
      for (let n = m.noteStart; n <= m.noteEnd; n++) {
        map.set(n, m);
      }
    }
    return map;
  }, [drumKit.keymap]);

  // Selected mapping
  const selectedMapping = selectedNote !== null ? noteToMapping.get(selectedNote) ?? null : null;

  // ── Callbacks ────────────────────────────────────────────────────────

  const handleNoteClick = useCallback((note: number) => {
    setSelectedNote((prev) => {
      if (prev === note) {
        // Toggle assign mode if clicking same note
        setAssignMode((am) => !am);
        return note;
      }
      setAssignMode(false);
      return note;
    });
  }, []);

  const handleAssignSample = useCallback((sampleIdStr: string) => {
    if (selectedNote === null) return;
    const sampleInst = instruments.find((i) => String(i.id) === sampleIdStr);
    if (!sampleInst?.sample) return;

    const dk = drumKitRef.current;
    // Remove any existing mapping that covers this note
    const filtered = dk.keymap.filter(
      (m) => !(selectedNote >= m.noteStart && selectedNote <= m.noteEnd),
    );

    const newMapping: DrumKitKeyMapping = {
      id: `mapping-${Date.now()}-${Math.random()}`,
      noteStart: selectedNote,
      noteEnd: selectedNote,
      sampleId: sampleIdStr,
      sampleUrl: sampleInst.sample.url,
      sampleName: sampleInst.name,
      pitchOffset: 0,
      fineTune: 0,
      volumeOffset: 0,
      panOffset: 0,
    };

    updateInstrument(instrument.id, {
      drumKit: { ...dk, keymap: [...filtered, newMapping] },
    });
    setAssignMode(false);
  }, [selectedNote, instruments, instrument.id, updateInstrument]);

  const handleRemoveMapping = useCallback(() => {
    if (selectedNote === null) return;
    const dk = drumKitRef.current;
    const filtered = dk.keymap.filter(
      (m) => !(selectedNote >= m.noteStart && selectedNote <= m.noteEnd),
    );
    updateInstrument(instrument.id, {
      drumKit: { ...dk, keymap: filtered },
    });
  }, [selectedNote, instrument.id, updateInstrument]);

  const handleUpdateMappingVolume = useCallback((vol: number) => {
    if (!selectedMapping) return;
    const dk = drumKitRef.current;
    const updated = dk.keymap.map((m) =>
      m.id === selectedMapping.id ? { ...m, volumeOffset: vol } : m,
    );
    updateInstrument(instrument.id, {
      drumKit: { ...dk, keymap: updated },
    });
  }, [selectedMapping, instrument.id, updateInstrument]);

  const handleUpdateMappingPitch = useCallback((pitch: number) => {
    if (!selectedMapping) return;
    const dk = drumKitRef.current;
    const updated = dk.keymap.map((m) =>
      m.id === selectedMapping.id ? { ...m, pitchOffset: pitch } : m,
    );
    updateInstrument(instrument.id, {
      drumKit: { ...dk, keymap: updated },
    });
  }, [selectedMapping, instrument.id, updateInstrument]);

  // ── Draw the grid background ─────────────────────────────────────────

  const gridW = Math.max(200, width - NOTE_COL_W - 16);

  const drawGrid = useCallback((g: Graphics) => {
    g.clear();
    for (let i = 0; i < NOTE_COUNT; i++) {
      const note = MAX_NOTE - i;
      const y = i * ROW_H;
      const isBlack = BLACK_KEYS.has(note % 12);
      const mapping = noteToMapping.get(note);
      const isSelected = note === selectedNote;

      // Row background
      if (isSelected) {
        g.rect(0, y, gridW, ROW_H).fill({ color: theme.accent.color, alpha: 0.18 });
      } else if (mapping) {
        g.rect(0, y, gridW, ROW_H).fill({ color: getMappingColor(mapping.sampleId), alpha: 0.1 });
      } else if (isBlack) {
        g.rect(0, y, gridW, ROW_H).fill({ color: theme.bg.color, alpha: 0.4 });
      }

      // Left color stripe for mapped notes
      if (mapping) {
        g.rect(0, y, 3, ROW_H).fill({ color: getMappingColor(mapping.sampleId), alpha: 0.8 });
      }

      // Row border
      g.rect(0, y + ROW_H - 1, gridW, 1).fill({ color: theme.border.color, alpha: 0.3 });

      // Octave separator
      if (note % 12 === 0) {
        g.rect(0, y, gridW, 1).fill({ color: theme.accent.color, alpha: 0.25 });
      }
    }

    // Selection highlight border
    if (selectedNote !== null) {
      const idx = MAX_NOTE - selectedNote;
      const y = idx * ROW_H;
      g.rect(0, y, gridW, ROW_H).stroke({ color: theme.accent.color, width: 1, alpha: 0.6 });
    }
  }, [noteToMapping, selectedNote, gridW, theme]);

  // ── Render ───────────────────────────────────────────────────────────

  const TOOLBAR_H = 36;
  const DETAIL_H = selectedMapping ? 80 : 0;
  const SCROLL_H = height - TOOLBAR_H - DETAIL_H - 8;
  const totalGridH = NOTE_COUNT * ROW_H;

  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column', gap: 4 }}>
      {/* Toolbar */}
      <layoutContainer
        layout={{
          height: TOOLBAR_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 8,
          paddingRight: 8,
          backgroundColor: theme.bgTertiary?.color ?? 0x1a1a1a,
          borderRadius: 4,
        }}
      >
        <PixiLabel
          text={`Keymap: ${drumKit.keymap.length} mappings`}
          size="sm"
          weight="semibold"
          color="textSecondary"
        />
        <layoutContainer layout={{ flex: 1 }} />
        {selectedNote !== null && (
          <>
            <PixiLabel
              text={midiToNoteName(selectedNote)}
              size="sm"
              weight="bold"
              color="accent"
            />
            {!selectedMapping && sampleOptions.length > 0 && (
              <PixiButton
                label="Assign Sample"
                variant="default"
                size="sm"
                onClick={() => setAssignMode(true)}
              />
            )}
            {selectedMapping && (
              <PixiButton
                label="Remove"
                variant="ghost"
                size="sm"
                icon="close"
                onClick={handleRemoveMapping}
              />
            )}
          </>
        )}
      </layoutContainer>

      {/* Assign sample dropdown (shown when assigning) */}
      {assignMode && selectedNote !== null && sampleOptions.length > 0 && (
        <layoutContainer
          layout={{
            height: 32,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          <PixiLabel text="Assign:" size="xs" color="textMuted" />
          <PixiSelect
            options={sampleOptions}
            value=""
            onChange={handleAssignSample}
            width={220}
            placeholder="Choose sample..."
          />
          <PixiButton
            label="Cancel"
            variant="ghost"
            size="sm"
            onClick={() => setAssignMode(false)}
          />
        </layoutContainer>
      )}

      {/* Scrollable key grid */}
      <PixiScrollView
        width={width}
        height={SCROLL_H}
        contentHeight={totalGridH}
      >
        <layoutContainer layout={{ flexDirection: 'row', width, height: totalGridH }}>
          {/* Note labels column */}
          <layoutContainer layout={{ width: NOTE_COL_W, height: totalGridH, flexDirection: 'column' }}>
            {Array.from({ length: NOTE_COUNT }, (_, i) => {
              const note = MAX_NOTE - i;
              const mapping = noteToMapping.get(note);
              const isBlack = BLACK_KEYS.has(note % 12);
              const isSelected = note === selectedNote;
              return (
                <layoutContainer
                  key={note}
                  layout={{
                    height: ROW_H,
                    width: NOTE_COL_W,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected
                      ? theme.accent.color
                      : isBlack
                        ? (theme.bgTertiary?.color ?? 0x1a1a1a)
                        : 0x00000000,
                    borderRadius: 2,
                  }}
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => handleNoteClick(note)}
                >
                  <PixiLabel
                    text={midiToNoteName(note)}
                    size="xs"
                    weight={mapping ? 'bold' : 'regular'}
                    color={isSelected ? 'textSecondary' : mapping ? 'accent' : isBlack ? 'textMuted' : 'text'}
                  />
                </layoutContainer>
              );
            })}
          </layoutContainer>

          {/* Grid area with graphics overlay + clickable rows */}
          <layoutContainer layout={{ flex: 1, height: totalGridH, position: 'relative' }}>
            <pixiGraphics
              draw={drawGrid}
              layout={{ width: gridW, height: totalGridH, position: 'absolute' }}
            />
            {/* Clickable rows with sample info labels */}
            <layoutContainer layout={{ width: gridW, height: totalGridH, flexDirection: 'column', position: 'absolute' }}>
              {Array.from({ length: NOTE_COUNT }, (_, i) => {
                const note = MAX_NOTE - i;
                const mapping = noteToMapping.get(note);
                return (
                  <layoutContainer
                    key={note}
                    layout={{
                      height: ROW_H,
                      width: gridW,
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingLeft: 10,
                      gap: 8,
                    }}
                    eventMode="static"
                    cursor="pointer"
                    onPointerUp={() => handleNoteClick(note)}
                  >
                    {mapping && (
                      <>
                        <PixiLabel
                          text={mapping.sampleName ?? 'Sample'}
                          size="xs"
                          color="text"
                        />
                        {mapping.pitchOffset !== 0 && (
                          <PixiLabel
                            text={`${mapping.pitchOffset > 0 ? '+' : ''}${mapping.pitchOffset}st`}
                            size="xs"
                            color="accent"
                          />
                        )}
                        {mapping.volumeOffset !== 0 && (
                          <PixiLabel
                            text={`${mapping.volumeOffset > 0 ? '+' : ''}${mapping.volumeOffset}dB`}
                            size="xs"
                            color="textMuted"
                          />
                        )}
                      </>
                    )}
                  </layoutContainer>
                );
              })}
            </layoutContainer>
          </layoutContainer>
        </layoutContainer>
      </PixiScrollView>

      {/* Detail panel for selected mapping */}
      {selectedMapping && (
        <layoutContainer
          layout={{
            height: DETAIL_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            paddingLeft: 12,
            paddingRight: 12,
            backgroundColor: theme.bgTertiary?.color ?? 0x1a1a1a,
            borderRadius: 4,
          }}
        >
          <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
            <PixiLabel text={selectedMapping.sampleName ?? 'Sample'} size="sm" weight="bold" color="text" />
            <PixiLabel text={`Note: ${midiToNoteName(selectedNote!)}`} size="xs" color="textMuted" />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: 140 }}>
            <PixiLabel text={`Pitch: ${selectedMapping.pitchOffset}st`} size="xs" color="textMuted" />
            <PixiSlider
              value={selectedMapping.pitchOffset}
              min={-24}
              max={24}
              step={1}
              onChange={handleUpdateMappingPitch}
              orientation="horizontal"
              length={120}
              thickness={4}
            />
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'column', gap: 2, width: 140 }}>
            <PixiLabel text={`Volume: ${selectedMapping.volumeOffset}dB`} size="xs" color="textMuted" />
            <PixiSlider
              value={selectedMapping.volumeOffset}
              min={-24}
              max={12}
              step={1}
              onChange={handleUpdateMappingVolume}
              orientation="horizontal"
              length={120}
              thickness={4}
            />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
