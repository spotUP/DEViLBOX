/**
 * AcidPatternGeneratorDialog - Generate random TB-303 acid patterns
 */

import React, { useState } from 'react';
import { generateAcidPattern, ALL_SCALES, getScaleName, type AcidPatternParams, type Scale } from '@lib/generators/acidPatternGenerator';
import { useTrackerStore } from '@stores';
import { Wand2, X, RefreshCw } from 'lucide-react';

interface AcidPatternGeneratorDialogProps {
  channelIndex: number;
  onClose: () => void;
}

export const AcidPatternGeneratorDialog: React.FC<AcidPatternGeneratorDialogProps> = ({
  channelIndex,
  onClose,
}) => {
  const { patterns, currentPatternIndex, setChannelRows } = useTrackerStore();
  const currentPattern = patterns[currentPatternIndex];
  const channel = currentPattern?.channels[channelIndex];
  const instrumentId = channel?.instrumentId ?? 0;

  // Generator parameters
  const [density, setDensity] = useState(60);
  const [spread, setSpread] = useState(60);
  const [accentsDensity, setAccentsDensity] = useState(50);
  const [slidesDensity, setSlidesDensity] = useState(40);
  const [scale, setScale] = useState<Scale>('MINOR');
  const [rootNote, setRootNote] = useState('C2');

  // Available root notes
  const rootNotes = [
    'C1', 'C#1', 'D1', 'D#1', 'E1', 'F1', 'F#1', 'G1', 'G#1', 'A1', 'A#1', 'B1',
    'C2', 'C#2', 'D2', 'D#2', 'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
    'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
  ];

  const handleGenerate = () => {
    if (!channel) return;

    const params: AcidPatternParams = {
      patternLength: currentPattern.length,
      density,
      spread,
      accentsDensity,
      slidesDensity,
      scale,
      rootNote,
      instrumentId,
    };

    const generatedRows = generateAcidPattern(params);

    // Apply generated pattern to channel
    setChannelRows(channelIndex, generatedRows);
  };

  const handleRandomize = () => {
    setDensity(Math.floor(Math.random() * 60) + 40); // 40-100
    setSpread(Math.floor(Math.random() * 60) + 40); // 40-100
    setAccentsDensity(Math.floor(Math.random() * 60) + 20); // 20-80
    setSlidesDensity(Math.floor(Math.random() * 60) + 20); // 20-80
    setScale(ALL_SCALES[Math.floor(Math.random() * ALL_SCALES.length)]);
    const randomRoot = rootNotes[Math.floor(Math.random() * rootNotes.length)];
    setRootNote(randomRoot);
  };

  if (!channel) return null;

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
          {/* Channel Info */}
          <div className="bg-dark-bgTertiary p-3 rounded border border-ft2-border">
            <div className="text-sm text-ft2-textDim">
              Generating for: <span className="font-bold text-ft2-text">{channel.name}</span>
              <br />
              Pattern Length: <span className="font-mono">{currentPattern.length} steps</span>
            </div>
          </div>

          {/* Scale Selection */}
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

          {/* Root Note */}
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

          {/* Density Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Note Density: <span className="font-mono text-accent-primary">{density}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={density}
              onChange={(e) => setDensity(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              How many notes in the pattern (sparse ← → dense)
            </div>
          </div>

          {/* Spread Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Note Spread: <span className="font-mono text-accent-primary">{spread}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={spread}
              onChange={(e) => setSpread(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              Note range variety (narrow ← → wide)
            </div>
          </div>

          {/* Accents Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Accents: <span className="font-mono text-accent-primary">{accentsDensity}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={accentsDensity}
              onChange={(e) => setAccentsDensity(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              How many accented notes (subtle ← → punchy)
            </div>
          </div>

          {/* Slides Slider */}
          <div>
            <label className="block text-sm font-medium mb-2 text-ft2-text">
              Slides: <span className="font-mono text-accent-primary">{slidesDensity}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={slidesDensity}
              onChange={(e) => setSlidesDensity(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-xs text-ft2-textDim mt-1">
              How many slides/portamento (few ← → many)
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
              onClick={() => {
                handleGenerate();
                onClose();
              }}
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
