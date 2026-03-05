/**
 * SIDSettingsTab — DOM SID engine settings panel.
 * Engine selection, chip model, clock speed, ASID toggle, voice mask, buffer size.
 */

import React, { useCallback, useState } from 'react';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import type { SIDEngineType } from '@engine/deepsid/DeepSIDEngineManager';
import { useSettingsStore } from '@stores/useSettingsStore';
import { notify } from '@stores/useNotificationStore';

interface SIDSettingsTabProps {
  className?: string;
}

type ChipModelOverride = 'auto' | '6581' | '8580';
type ClockSpeedOverride = 'auto' | 'PAL' | 'NTSC';
type BufferSize = 4096 | 8192 | 16384;

export const SIDSettingsTab: React.FC<SIDSettingsTabProps> = ({ className }) => {
  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const sidHwMode = useSettingsStore((s) => s.sidHardwareMode);

  const [chipModel, setChipModel] = useState<ChipModelOverride>('auto');
  const [clockSpeed, setClockSpeed] = useState<ClockSpeedOverride>('auto');
  const [asidEnabled, setAsidEnabled] = useState(false);
  const [voiceMask, setVoiceMask] = useState([true, true, true]);
  const [bufferSize, setBufferSize] = useState<BufferSize>(8192);

  const handleEngineChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const engine = e.target.value as SIDEngineType;
    setSidEngine(engine);
    notify.success(`SID engine changed to ${SID_ENGINES[engine].name}`);
  }, [setSidEngine]);

  const handleVoiceToggle = useCallback((index: number) => {
    setVoiceMask((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  const sectionClass = 'bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4 space-y-3';
  const labelClass = 'text-xs font-medium text-text-muted';
  const selectClass = 'w-full text-sm bg-dark-bgPrimary border border-blue-800/40 rounded px-2 py-1.5 text-text-primary';

  return (
    <div className={className}>
      <div className="space-y-4">

        {/* Engine Selection */}
        <div className={sectionClass}>
          <label className={labelClass}>SID Engine</label>
          <select
            value={sidEngine}
            onChange={handleEngineChange}
            className={selectClass}
          >
            {Object.values(SID_ENGINES).map((eng) => (
              <option key={eng.id} value={eng.id}>
                {eng.name} — {eng.accuracy}, {eng.speed} ({eng.size}){eng.features.asidHardware ? ' ★ HW' : ''}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-text-muted/60 leading-tight">
            {SID_ENGINES[sidEngine].description}
          </p>
          {sidHwMode !== 'off' && !SID_ENGINES[sidEngine].features.asidHardware && (
            <p className="text-[10px] text-accent-warning leading-tight mt-1">
              This engine does not support hardware SID output. Switch to jsSID for hardware playback.
            </p>
          )}
        </div>

        {/* Chip Model Override */}
        <div className={sectionClass}>
          <label className={labelClass}>Chip Model Override</label>
          <select
            value={chipModel}
            onChange={(e) => setChipModel(e.target.value as ChipModelOverride)}
            className={selectClass}
          >
            <option value="auto">Auto (use file header)</option>
            <option value="6581">MOS 6581</option>
            <option value="8580">MOS 8580</option>
          </select>
          <p className="text-[10px] text-text-muted/60 leading-tight">
            {chipModel === 'auto'
              ? 'Uses the chip model specified in the SID file header.'
              : chipModel === '6581'
                ? 'Original SID chip (1982). Brighter, grittier sound with filter quirks.'
                : 'Revised SID chip (1985). Cleaner sound, improved filters, lower noise.'}
          </p>
        </div>

        {/* Clock Speed Override */}
        <div className={sectionClass}>
          <label className={labelClass}>Clock Speed Override</label>
          <select
            value={clockSpeed}
            onChange={(e) => setClockSpeed(e.target.value as ClockSpeedOverride)}
            className={selectClass}
          >
            <option value="auto">Auto (use file header)</option>
            <option value="PAL">PAL (50 Hz)</option>
            <option value="NTSC">NTSC (60 Hz)</option>
          </select>
          <p className="text-[10px] text-text-muted/60 leading-tight">
            {clockSpeed === 'auto'
              ? 'Uses the clock speed specified in the SID file header.'
              : clockSpeed === 'PAL'
                ? 'European PAL timing (985248 Hz CPU). Most C64 music is composed for PAL.'
                : 'American NTSC timing (1022727 Hz CPU). Slightly faster playback.'}
          </p>
        </div>

        {/* ASID Hardware Output */}
        <div className={sectionClass}>
          <div className="flex items-center justify-between">
            <div>
              <label className={labelClass}>ASID Hardware Output</label>
              <p className="text-[10px] text-text-muted/60 leading-tight mt-1">
                Send SID register writes to real hardware via MIDI (jsSID only).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={asidEnabled}
                onChange={(e) => setAsidEnabled(e.target.checked)}
                disabled={sidEngine !== 'jssid'}
                className="sr-only peer"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${
                sidEngine !== 'jssid'
                  ? 'bg-dark-border/30 cursor-not-allowed'
                  : asidEnabled
                    ? 'bg-blue-600'
                    : 'bg-dark-border peer-hover:bg-dark-border/80'
              }`}>
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  asidEnabled && sidEngine === 'jssid' ? 'translate-x-4' : ''
                }`} />
              </div>
            </label>
          </div>
          {sidEngine !== 'jssid' && (
            <p className="text-[10px] text-yellow-400/60 leading-tight">
              Switch to jsSID engine to enable ASID hardware output.
            </p>
          )}
        </div>

        {/* Voice Mask */}
        <div className={sectionClass}>
          <label className={labelClass}>Voice Mask</label>
          <div className="flex items-center gap-4">
            {[0, 1, 2].map((i) => (
              <label key={i} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceMask[i]}
                  onChange={() => handleVoiceToggle(i)}
                  className="w-3.5 h-3.5 rounded border-dark-border bg-dark-bgPrimary text-blue-500 focus:ring-blue-500/30"
                />
                <span className="text-xs text-text-secondary">Voice {i + 1}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-text-muted/60 leading-tight">
            Mute individual SID voices for analysis or remixing.
          </p>
        </div>

        {/* Buffer Size */}
        <div className={sectionClass}>
          <label className={labelClass}>Audio Buffer Size</label>
          <select
            value={bufferSize}
            onChange={(e) => setBufferSize(Number(e.target.value) as BufferSize)}
            className={selectClass}
          >
            <option value={4096}>4096 samples (~93ms)</option>
            <option value={8192}>8192 samples (~186ms)</option>
            <option value={16384}>16384 samples (~372ms)</option>
          </select>
          <p className="text-[10px] text-text-muted/60 leading-tight">
            Smaller buffers reduce latency but may cause audio glitches on slower devices.
          </p>
        </div>

      </div>
    </div>
  );
};
