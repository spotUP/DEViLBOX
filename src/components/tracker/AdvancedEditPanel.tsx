import React from 'react';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { 
  ShieldCheck, 
  RefreshCw, 
  ArrowUpDown, 
  Zap
} from 'lucide-react';

export const AdvancedEditPanel: React.FC = () => {
  const { 
    copyMask, 
    setCopyMask, 
    transposeSelection, 
    remapInstrument,
  } = useTrackerStore();
  const { currentInstrumentId } = useInstrumentStore();

  const toggleMask = (key: keyof typeof copyMask) => {
    setCopyMask({ [key]: !copyMask[key] });
  };

  return (
    <div className="bg-dark-bgSecondary border-l border-dark-border w-48 flex flex-col font-mono animate-in slide-in-from-right duration-300">
      <div className="bg-dark-bgTertiary p-2 flex items-center gap-2 border-b border-dark-border">
        <Zap size={14} className="text-accent-primary" />
        <h3 className="text-text-primary text-[10px] font-bold uppercase tracking-wider">Advanced Edit</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Masking Section */}
        <section className="space-y-2">
          <h4 className="text-[9px] text-text-muted uppercase font-bold flex items-center gap-1">
            <ShieldCheck size={10} /> Paste Masking
          </h4>
          <div className="grid grid-cols-1 gap-1">
            {(['note', 'instrument', 'volume', 'effect'] as const).map(m => (
              <label key={m} className="flex items-center justify-between p-1 bg-dark-bg/40 border border-dark-border rounded cursor-pointer hover:bg-dark-bgActive/10 transition-colors">
                <span className="text-[10px] uppercase text-text-secondary">{m}</span>
                <input 
                  type="checkbox" 
                  checked={copyMask[m]} 
                  onChange={() => toggleMask(m)}
                  className="w-3 h-3 accent-accent-primary"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Transpose Section */}
        <section className="space-y-2">
          <h4 className="text-[9px] text-text-muted uppercase font-bold flex items-center gap-1">
            <ArrowUpDown size={10} /> Transpose
          </h4>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => transposeSelection(1)} className="p-1 bg-dark-bgActive/20 border border-dark-border rounded text-[9px] text-text-primary hover:bg-dark-bgActive/40">+1</button>
            <button onClick={() => transposeSelection(-1)} className="p-1 bg-dark-bgActive/20 border border-dark-border rounded text-[9px] text-text-primary hover:bg-dark-bgActive/40">-1</button>
            <button onClick={() => transposeSelection(12)} className="p-1 bg-dark-bgActive/20 border border-dark-border rounded text-[9px] text-text-primary hover:bg-dark-bgActive/40">+12</button>
            <button onClick={() => transposeSelection(-12)} className="p-1 bg-dark-bgActive/20 border border-dark-border rounded text-[9px] text-text-primary hover:bg-dark-bgActive/40">-12</button>
          </div>
          <button 
            onClick={() => transposeSelection(1, true)}
            className="w-full mt-1 p-1 bg-accent-warning/10 border border-accent-warning/30 rounded text-[8px] text-accent-warning uppercase hover:bg-accent-warning/20"
          >
            Current Instrument Only
          </button>
        </section>

        {/* Remap Section */}
        <section className="space-y-2">
          <h4 className="text-[9px] text-text-muted uppercase font-bold flex items-center gap-1">
            <RefreshCw size={10} /> Remap Instrument
          </h4>
          <div className="space-y-1">
            <button 
              disabled={currentInstrumentId === null}
              onClick={() => remapInstrument(0, currentInstrumentId!, 'track')}
              className="w-full p-1 bg-dark-bgActive/20 border border-dark-border rounded text-[9px] text-text-primary hover:bg-dark-bgActive/40 text-left disabled:opacity-20"
            >
              Remap Track
            </button>
            <button 
              disabled={currentInstrumentId === null}
              onClick={() => remapInstrument(0, currentInstrumentId!, 'pattern')}
              className="w-full p-1 bg-dark-bgActive/20 border border-dark-border rounded text-[9px] text-text-primary hover:bg-dark-bgActive/40 text-left disabled:opacity-20"
            >
              Remap Pattern
            </button>
          </div>
        </section>
      </div>

      <div className="p-2 border-t border-dark-border bg-dark-bg/40">
        <p className="text-[8px] text-text-muted italic">
          Masking affects Paste and Interpolate operations.
        </p>
      </div>
    </div>
  );
};