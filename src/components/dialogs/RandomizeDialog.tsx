/**
 * RandomizeDialog - General-purpose pattern randomizer with toggleable parameters
 */

import React, { useState, useCallback } from 'react';
import { Dices, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { ALL_SCALES, getScaleName, noteNameToMidi, type Scale } from '@lib/generators/acidPatternGenerator';
import { midiToXMNote } from '@lib/xmConversions';
import type { TrackerCell } from '@typedefs/tracker';

interface RandomizeDialogProps {
  channelIndex: number;
  onClose: () => void;
}

/** Check if a channel has any non-empty rows */
function channelHasData(rows: { note: number; instrument: number; volume: number; effTyp: number; eff: number }[]): boolean {
  return rows.some(
    (cell) => cell.note !== 0 || cell.instrument !== 0 || cell.effTyp !== 0 || cell.eff !== 0
  );
}

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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomPattern(
  patternLength: number,
  density: number,
  params: {
    noteEnabled: boolean;
    scale: Scale;
    rootNote: string;
    octaveEnabled: boolean;
    octaveMin: number;
    octaveMax: number;
    instrumentEnabled: boolean;
    instrumentMin: number;
    instrumentMax: number;
    volumeEnabled: boolean;
    volumeMin: number;
    volumeMax: number;
    accentEnabled: boolean;
    accentDensity: number;
    slideEnabled: boolean;
    slideDensity: number;
    effectsEnabled: boolean;
  }
): TrackerCell[] {
  const scaleIntervals = SCALES_DATA[params.scale];
  const rootMidi = noteNameToMidi(params.rootNote + '0'); // We add octave separately

  const rows: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    // Density check — should this row have a note?
    if (Math.random() * 100 >= density) {
      rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      continue;
    }

    // Note
    let note = 0;
    if (params.noteEnabled) {
      const octave = params.octaveEnabled
        ? randomInt(params.octaveMin, params.octaveMax)
        : 3;
      const degree = randomInt(0, scaleIntervals.length - 1);
      const midiNote = rootMidi + scaleIntervals[degree] + octave * 12;
      note = midiToXMNote(Math.max(0, Math.min(127, midiNote)));
    } else {
      // Fixed middle C if notes disabled
      note = midiToXMNote(60);
    }

    // Instrument
    const instrument = params.instrumentEnabled
      ? randomInt(params.instrumentMin, params.instrumentMax)
      : 0;

    // Volume (XM volume column: 0x10 = vol 0, 0x50 = vol 64)
    let volume = 0;
    if (params.volumeEnabled) {
      const vol = randomInt(params.volumeMin, params.volumeMax);
      volume = 0x10 + vol;
    }

    // Accent flag
    const flag1 = params.accentEnabled && Math.random() * 100 < params.accentDensity ? 1 : undefined;

    // Slide flag
    const flag2 = params.slideEnabled && Math.random() * 100 < params.slideDensity ? 2 : undefined;

    // Effects
    let effTyp = 0;
    let eff = 0;
    if (params.effectsEnabled) {
      const commonEffects = [
        { type: 0x0A, paramFn: () => randomInt(1, 15) << 4 },         // Volume slide up
        { type: 0x0A, paramFn: () => randomInt(1, 15) },               // Volume slide down
        { type: 0x0C, paramFn: () => randomInt(0x10, 0x40) },          // Set volume
        { type: 0x00, paramFn: () => randomInt(1, 7) << 4 | randomInt(1, 7) }, // Arpeggio
      ];
      if (Math.random() < 0.3) {
        const fx = commonEffects[randomInt(0, commonEffects.length - 1)];
        effTyp = fx.type;
        eff = fx.paramFn();
      }
    }

    rows.push({
      note,
      instrument,
      volume,
      effTyp,
      eff,
      effTyp2: 0,
      eff2: 0,
      flag1,
      flag2,
    });
  }

  return rows;
}

export const RandomizeDialog: React.FC<RandomizeDialogProps> = ({
  channelIndex: initialChannelIndex,
  onClose,
}) => {
  const { patterns, currentPatternIndex, setChannelRows } = useTrackerStore();
  const currentPattern = patterns[currentPatternIndex];

  const [selectedChannel, setSelectedChannel] = useState(initialChannelIndex);
  const channel = currentPattern?.channels[selectedChannel];

  // Overwrite confirmation
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<'apply' | 'randomize' | null>(null);

  // Main parameters
  const [density, setDensity] = useState(50);

  // Toggleable parameter sections
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

  const doGenerate = useCallback(() => {
    if (!channel || !currentPattern) return;
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
  }, [
    channel, currentPattern, density, selectedChannel, setChannelRows,
    noteEnabled, scale, rootNote,
    octaveEnabled, octaveMin, octaveMax,
    instrumentEnabled, instrumentMin, instrumentMax,
    volumeEnabled, volumeMin, volumeMax,
    accentEnabled, accentDensity,
    slideEnabled, slideDensity,
    effectsEnabled,
  ]);

  const checkOverwriteAndDo = useCallback((action: 'apply' | 'randomize') => {
    if (!channel) return;
    if (channelHasData(channel.rows)) {
      setPendingAction(action);
      setShowOverwriteConfirm(true);
      return;
    }
    doGenerate();
    if (action === 'apply') onClose();
  }, [channel, doGenerate, onClose]);

  const handleConfirmOverwrite = useCallback(() => {
    setShowOverwriteConfirm(false);
    doGenerate();
    if (pendingAction === 'apply') onClose();
    setPendingAction(null);
  }, [doGenerate, onClose, pendingAction]);

  if (!currentPattern) return null;

  // Overwrite confirmation
  if (showOverwriteConfirm) {
    return (
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
        onClick={() => { setShowOverwriteConfirm(false); setPendingAction(null); }}
      >
        <div
          className="bg-dark-bgSecondary border-2 border-accent-warning rounded-lg shadow-2xl w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-ft2-border bg-accent-warning/10">
            <AlertTriangle size={20} className="text-accent-warning" />
            <h3 className="font-bold text-ft2-text">Overwrite Channel?</h3>
          </div>
          <div className="px-4 py-4 text-sm text-ft2-textDim">
            Channel {(selectedChannel + 1).toString().padStart(2, '0')} already contains note data.
            Randomizing will replace all existing data in this channel.
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-ft2-border">
            <button
              onClick={() => { setShowOverwriteConfirm(false); setPendingAction(null); }}
              className="px-4 py-2 bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmOverwrite}
              className="px-4 py-2 bg-accent-warning hover:bg-accent-warning/80 text-black rounded transition-colors font-medium"
            >
              Overwrite
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectClass = "w-full px-3 py-1.5 bg-dark-bgTertiary text-ft2-text border border-ft2-border rounded focus:outline-none focus:ring-2 focus:ring-accent-primary text-sm";
  const checkboxClass = "accent-accent-primary";

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-bgSecondary border-2 border-ft2-border rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ft2-border bg-ft2-header">
          <div className="flex items-center gap-2">
            <Dices size={18} className="text-accent-primary" />
            <h2 className="text-lg font-bold text-ft2-text">Randomize</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-dark-bgHover rounded transition-colors text-ft2-textDim hover:text-ft2-text"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-dark-bg">
          {/* Channel selector */}
          <div>
            <label className="block text-sm font-medium mb-1 text-ft2-text">Channel</label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(parseInt(e.target.value))}
              className={selectClass}
            >
              {currentPattern.channels.map((ch, idx) => (
                <option key={ch.id} value={idx}>
                  {(idx + 1).toString().padStart(2, '0')}: {ch.name}
                  {channelHasData(ch.rows) ? ' *' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Density */}
          <div>
            <label className="block text-sm font-medium mb-1 text-ft2-text">
              Density: <span className="font-mono text-accent-primary">{density}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={density}
              onChange={(e) => setDensity(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Parameter rows */}
          <div className="space-y-2">
            {/* Note */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={noteEnabled} onChange={(e) => setNoteEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Note</span>
              <div className="flex-1 flex gap-2">
                <select
                  value={scale}
                  onChange={(e) => setScale(e.target.value as Scale)}
                  className={selectClass}
                  disabled={!noteEnabled}
                >
                  {ALL_SCALES.map((s) => (
                    <option key={s} value={s}>{getScaleName(s)}</option>
                  ))}
                </select>
                <select
                  value={rootNote}
                  onChange={(e) => setRootNote(e.target.value)}
                  className={`${selectClass} w-20 shrink-0`}
                  disabled={!noteEnabled}
                >
                  {ROOT_NOTES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Octave */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={octaveEnabled} onChange={(e) => setOctaveEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Octave</span>
              <div className="flex-1 flex items-center gap-2 text-sm text-ft2-textDim">
                <span>Min</span>
                <input
                  type="number" min={0} max={7} value={octaveMin}
                  onChange={(e) => setOctaveMin(Math.min(parseInt(e.target.value) || 0, octaveMax))}
                  className="w-14 px-2 py-1 bg-dark-bg text-ft2-text border border-ft2-border rounded text-center"
                  disabled={!octaveEnabled}
                />
                <span>Max</span>
                <input
                  type="number" min={0} max={7} value={octaveMax}
                  onChange={(e) => setOctaveMax(Math.max(parseInt(e.target.value) || 0, octaveMin))}
                  className="w-14 px-2 py-1 bg-dark-bg text-ft2-text border border-ft2-border rounded text-center"
                  disabled={!octaveEnabled}
                />
              </div>
            </div>

            {/* Instrument */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={instrumentEnabled} onChange={(e) => setInstrumentEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Instr</span>
              <div className="flex-1 flex items-center gap-2 text-sm text-ft2-textDim">
                <span>Min</span>
                <input
                  type="number" min={1} max={128} value={instrumentMin}
                  onChange={(e) => setInstrumentMin(Math.min(parseInt(e.target.value) || 1, instrumentMax))}
                  className="w-14 px-2 py-1 bg-dark-bg text-ft2-text border border-ft2-border rounded text-center"
                  disabled={!instrumentEnabled}
                />
                <span>Max</span>
                <input
                  type="number" min={1} max={128} value={instrumentMax}
                  onChange={(e) => setInstrumentMax(Math.max(parseInt(e.target.value) || 1, instrumentMin))}
                  className="w-14 px-2 py-1 bg-dark-bg text-ft2-text border border-ft2-border rounded text-center"
                  disabled={!instrumentEnabled}
                />
              </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={volumeEnabled} onChange={(e) => setVolumeEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Volume</span>
              <div className="flex-1 flex items-center gap-2 text-sm text-ft2-textDim">
                <span>Min</span>
                <input
                  type="number" min={0} max={64} value={volumeMin}
                  onChange={(e) => setVolumeMin(Math.min(parseInt(e.target.value) || 0, volumeMax))}
                  className="w-14 px-2 py-1 bg-dark-bg text-ft2-text border border-ft2-border rounded text-center"
                  disabled={!volumeEnabled}
                />
                <span>Max</span>
                <input
                  type="number" min={0} max={64} value={volumeMax}
                  onChange={(e) => setVolumeMax(Math.max(parseInt(e.target.value) || 0, volumeMin))}
                  className="w-14 px-2 py-1 bg-dark-bg text-ft2-text border border-ft2-border rounded text-center"
                  disabled={!volumeEnabled}
                />
              </div>
            </div>

            {/* Accent */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={accentEnabled} onChange={(e) => setAccentEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Accent</span>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range" min="0" max="100" value={accentDensity}
                  onChange={(e) => setAccentDensity(parseInt(e.target.value))}
                  className="flex-1"
                  disabled={!accentEnabled}
                />
                <span className="text-xs font-mono text-accent-primary w-10 text-right">{accentDensity}%</span>
              </div>
            </div>

            {/* Slide */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={slideEnabled} onChange={(e) => setSlideEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Slide</span>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range" min="0" max="100" value={slideDensity}
                  onChange={(e) => setSlideDensity(parseInt(e.target.value))}
                  className="flex-1"
                  disabled={!slideEnabled}
                />
                <span className="text-xs font-mono text-accent-primary w-10 text-right">{slideDensity}%</span>
              </div>
            </div>

            {/* Effects */}
            <div className="flex items-center gap-3 p-2 bg-dark-bgTertiary rounded">
              <input type="checkbox" checked={effectsEnabled} onChange={(e) => setEffectsEnabled(e.target.checked)} className={checkboxClass} />
              <span className="text-sm text-ft2-text w-16 shrink-0">Effects</span>
              <span className="text-xs text-ft2-textDim">Random from common types (arpeggio, vol slide, etc.)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-ft2-border bg-dark-bgTertiary">
          <button
            onClick={() => checkOverwriteAndDo('randomize')}
            className="flex items-center gap-2 px-3 py-2 bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded transition-colors"
          >
            <RefreshCw size={14} />
            Randomize
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => checkOverwriteAndDo('apply')}
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white rounded transition-colors font-medium"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
