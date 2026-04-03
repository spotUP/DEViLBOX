/**
 * PixiRandomizeDialog — Full-featured GL-native pattern randomizer.
 * Matches DOM: src/components/dialogs/RandomizeDialog.tsx
 *
 * Features: channel selector, density slider, 7 toggleable parameter sections
 * (note/scale, octave range, instrument range, volume range, accent, slide, effects),
 * overwrite confirmation, randomize (keep open) + apply (close) buttons.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  PixiModal, PixiModalHeader, PixiModalFooter,
  PixiButton, PixiSlider, PixiCheckbox, PixiLabel, PixiSelect,
} from '../components';
import { PixiNumericInput } from '../components/PixiNumericInput';
import { PixiScrollView } from '../components/PixiScrollView';
import { usePixiTheme } from '../theme';
import { useTrackerStore } from '@stores';
import { midiToXMNote } from '@lib/xmConversions';
import { ALL_SCALES, getScaleName, noteNameToMidi, type Scale } from '@lib/generators/acidPatternGenerator';
import type { TrackerCell } from '@typedefs/tracker';
import type { SelectOption } from '../components/PixiSelect';

// ── Constants ────────────────────────────────────────────────────────────────

const MODAL_W = 480;
const MODAL_H = 520;
const CONTENT_W = MODAL_W - 32;
const ROW_W = CONTENT_W;

const SCALES_DATA: Record<Scale, number[]> = {
  'MINOR': [0, 2, 3, 5, 7, 8, 10],
  'MAJOR': [0, 2, 4, 5, 7, 9, 11],
  'DORIAN': [0, 2, 3, 5, 7, 9, 10],
  'MIXOLYDIAN': [0, 2, 4, 5, 7, 9, 10],
  'PHRYGIAN': [0, 1, 3, 5, 7, 8, 10],
  'HARMONIC_MINOR': [0, 2, 3, 5, 7, 8, 11],
  'PHRYGIAN_DOMINANT': [0, 1, 4, 5, 7, 8, 10],
  'MELODIC_MINOR': [0, 2, 3, 5, 7, 9, 11],
  'LYDIAN_DOMINANT': [0, 2, 4, 6, 7, 9, 10],
  'HUNGARIAN_MINOR': [0, 2, 3, 6, 7, 8, 11],
};

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALE_OPTIONS: SelectOption[] = ALL_SCALES.map(s => ({ value: s, label: getScaleName(s) }));
const ROOT_OPTIONS: SelectOption[] = ROOT_NOTES.map(n => ({ value: n, label: n }));

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function channelHasData(rows: { note: number; instrument: number; volume: number; effTyp: number; eff: number }[]): boolean {
  return rows.some(c => c.note !== 0 || c.instrument !== 0 || c.effTyp !== 0 || c.eff !== 0);
}

function generateRandomPattern(
  patternLength: number,
  density: number,
  params: {
    noteEnabled: boolean; scale: Scale; rootNote: string;
    octaveEnabled: boolean; octaveMin: number; octaveMax: number;
    instrumentEnabled: boolean; instrumentMin: number; instrumentMax: number;
    volumeEnabled: boolean; volumeMin: number; volumeMax: number;
    accentEnabled: boolean; accentDensity: number;
    slideEnabled: boolean; slideDensity: number;
    effectsEnabled: boolean;
  },
): TrackerCell[] {
  const scaleIntervals = SCALES_DATA[params.scale];
  const rootMidi = noteNameToMidi(params.rootNote + '0');
  const rows: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    if (Math.random() * 100 >= density) {
      rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      continue;
    }

    let note = 0;
    if (params.noteEnabled) {
      const octave = params.octaveEnabled ? randomInt(params.octaveMin, params.octaveMax) : 3;
      const degree = randomInt(0, scaleIntervals.length - 1);
      note = midiToXMNote(Math.max(0, Math.min(127, rootMidi + scaleIntervals[degree] + octave * 12)));
    } else {
      note = midiToXMNote(60);
    }

    const instrument = params.instrumentEnabled ? randomInt(params.instrumentMin, params.instrumentMax) : 0;

    let volume = 0;
    if (params.volumeEnabled) {
      volume = 0x10 + randomInt(params.volumeMin, params.volumeMax);
    }

    const flag1 = params.accentEnabled && Math.random() * 100 < params.accentDensity ? 1 : undefined;
    const flag2 = params.slideEnabled && Math.random() * 100 < params.slideDensity ? 2 : undefined;

    let effTyp = 0, eff = 0;
    if (params.effectsEnabled && Math.random() < 0.3) {
      const fxList = [
        { type: 0x0A, fn: () => randomInt(1, 15) << 4 },
        { type: 0x0A, fn: () => randomInt(1, 15) },
        { type: 0x0C, fn: () => randomInt(0x10, 0x40) },
        { type: 0x00, fn: () => randomInt(1, 7) << 4 | randomInt(1, 7) },
      ];
      const fx = fxList[randomInt(0, fxList.length - 1)];
      effTyp = fx.type;
      eff = fx.fn();
    }

    rows.push({ note, instrument, volume, effTyp, eff, effTyp2: 0, eff2: 0, flag1, flag2 });
  }
  return rows;
}

// ── Component ────────────────────────────────────────────────────────────────

interface PixiRandomizeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex?: number;
}

export const PixiRandomizeDialog: React.FC<PixiRandomizeDialogProps> = ({ isOpen, onClose, channelIndex: initialChannel = 0 }) => {
  const theme = usePixiTheme();
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const setChannelRows = useTrackerStore(s => s.setChannelRows);
  const currentPattern = patterns[currentPatternIndex];

  const [selectedChannel, setSelectedChannel] = useState(initialChannel);
  const [showOverwrite, setShowOverwrite] = useState(false);
  const [pendingAction, setPendingAction] = useState<'apply' | 'randomize' | null>(null);

  // Parameters — match DOM defaults
  const [density, setDensity] = useState(50);
  const [noteEnabled, setNoteEnabled] = useState(true);
  const [scale, setScale] = useState<Scale>('MINOR');
  const [rootNote, setRootNote] = useState('C');
  const [octaveEnabled, setOctaveEnabled] = useState(true);
  const [octaveMin, setOctaveMin] = useState(2);
  const [octaveMax, setOctaveMax] = useState(4);
  const [instrumentEnabled, setInstrumentEnabled] = useState(false);
  const [instrumentMin, setInstrumentMin] = useState(1);
  const [instrumentMax, setInstrumentMax] = useState(4);
  const [volumeEnabled, setVolumeEnabled] = useState(true);
  const [volumeMin, setVolumeMin] = useState(20);
  const [volumeMax, setVolumeMax] = useState(64);
  const [accentEnabled, setAccentEnabled] = useState(true);
  const [accentDensity, setAccentDensity] = useState(30);
  const [slideEnabled, setSlideEnabled] = useState(false);
  const [slideDensity, setSlideDensity] = useState(20);
  const [effectsEnabled, setEffectsEnabled] = useState(false);

  // Channel options
  const channelOptions: SelectOption[] = useMemo(() => {
    if (!currentPattern) return [];
    return currentPattern.channels.map((ch, idx) => ({
      value: String(idx),
      label: `${(idx + 1).toString().padStart(2, '0')}: ${ch.name}${channelHasData(ch.rows) ? ' *' : ''}`,
    }));
  }, [currentPattern]);

  const doGenerate = useCallback(() => {
    if (!currentPattern) return;
    const rows = generateRandomPattern(currentPattern.length, density, {
      noteEnabled, scale, rootNote,
      octaveEnabled, octaveMin, octaveMax,
      instrumentEnabled, instrumentMin, instrumentMax,
      volumeEnabled, volumeMin, volumeMax,
      accentEnabled, accentDensity,
      slideEnabled, slideDensity,
      effectsEnabled,
    });
    setChannelRows(selectedChannel, rows);
  }, [currentPattern, density, selectedChannel, setChannelRows,
    noteEnabled, scale, rootNote, octaveEnabled, octaveMin, octaveMax,
    instrumentEnabled, instrumentMin, instrumentMax, volumeEnabled, volumeMin, volumeMax,
    accentEnabled, accentDensity, slideEnabled, slideDensity, effectsEnabled]);

  const checkAndDo = useCallback((action: 'apply' | 'randomize') => {
    if (!currentPattern) return;
    const ch = currentPattern.channels[selectedChannel];
    if (ch && channelHasData(ch.rows)) {
      setPendingAction(action);
      setShowOverwrite(true);
      return;
    }
    doGenerate();
    if (action === 'apply') onClose();
  }, [currentPattern, selectedChannel, doGenerate, onClose]);

  const confirmOverwrite = useCallback(() => {
    setShowOverwrite(false);
    doGenerate();
    if (pendingAction === 'apply') onClose();
    setPendingAction(null);
  }, [doGenerate, onClose, pendingAction]);

  // Overwrite confirmation dialog
  if (showOverwrite) {
    return (
      <PixiModal isOpen={isOpen} onClose={() => { setShowOverwrite(false); setPendingAction(null); }} width={360} height={200}>
        <PixiModalHeader title="Overwrite Channel?" onClose={() => { setShowOverwrite(false); setPendingAction(null); }} />
        <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 8 }}>
          <PixiLabel
            text={`Channel ${(selectedChannel + 1).toString().padStart(2, '0')} already contains note data.`}
            size="sm" color="textSecondary"
          />
          <PixiLabel text="Randomizing will replace all existing data in this channel." size="sm" color="textMuted" />
        </layoutContainer>
        <PixiModalFooter align="right">
          <PixiButton label="Cancel" variant="ghost" onClick={() => { setShowOverwrite(false); setPendingAction(null); }} />
          <PixiButton label="Overwrite" variant="primary" onClick={confirmOverwrite} />
        </PixiModalFooter>
      </PixiModal>
    );
  }

  const scrollH = MODAL_H - 44 - 48 - 16; // header + footer + padding

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Randomize" onClose={onClose} />

      <PixiScrollView width={MODAL_W} height={scrollH} contentHeight={680} bgColor={theme.bg.color}>
        <layoutContainer layout={{ padding: 16, flexDirection: 'column', gap: 10, width: MODAL_W }}>
          {/* Channel selector */}
          <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
            <PixiLabel text="Channel" size="sm" weight="semibold" color="text" />
            <PixiSelect
              options={channelOptions}
              value={String(selectedChannel)}
              onChange={(v) => setSelectedChannel(parseInt(v))}
              width={CONTENT_W}
            />
          </layoutContainer>

          {/* Density */}
          <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
            <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
              <PixiLabel text="Density:" size="sm" weight="semibold" color="text" />
              <PixiLabel text={`${density}%`} size="sm" font="mono" color="accent" />
            </layoutContainer>
            <PixiSlider
              value={density} min={0} max={100} onChange={setDensity}
              orientation="horizontal" length={CONTENT_W} thickness={6} handleWidth={14} handleHeight={14}
            />
          </layoutContainer>

          {/* ── Parameter rows ─────────────────────────────────────────── */}

          {/* Note */}
          <ParamRow label="Note" enabled={noteEnabled} onToggle={setNoteEnabled}>
            <PixiSelect options={SCALE_OPTIONS} value={scale} onChange={(v) => setScale(v as Scale)} width={160} disabled={!noteEnabled} />
            <PixiSelect options={ROOT_OPTIONS} value={rootNote} onChange={setRootNote} width={60} disabled={!noteEnabled} />
          </ParamRow>

          {/* Octave */}
          <ParamRow label="Octave" enabled={octaveEnabled} onToggle={setOctaveEnabled}>
            <PixiLabel text="Min" size="xs" color="textMuted" />
            <PixiNumericInput value={octaveMin} min={0} max={7} step={1} width={44} onChange={(v) => setOctaveMin(Math.min(v, octaveMax))} disabled={!octaveEnabled} />
            <PixiLabel text="Max" size="xs" color="textMuted" />
            <PixiNumericInput value={octaveMax} min={0} max={7} step={1} width={44} onChange={(v) => setOctaveMax(Math.max(v, octaveMin))} disabled={!octaveEnabled} />
          </ParamRow>

          {/* Instrument */}
          <ParamRow label="Instr" enabled={instrumentEnabled} onToggle={setInstrumentEnabled}>
            <PixiLabel text="Min" size="xs" color="textMuted" />
            <PixiNumericInput value={instrumentMin} min={1} max={128} step={1} width={44} onChange={(v) => setInstrumentMin(Math.min(v, instrumentMax))} disabled={!instrumentEnabled} />
            <PixiLabel text="Max" size="xs" color="textMuted" />
            <PixiNumericInput value={instrumentMax} min={1} max={128} step={1} width={44} onChange={(v) => setInstrumentMax(Math.max(v, instrumentMin))} disabled={!instrumentEnabled} />
          </ParamRow>

          {/* Volume */}
          <ParamRow label="Volume" enabled={volumeEnabled} onToggle={setVolumeEnabled}>
            <PixiLabel text="Min" size="xs" color="textMuted" />
            <PixiNumericInput value={volumeMin} min={0} max={64} step={1} width={44} onChange={(v) => setVolumeMin(Math.min(v, volumeMax))} disabled={!volumeEnabled} />
            <PixiLabel text="Max" size="xs" color="textMuted" />
            <PixiNumericInput value={volumeMax} min={0} max={64} step={1} width={44} onChange={(v) => setVolumeMax(Math.max(v, volumeMin))} disabled={!volumeEnabled} />
          </ParamRow>

          {/* Accent */}
          <ParamRow label="Accent" enabled={accentEnabled} onToggle={setAccentEnabled}>
            <PixiSlider
              value={accentDensity} min={0} max={100} onChange={setAccentDensity}
              orientation="horizontal" length={180} thickness={4} handleWidth={10} handleHeight={10}
              disabled={!accentEnabled}
            />
            <PixiLabel text={`${accentDensity}%`} size="xs" font="mono" color="accent" />
          </ParamRow>

          {/* Slide */}
          <ParamRow label="Slide" enabled={slideEnabled} onToggle={setSlideEnabled}>
            <PixiSlider
              value={slideDensity} min={0} max={100} onChange={setSlideDensity}
              orientation="horizontal" length={180} thickness={4} handleWidth={10} handleHeight={10}
              disabled={!slideEnabled}
            />
            <PixiLabel text={`${slideDensity}%`} size="xs" font="mono" color="accent" />
          </ParamRow>

          {/* Effects */}
          <ParamRow label="Effects" enabled={effectsEnabled} onToggle={setEffectsEnabled}>
            <PixiLabel text="Random from common types (arpeggio, vol slide, etc.)" size="xs" color="textMuted" />
          </ParamRow>
        </layoutContainer>
      </PixiScrollView>

      <PixiModalFooter align="between">
        <PixiButton label="Randomize" variant="default" onClick={() => checkAndDo('randomize')} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
          <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
          <PixiButton label="Apply" variant="primary" onClick={() => checkAndDo('apply')} />
        </layoutContainer>
      </PixiModalFooter>
    </PixiModal>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

/** Toggleable parameter row — checkbox + label + controls */
const ParamRow: React.FC<{
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}> = ({ label, enabled, onToggle, children }) => {
  const theme = usePixiTheme();
  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        borderRadius: 4,
        backgroundColor: theme.bgTertiary.color,
        width: ROW_W,
      }}
    >
      <PixiCheckbox checked={enabled} onChange={onToggle} />
      <PixiLabel text={label} size="sm" color="text" layout={{ width: 52 }} />
      <layoutContainer layout={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {children}
      </layoutContainer>
    </layoutContainer>
  );
};
