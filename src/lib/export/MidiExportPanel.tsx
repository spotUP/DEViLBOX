import React, { useState } from 'react';
import { useTrackerStore, useProjectStore, useTransportStore, useAutomationStore, notify } from '@stores';
import { exportPatternToMIDI, exportSongToMIDI } from './midiExport';

interface MidiExportPanelProps {
  handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null>;
  selectedPatternIndex: number;
  setSelectedPatternIndex: (idx: number) => void;
}

export const MidiExportPanel: React.FC<MidiExportPanelProps> = ({
  handlerRef,
  selectedPatternIndex,
  setSelectedPatternIndex,
}) => {
  const { patterns } = useTrackerStore();
  const { metadata } = useProjectStore();
  const { bpm } = useTransportStore();
  const { curves } = useAutomationStore();

  const [midiType, setMidiType] = useState<0 | 1>(1);
  const [midiIncludeAutomation, setMidiIncludeAutomation] = useState(true);
  const [midiExportFullSong, setMidiExportFullSong] = useState(false);

  // Register export handler
  handlerRef.current = async () => {
    const timeSignature: [number, number] = [4, 4];
    const midiOptions = {
      type: midiType,
      includeAutomation: midiIncludeAutomation,
      velocityScale: 1.0,
      exportMutedChannels: false,
    };

    let midiData: Uint8Array;
    let filename: string;

    if (midiExportFullSong) {
      const sequence = patterns.map((p) => p.id);
      midiData = exportSongToMIDI(patterns, sequence, bpm, timeSignature, curves, midiOptions);
      filename = `${metadata.name || 'song'}.mid`;
    } else {
      const pattern = patterns[selectedPatternIndex];
      if (!pattern) {
        notify.warning('Please select a valid pattern');
        return false;
      }
      midiData = exportPatternToMIDI(pattern, bpm, timeSignature, midiOptions);
      filename = `${pattern.name || 'pattern'}.mid`;
    }

    // Download the file - create a fresh Uint8Array to ensure standard ArrayBuffer
    const blob = new Blob([new Uint8Array(midiData)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    notify.success(`MIDI file "${filename}" exported successfully!`);
  };

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
        MIDI Export (.mid)
      </h3>
      <div className="space-y-3">
        {/* Export scope toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMidiExportFullSong(false)}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${!midiExportFullSong
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            Single Pattern
          </button>
          <button
            onClick={() => setMidiExportFullSong(true)}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${midiExportFullSong
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            Full Song ({patterns.length} patterns)
          </button>
        </div>

        {/* Pattern selector (only shown for single pattern mode) */}
        {!midiExportFullSong && (
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">
              Pattern to Export
            </label>
            <select
              value={selectedPatternIndex}
              onChange={(e) => setSelectedPatternIndex(Number(e.target.value))}
              className="input w-full"
            >
              {patterns.map((pattern, index) => (
                <option key={pattern.id} value={index}>
                  {index.toString().padStart(2, '0')} - {pattern.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* MIDI Type */}
        <div>
          <label className="block text-xs font-mono text-text-muted mb-1">
            MIDI Format
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setMidiType(0)}
              className={`
                flex-1 px-3 py-2 rounded-lg text-xs font-mono transition-all
                ${midiType === 0
                  ? 'bg-accent-secondary text-text-inverse'
                  : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                }
              `}
            >
              Type 0 (Single Track)
            </button>
            <button
              onClick={() => setMidiType(1)}
              className={`
                flex-1 px-3 py-2 rounded-lg text-xs font-mono transition-all
                ${midiType === 1
                  ? 'bg-accent-secondary text-text-inverse'
                  : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
                }
              `}
            >
              Type 1 (Multi-Track)
            </button>
          </div>
        </div>

        {/* Include automation */}
        <label className="flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors">
          <input
            type="checkbox"
            checked={midiIncludeAutomation}
            onChange={(e) => setMidiIncludeAutomation(e.target.checked)}
            className="w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
          />
          Include automation as CC messages
        </label>

        <div className="text-sm font-mono text-text-secondary space-y-1">
          <div>Format: <span className="text-accent-primary">Standard MIDI File (SMF)</span></div>
          <div>Resolution: <span className="text-accent-primary">480 PPQ</span></div>
          <div>BPM: <span className="text-accent-primary">{bpm}</span></div>
          <div>Channels: <span className="text-accent-primary">{patterns[selectedPatternIndex]?.channels.length || 8}</span></div>
        </div>
      </div>
    </div>
  );
};
