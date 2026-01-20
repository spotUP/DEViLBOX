import React, { useState } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { Layout, MousePointer2 } from 'lucide-react';

interface SampleMapEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SampleMapEditor: React.FC<SampleMapEditorProps> = ({ instrument, onChange }) => {
  const [selectedSampleIdx, setSelectedSampleIdx] = useState(0);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);

  const sampleMap = instrument.sampleMap || {};
  const samples = instrument.samples || [];

  const handleNoteClick = (note: number) => {
    const newMap = { ...sampleMap };
    
    if (selectionStart !== null) {
      // Range selection
      const start = Math.min(selectionStart, note);
      const end = Math.max(selectionStart, note);
      for (let n = start; n <= end; n++) {
        newMap[n] = selectedSampleIdx;
      }
      setSelectionStart(null);
    } else {
      newMap[note] = selectedSampleIdx;
    }
    
    onChange({ sampleMap: newMap });
  };

  const getNoteName = (midi: number) => {
    const note = NOTES[midi % 12];
    const octave = Math.floor(midi / 12);
    return `${note}${octave}`;
  };

  return (
    <div className="bg-dark-bgSecondary/40 border border-dark-border rounded p-3 space-y-4 font-mono">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase flex items-center gap-2 text-text-primary">
          <Layout size={12} className="text-accent-primary" /> Note Mapping
        </h4>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-text-muted uppercase">Selected:</span>
          <select 
            value={selectedSampleIdx}
            onChange={(e) => setSelectedSampleIdx(parseInt(e.target.value))}
            className="bg-dark-bg border border-dark-border text-[10px] px-2 py-0.5 rounded text-text-primary outline-none focus:border-accent-primary"
          >
            {samples.length > 0 ? (
              samples.map((s, i) => <option key={i} value={i}>{i}: {s.name}</option>)
            ) : (
              <option value={0}>0: Default Sample</option>
            )}
          </select>
        </div>
      </div>

      {/* Piano Keyboard Map View */}
      <div className="grid grid-cols-12 gap-px bg-dark-border p-px rounded overflow-hidden">
        {Array.from({ length: 96 }, (_, i) => {
          const midi = i + 12; // Start from C1
          const sampleIdx = sampleMap[midi] ?? 0;
          const isSelected = selectionStart === midi;
          
          return (
            <button
              key={midi}
              onClick={() => handleNoteClick(midi)}
              onContextMenu={(e) => { e.preventDefault(); setSelectionStart(midi); }}
              title={`${getNoteName(midi)} -> Sample ${sampleIdx}`}
              className={`
                h-10 text-[7px] flex flex-col items-center justify-between py-1 transition-colors
                ${isSelected ? 'bg-accent-primary text-text-inverse' : ''}
                ${!isSelected ? (sampleIdx % 2 === 0 ? 'bg-dark-bg/40 text-text-muted' : 'bg-dark-bgActive/40 text-text-primary') : ''}
                hover:bg-accent-primary/40
              `}
            >
              <span className="opacity-50">{getNoteName(midi)}</span>
              <span className="font-bold">{sampleIdx}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[9px] text-text-muted uppercase italic">
        <p>Left Click: Assign | Right Click: Range</p>
        {selectionStart !== null && (
          <span className="text-accent-primary animate-pulse flex items-center gap-1">
            <MousePointer2 size={10} /> Selecting from {getNoteName(selectionStart)}...
          </span>
        )}
      </div>
    </div>
  );
};