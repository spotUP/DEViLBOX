/**
 * SfizzControls.tsx - Sfizz SFZ player controls
 *
 * Layout: SFZ file loader, Volume/Pan/Polyphony, Performance CCs, Engine settings.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import type { SfizzConfig } from '@/engine/sfizz/SfizzSynth';
import { DEFAULT_SFIZZ } from '@/engine/sfizz/SfizzSynth';

interface SfizzControlsProps {
  config: SfizzConfig;
  onChange: (config: SfizzConfig) => void;
  /** Called when user selects SFZ files/folder to load */
  onLoadFiles?: (files: FileList) => void;
  /** Name of the currently loaded SFZ instrument */
  loadedName?: string;
}

const OVERSAMPLING_OPTIONS = [
  { label: '1x', value: 0 },
  { label: '2x', value: 1 },
  { label: '4x', value: 2 },
  { label: '8x', value: 3 },
];

export const SfizzControls: React.FC<SfizzControlsProps> = ({ config, onChange, onLoadFiles, loadedName }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);
  const [dragOver, setDragOver] = useState(false);

  const updateParam = useCallback((key: keyof SfizzConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onLoadFiles) {
      onLoadFiles(e.target.files);
    }
  }, [onLoadFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0 && onLoadFiles) {
      onLoadFiles(e.dataTransfer.files);
    }
  }, [onLoadFiles]);

  const merged = { ...DEFAULT_SFIZZ, ...config } as Required<SfizzConfig>;

  return (
    <div className="synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* SFZ Loader */}
      <div className={`p-2 rounded-lg border ${dragOver ? 'border-violet-400 bg-violet-500/10' : 'bg-[#1a1a1a] border-amber-900/30'} transition-colors`}>
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">SFZ Instrument</h3>
        <div className="flex flex-col gap-2">
          {loadedName && (
            <div className="text-[11px] font-mono text-violet-300 truncate px-1">{loadedName}</div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-3 py-1.5 text-xs font-bold rounded bg-violet-600/80 text-white hover:bg-violet-500 transition-colors"
            >
              Load .sfz
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex-1 px-3 py-1.5 text-xs font-bold rounded bg-violet-600/40 text-violet-200 hover:bg-violet-500/60 transition-colors"
            >
              Load Folder
            </button>
          </div>
          <div className="text-[9px] text-text-muted text-center">
            Drop .sfz + samples here
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".sfz,.wav,.flac,.ogg,.aiff,.aif" multiple
          onChange={handleFileSelect} className="hidden" />
        <input ref={folderInputRef} type="file"
          {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
          onChange={handleFileSelect} className="hidden" />
      </div>

      {/* Output */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Output</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Volume" value={merged.volume} min={0} max={1} defaultValue={0.8} onChange={(v) => updateParam('volume', v)} color="#a78bfa" />
          <Knob label="Pan" value={merged.pan} min={-1} max={1} defaultValue={0} onChange={(v) => updateParam('pan', v)} color="#a78bfa" />
          <Knob label="Polyphony" value={merged.polyphony} min={1} max={256} defaultValue={64} onChange={(v) => updateParam('polyphony', Math.round(v))} color="#a78bfa" />
          <Knob label="Transpose" value={merged.transpose} min={-24} max={24} defaultValue={0} onChange={(v) => updateParam('transpose', Math.round(v))} color="#a78bfa" unit="st" />
        </div>
      </div>

      {/* Performance CCs */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Performance</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Mod Wheel" value={merged.modWheel} min={0} max={1} defaultValue={0} onChange={(v) => updateParam('modWheel', v)} color="#f472b6" />
          <Knob label="Expression" value={merged.expression} min={0} max={1} defaultValue={1} onChange={(v) => updateParam('expression', v)} color="#f472b6" />
          <Knob label="Pitch Bend" value={merged.pitchBend} min={-1} max={1} defaultValue={0} onChange={(v) => updateParam('pitchBend', v)} color="#f472b6" />
          <Knob label="Reverb" value={merged.reverbSend} min={0} max={1} defaultValue={0.2} onChange={(v) => updateParam('reverbSend', v)} color="#818cf8" />
          <Knob label="Chorus" value={merged.chorusSend} min={0} max={1} defaultValue={0} onChange={(v) => updateParam('chorusSend', v)} color="#818cf8" />
        </div>
      </div>

      {/* Engine Settings */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Engine</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Knob label="Preload" value={merged.preloadSize} min={1024} max={65536} defaultValue={8192} onChange={(v) => updateParam('preloadSize', Math.round(v))} color="#a78bfa" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-muted">Oversampling</span>
            <div className="flex gap-1">
              {OVERSAMPLING_OPTIONS.map(({ label, value }) => (
                <button key={label} onClick={() => updateParam('oversampling', value)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.oversampling === value ? 'bg-violet-500 text-white' : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[9px] text-text-muted mt-2">SFZ instruments define their own CC mappings. Standard CCs: 1=ModWheel, 7=Volume, 10=Pan, 11=Expression, 64=Sustain, 74=Cutoff, 91=Reverb, 93=Chorus</p>
      </div>
    </div>
  );
};

export default SfizzControls;
