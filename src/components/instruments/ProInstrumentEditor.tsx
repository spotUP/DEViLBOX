import React from 'react';
import { useInstrumentStore } from '@stores';
import { EnvelopeEditor } from './EnvelopeEditor';
import { SampleEditor } from './SampleEditor';
import { SampleMapEditor } from './SampleMapEditor';
import { Layers, Volume2, MoveHorizontal, Music, Map, Activity, Wind } from 'lucide-react';
import type { InstrumentConfig, TrackerEnvelope, VibratoConfig } from '@typedefs/instrument';

interface ProInstrumentEditorProps {
  instrument: InstrumentConfig;
}

const DEFAULT_ENVELOPE: TrackerEnvelope = {
  enabled: false,
  points: [
    { x: 0, y: 64 },
    { x: 48, y: 0 }
  ],
  sustainEnabled: false,
  sustainPoint: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 1
};

const DEFAULT_VIBRATO: VibratoConfig = {
  enabled: false,
  waveform: 'sine',
  rate: 5,
  depth: 20,
  sweep: 500
};

export const ProInstrumentEditor: React.FC<ProInstrumentEditorProps> = ({ instrument }) => {
  const { updateInstrument } = useInstrumentStore();

  const handleUpdate = (updates: Partial<InstrumentConfig>) => {
    updateInstrument(instrument.id, updates);
  };

  const vibrato = instrument.vibrato || DEFAULT_VIBRATO;

  return (
    <div className="p-4 space-y-6 font-mono animate-in fade-in duration-300">
      {/* 1. Multi-Sample / Primary Sample Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-text-primary border-b border-dark-border pb-2">
          <Layers size={16} className="text-accent-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Sample Management</h3>
        </div>
        <SampleEditor instrument={instrument} />
      </section>

      {/* 2. Note Mapping Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-text-primary border-b border-dark-border pb-2">
          <Map size={16} className="text-accent-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Multi-Sample Mapping</h3>
        </div>
        <SampleMapEditor instrument={instrument} onChange={handleUpdate} />
      </section>

      {/* 3. Professional Envelopes Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-text-primary border-b border-dark-border pb-2">
          <MoveHorizontal size={16} className="text-accent-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Modulation Envelopes</h3>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <EnvelopeEditor 
            title="Volume Envelope"
            color="var(--color-accent)"
            envelope={instrument.volumeEnvelope || DEFAULT_ENVELOPE}
            onChange={(env) => handleUpdate({ 
              volumeEnvelope: { ...(instrument.volumeEnvelope || DEFAULT_ENVELOPE), ...env } 
            })}
          />
          
          <EnvelopeEditor 
            title="Panning Envelope"
            color="var(--color-accent-secondary)"
            envelope={instrument.panningEnvelope || DEFAULT_ENVELOPE}
            onChange={(env) => handleUpdate({ 
              panningEnvelope: { ...(instrument.panningEnvelope || DEFAULT_ENVELOPE), ...env } 
            })}
          />
        </div>
      </section>

      {/* 4. Auto-Vibrato & Professional Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-4 bg-dark-bgSecondary/40 p-4 border border-dark-border rounded">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-primary">
              <Activity size={16} className="text-accent-primary" />
              <h3 className="text-[10px] font-bold uppercase tracking-wider">Auto-Vibrato</h3>
            </div>
            <button 
              onClick={() => handleUpdate({ vibrato: { ...vibrato, enabled: !vibrato.enabled } })}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${vibrato.enabled ? 'bg-accent-primary text-text-inverse' : 'bg-dark-bgTertiary text-text-muted'}`}
            >
              {vibrato.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className={`space-y-4 transition-opacity ${vibrato.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="grid grid-cols-4 gap-1">
              {(['sine', 'triangle', 'square', 'sawtooth'] as const).map(wf => (
                <button
                  key={wf}
                  onClick={() => handleUpdate({ vibrato: { ...vibrato, waveform: wf } })}
                  className={`py-1 text-[9px] font-bold uppercase rounded border border-dark-border ${vibrato.waveform === wf ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:bg-white/5'}`}
                >
                  {wf.slice(0, 3)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] uppercase font-bold">
                  <span className="text-text-muted">Speed</span>
                  <span className="text-accent-primary">{(vibrato.rate).toFixed(1)} Hz</span>
                </div>
                <input type="range" min="0.1" max="10" step="0.1" value={vibrato.rate} onChange={e => handleUpdate({ vibrato: { ...vibrato, rate: parseFloat(e.target.value) } })} className="w-full h-1 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] uppercase font-bold">
                  <span className="text-text-muted">Depth</span>
                  <span className="text-accent-primary">{Math.round(vibrato.depth)} %</span>
                </div>
                <input type="range" min="0" max="100" step="1" value={vibrato.depth} onChange={e => handleUpdate({ vibrato: { ...vibrato, depth: parseInt(e.target.value) } })} className="w-full h-1 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] uppercase font-bold">
                  <span className="text-text-muted">Sweep (Delay)</span>
                  <span className="text-accent-primary">{Math.round(vibrato.sweep)} ms</span>
                </div>
                <input type="range" min="0" max="2000" step="10" value={vibrato.sweep} onChange={e => handleUpdate({ vibrato: { ...vibrato, sweep: parseInt(e.target.value) } })} className="w-full h-1 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4 bg-dark-bgSecondary/40 p-4 border border-dark-border rounded">
          <div className="flex items-center gap-2 text-text-primary">
            <Wind size={16} className="text-accent-primary" />
            <h3 className="text-[10px] font-bold uppercase tracking-wider">Note Termination</h3>
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-[9px] uppercase font-bold">
              <span className="text-text-muted">Volume Fadeout</span>
              <span className="text-accent-primary">{instrument.volumeFadeout || 0}</span>
            </div>
            <input 
              type="range" min="0" max="4095" step="1"
              value={instrument.volumeFadeout || 0}
              onChange={e => handleUpdate({ volumeFadeout: parseInt(e.target.value) })}
              className="w-full h-1 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
            />
            <p className="text-[8px] text-text-muted mt-2 leading-tight">
              DECREASE VOLUME AFTER RELEASE. 0 = INFINITE, 4095 = INSTANT SILENCE.
            </p>
          </div>
        </section>
      </div>

      {/* 5. Instrument Info / Settings */}
      <section className="grid grid-cols-2 gap-4 bg-dark-bgSecondary/40 p-4 border border-dark-border rounded">
        <div className="space-y-2">
          <h4 className="text-[10px] text-text-muted uppercase font-bold flex items-center gap-2">
            <Volume2 size={12} /> Global Volume
          </h4>
          <input 
            type="range" min="-60" max="0" step="1"
            value={instrument.volume}
            onChange={e => handleUpdate({ volume: parseInt(e.target.value) })}
            className="w-full h-1 bg-dark-bgTertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
          />
        </div>
        <div className="space-y-2 text-right">
          <h4 className="text-[10px] text-text-muted uppercase font-bold flex items-center justify-end gap-2">
            <Music size={12} /> Instrument ID
          </h4>
          <span className="text-sm font-bold text-text-primary">
            {instrument && instrument.id !== undefined ? `0x${instrument.id.toString(16).toUpperCase().padStart(2, '0')}` : '--'}
          </span>
        </div>
      </section>
    </div>
  );
};