/**
 * VL1Controls.tsx — Visual UI for Casio VL-Tone synthesizer
 * Sound selector, ADSR knobs, vibrato/tremolo, octave, tune, rhythm controls.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { VL1Config } from '@/engine/vl1/VL1Synth';
import { DEFAULT_VL1, VL1_SOUND_NAMES, VL1_RHYTHM_NAMES } from '@/engine/vl1/VL1Synth';
import { Knob } from '@components/controls/Knob';

interface VL1ControlsProps {
  config: VL1Config;
  onChange: (config: VL1Config) => void;
}

export const VL1Controls: React.FC<VL1ControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof VL1Config, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_VL1, ...config } as Required<VL1Config>;

  // Map sound 0-1 to index 0-9
  const soundIdx = Math.min(9, Math.round((merged.sound ?? 0) * 10));
  const rhythmIdx = Math.min(9, Math.round((merged.rhythm ?? 0) * 9));

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Sound Selection */}
      <div>
        <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">Sound</h3>
        <div className="flex flex-wrap gap-1">
          {VL1_SOUND_NAMES.map((name, i) => (
            <button
              key={i}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                soundIdx === i
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              onClick={() => updateParam('sound', i / 10)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* ADSR Envelope */}
      <div>
        <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">Envelope (ADSR)</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <Knob value={merged.attack ?? 0} min={0} max={1}
            onChange={(v) => updateParam('attack', v)} label="Attack" color="#ef4444" />
          <Knob value={merged.decay ?? 0} min={0} max={1}
            onChange={(v) => updateParam('decay', v)} label="Decay" color="#f59e0b" />
          <Knob value={merged.sustainLevel ?? 0} min={0} max={1}
            onChange={(v) => updateParam('sustainLevel', v)} label="Sus Lvl" color="#22c55e" />
          <Knob value={merged.sustainTime ?? 0} min={0} max={1}
            onChange={(v) => updateParam('sustainTime', v)} label="Sus Time" color="#22c55e" />
          <Knob value={merged.release ?? 0} min={0} max={1}
            onChange={(v) => updateParam('release', v)} label="Release" color="#3b82f6" />
        </div>
      </div>

      {/* Modulation */}
      <div>
        <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">Modulation</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <Knob value={merged.vibrato ?? 0} min={0} max={1}
            onChange={(v) => updateParam('vibrato', v)} label="Vibrato" color="#8b5cf6" />
          <Knob value={merged.tremolo ?? 0} min={0} max={1}
            onChange={(v) => updateParam('tremolo', v)} label="Tremolo" color="#a855f7" />
        </div>
      </div>

      {/* Master */}
      <div>
        <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">Master</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-gray-500 text-[10px]">Octave</label>
            <div className="flex gap-1">
              {['Low', 'Mid', 'High'].map((label, i) => (
                <button
                  key={i}
                  className={`px-2 py-0.5 rounded text-[10px] ${
                    Math.round(2 * (merged.octave ?? 0.5)) === i
                      ? 'bg-cyan-700 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                  onClick={() => updateParam('octave', i / 2)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Knob value={merged.tune ?? 1} min={0.5} max={1.5}
            onChange={(v) => updateParam('tune', v)} label="Tune" color="#64748b" />
          <Knob value={merged.volume ?? 0.7} min={0} max={1}
            onChange={(v) => updateParam('volume', v)} label="Volume" color="#22c55e" />
          <Knob value={merged.balance ?? 0.5} min={0} max={1}
            onChange={(v) => updateParam('balance', v)} label="Balance" color="#06b6d4" />
        </div>
      </div>

      {/* Rhythm */}
      <div>
        <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">Rhythm</h3>
        <div className="flex items-center gap-3 mb-2">
          <button
            className={`px-3 py-1 rounded text-[11px] font-semibold ${
              (merged.rhythmOn ?? 0) > 0.5
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
            onClick={() => updateParam('rhythmOn', (merged.rhythmOn ?? 0) > 0.5 ? 0 : 1)}
          >
            {(merged.rhythmOn ?? 0) > 0.5 ? 'RHYTHM ON' : 'RHYTHM OFF'}
          </button>
          <Knob value={merged.tempo ?? 0.5} min={0} max={1}
            onChange={(v) => updateParam('tempo', v)} label="Tempo" color="#f97316" />
        </div>
        <div className="flex flex-wrap gap-1">
          {VL1_RHYTHM_NAMES.map((name, i) => (
            <button
              key={i}
              className={`px-2 py-1 rounded text-[10px] transition-colors ${
                rhythmIdx === i
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              onClick={() => updateParam('rhythm', i / 9)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VL1Controls;
