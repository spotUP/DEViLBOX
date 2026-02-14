/**
 * AcidPatternGeneratorDialog - Generate random TB-303 acid patterns
 */

import React, { useState, useMemo, useCallback } from 'react';
import { generateAcidPattern, ALL_SCALES, getScaleName, type AcidPatternParams, type Scale } from '@lib/generators/acidPatternGenerator';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { Wand2, X, RefreshCw, AlertTriangle } from 'lucide-react';

interface AcidPatternGeneratorDialogProps {
  channelIndex: number;
  onClose: () => void;
}

/** Special value meaning "auto-create a new TB-303 instrument" */
const CREATE_NEW_303 = -1;

/** Check if a channel has any non-empty rows */
function channelHasData(rows: { note: number; instrument: number; volume: number; effTyp: number; eff: number }[]): boolean {
  return rows.some(
    (cell) => cell.note !== 0 || cell.instrument !== 0 || cell.effTyp !== 0 || cell.eff !== 0
  );
}

export const AcidPatternGeneratorDialog: React.FC<AcidPatternGeneratorDialogProps> = ({
  channelIndex: initialChannelIndex,
  onClose,
}) => {
  const { patterns, currentPatternIndex, setChannelRows } = useTrackerStore();
  const instruments = useInstrumentStore((s) => s.instruments);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);
  const currentPattern = patterns[currentPatternIndex];

  // Selectable channel
  const [selectedChannel, setSelectedChannel] = useState(initialChannelIndex);
  const channel = currentPattern?.channels[selectedChannel];

  // Overwrite confirmation state
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Default instrument selection: prefer existing 303, otherwise offer to create one
  const existing303 = useMemo(
    () => instruments.find((inst) => inst.synthType === 'TB303' || inst.synthType === 'Buzz3o3'),
    [instruments]
  );
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<number>(
    existing303?.id ?? CREATE_NEW_303
  );

  // Generator parameters
  const [density, setDensity] = useState(60);
  const [spread, setSpread] = useState(60);
  const [accentsDensity, setAccentsDensity] = useState(50);
  const [slidesDensity, setSlidesDensity] = useState(40);
  const [scale, setScale] = useState<Scale>('MINOR');
  const [rootNote, setRootNote] = useState('C2');

  const rootNotes = [
    'C1', 'C#1', 'D1', 'D#1', 'E1', 'F1', 'F#1', 'G1', 'G#1', 'A1', 'A#1', 'B1',
    'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
    'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  ];

  const doGenerate = useCallback(() => {
    if (!channel || !currentPattern) return;

    let acidInstrumentId = selectedInstrumentId;

    // Create a new TB-303 if needed
    if (acidInstrumentId === CREATE_NEW_303) {
      acidInstrumentId = createInstrument({
        name: 'TB-303',
        synthType: 'TB303',
      });
    }

    const params: AcidPatternParams = {
      patternLength: currentPattern.length,
      density,
      spread,
      accentsDensity,
      slidesDensity,
      scale,
      rootNote,
      instrumentId: acidInstrumentId,
    };

    const generatedRows = generateAcidPattern(params);
    setChannelRows(selectedChannel, generatedRows);
  }, [channel, currentPattern, selectedInstrumentId, createInstrument, density, spread, accentsDensity, slidesDensity, scale, rootNote, selectedChannel, setChannelRows]);

  const handleGenerate = useCallback(() => {
    if (!channel) return;

    // Check if channel has data and warn before overwriting
    if (channelHasData(channel.rows)) {
      setShowOverwriteConfirm(true);
      return;
    }

    doGenerate();
    onClose();
  }, [channel, doGenerate, onClose]);

  const handleConfirmOverwrite = useCallback(() => {
    setShowOverwriteConfirm(false);
    doGenerate();
    onClose();
  }, [doGenerate, onClose]);

  const handleRandomize = () => {
    setDensity(Math.floor(Math.random() * 60) + 40);
    setSpread(Math.floor(Math.random() * 60) + 40);
    setAccentsDensity(Math.floor(Math.random() * 60) + 20);
    setSlidesDensity(Math.floor(Math.random() * 60) + 20);
    setScale(ALL_SCALES[Math.floor(Math.random() * ALL_SCALES.length)]);
    setRootNote(rootNotes[Math.floor(Math.random() * rootNotes.length)]);
  };

  if (!currentPattern) return null;

  // Overwrite confirmation dialog
  if (showOverwriteConfirm) {
    return (
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
        onClick={() => setShowOverwriteConfirm(false)}
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
            Generating will replace all existing data in this channel.
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-ft2-border">
            <button
              onClick={() => setShowOverwriteConfirm(false)}
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
            <Wand2 size={18} className="text-accent-primary" />
            <h2 className="text-lg font-bold text-ft2-text">Acid Pattern Generator</h2>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-dark-bg">
          {/* Channel + Instrument row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Channel Selection */}
            <div>
              <label className="block text-sm font-medium mb-2 text-ft2-text">Channel</label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-dark-bgTertiary text-ft2-text border border-ft2-border rounded focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                {currentPattern.channels.map((ch, idx) => (
                  <option key={ch.id} value={idx}>
                    {(idx + 1).toString().padStart(2, '0')}: {ch.name}
                    {channelHasData(ch.rows) ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Instrument Selection */}
            <div>
              <label className="block text-sm font-medium mb-2 text-ft2-text">Instrument</label>
              <select
                value={selectedInstrumentId}
                onChange={(e) => setSelectedInstrumentId(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-dark-bgTertiary text-ft2-text border border-ft2-border rounded focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <option value={CREATE_NEW_303}>+ New TB-303</option>
                {instruments.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.id}: {inst.name} ({inst.synthType})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scale + Root Note row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2 text-ft2-text">Scale</label>
              <select
                value={scale}
                onChange={(e) => setScale(e.target.value as Scale)}
                className="w-full px-3 py-2 bg-dark-bgTertiary text-ft2-text border border-ft2-border rounded focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                {ALL_SCALES.map((s) => (
                  <option key={s} value={s}>
                    {getScaleName(s)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-ft2-text">Root Note</label>
              <select
                value={rootNote}
                onChange={(e) => setRootNote(e.target.value)}
                className="w-full px-3 py-2 bg-dark-bgTertiary text-ft2-text border border-ft2-border rounded focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                {rootNotes.map((note) => (
                  <option key={note} value={note}>
                    {note}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Density Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Note Density: <span className="font-mono text-accent-primary">{density}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={density}
              onChange={(e) => setDensity(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              How many notes in the pattern (sparse - dense)
            </div>
          </div>

          {/* Spread Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Note Spread: <span className="font-mono text-accent-primary">{spread}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={spread}
              onChange={(e) => setSpread(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              Note range variety (narrow - wide)
            </div>
          </div>

          {/* Accents Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Accents: <span className="font-mono text-accent-primary">{accentsDensity}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={accentsDensity}
              onChange={(e) => setAccentsDensity(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              How many accented notes (subtle - punchy)
            </div>
          </div>

          {/* Slides Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Slides: <span className="font-mono text-accent-primary">{slidesDensity}%</span>
            </label>
            <input
              type="range" min="0" max="100" value={slidesDensity}
              onChange={(e) => setSlidesDensity(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              How many slides/portamento (few - many)
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-ft2-border bg-dark-bgTertiary">
          <button
            onClick={handleRandomize}
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
              onClick={handleGenerate}
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white rounded transition-colors font-medium"
            >
              Generate Pattern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
