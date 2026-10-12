/**
 * SIDSettingsTab — DOM SID engine settings panel.
 * Engine selection, chip model, clock speed, ASID toggle, voice mask, buffer size.
 */

import React, { useCallback } from 'react';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import type { SIDEngineType } from '@engine/deepsid/DeepSIDEngineManager';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useMixerStore } from '@stores/useMixerStore';
import { useFormatStore } from '@stores/useFormatStore';
import { notify } from '@stores/useNotificationStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { Toggle } from '@components/controls/Toggle';
import { sidVoiceCount, type SidBufferSizeSetting, type SidChipModelSetting, type SidClockSetting } from '@/lib/sid/SIDHeaderParser';

interface SIDSettingsTabProps {
  className?: string;
}

export const SIDSettingsTab: React.FC<SIDSettingsTabProps> = ({ className }) => {
  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const sidHwMode = useSettingsStore((s) => s.sidHardwareMode);

  const chipModel = useSettingsStore((s) => s.sidChipModel);
  const setChipModel = useSettingsStore((s) => s.setSidChipModel);
  const clockSpeed = useSettingsStore((s) => s.sidClockSpeed);
  const setClockSpeed = useSettingsStore((s) => s.setSidClockSpeed);
  const bufferSize = useSettingsStore((s) => s.sidBufferSize);
  const setBufferSize = useSettingsStore((s) => s.setSidBufferSize);
  // ASID: the same setting the toolbar's ASID button writes (jsSID reads it when the tune starts).
  const asidEnabled = useSettingsStore((s) => s.asidEnabled);
  const setAsidEnabled = useSettingsStore((s) => s.setAsidEnabled);
  // Voice Mask: the song's channel mutes (one channel per SID voice) - the mixer's, not a second copy.
  const voiceCount = useFormatStore((s) => sidVoiceCount(s.sidMetadata));
  const voiceMuted = useMixerStore((s) => s.channels.slice(0, voiceCount).map((c) => c.muted).join(','));
  const setChannelMute = useMixerStore((s) => s.setChannelMute);

  const handleEngineChange = useCallback((value: string) => {
    const engine = value as SIDEngineType;
    setSidEngine(engine);
    notify.success(`SID engine changed to ${SID_ENGINES[engine].name}`);
  }, [setSidEngine]);

  const sectionClass = 'bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4 space-y-3';
  const labelClass = 'text-xs font-medium text-text-muted';
  const selectClass = 'w-full text-sm bg-dark-bg border border-dark-borderLight rounded px-2 py-1.5 text-text-primary';

  return (
    <div className={className}>
      <div className="space-y-4">

        {/* Engine Selection */}
        <div className={sectionClass}>
          <label className={labelClass}>SID Engine</label>
          <CustomSelect
            value={sidEngine}
            onChange={handleEngineChange}
            options={Object.values(SID_ENGINES).map((eng) => ({
              value: eng.id,
              label: `${eng.name} — ${eng.accuracy}, ${eng.speed} (${eng.size})${eng.features.asidHardware ? ' ★ HW' : ''}`,
            }))}
            className={selectClass}
          />
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
          <CustomSelect
            value={chipModel}
            onChange={(v) => setChipModel(v as SidChipModelSetting)}
            options={[
              { value: 'auto', label: 'Auto (use file header)' },
              { value: '6581', label: 'MOS 6581' },
              { value: '8580', label: 'MOS 8580' },
            ]}
            className={selectClass}
          />
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
          <CustomSelect
            value={clockSpeed}
            onChange={(v) => setClockSpeed(v as SidClockSetting)}
            options={[
              { value: 'auto', label: 'Auto (use file header)' },
              { value: 'PAL', label: 'PAL (50 Hz)' },
              { value: 'NTSC', label: 'NTSC (60 Hz)' },
            ]}
            className={selectClass}
          />
          <p className="text-[10px] text-text-muted/60 leading-tight">
            {clockSpeed === 'auto'
              ? 'Uses the clock speed specified in the SID file header.'
              : clockSpeed === 'PAL'
                ? 'European PAL timing (985248 Hz CPU). Most C64 music is composed for PAL.'
                : 'American NTSC timing (1022727 Hz CPU). Slightly faster playback.'}
            {' '}Takes effect from the next play, and the next DJ deck load renders the tune on it.
          </p>
        </div>

        {/* ASID Hardware Output */}
        <div className={sectionClass}>
          <Toggle
            label="ASID Hardware Output"
            value={asidEnabled}
            onChange={setAsidEnabled}
            disabled={sidEngine !== 'jssid'}
            size="sm"
          />
          <p className="text-[10px] text-text-muted/60 leading-tight">
            Send SID register writes to real hardware via MIDI (jsSID only). Takes effect from the next play.
          </p>
          {sidEngine !== 'jssid' && (
            <p className="text-[10px] text-accent-warning leading-tight">
              Switch to jsSID engine to enable ASID hardware output.
            </p>
          )}
        </div>

        {/* Voice Mask */}
        <div className={sectionClass}>
          <label className={labelClass}>Voice Mask</label>
          <div className="flex flex-wrap items-center gap-4">
            {voiceMuted.split(',').map((muted, i) => (
              <Toggle
                key={i}
                label={voiceCount > 3 ? `Chip ${Math.floor(i / 3) + 1} Voice ${(i % 3) + 1}` : `Voice ${i + 1}`}
                value={muted !== 'true'}
                onChange={(on) => setChannelMute(i, !on)}
                size="sm"
              />
            ))}
          </div>
          <p className="text-[10px] text-text-muted/60 leading-tight">
            Mute individual SID voices for analysis or remixing (the song&apos;s channel mutes).
          </p>
        </div>

        {/* Buffer Size */}
        <div className={sectionClass}>
          <label className={labelClass}>Audio Buffer Size</label>
          <CustomSelect
            value={String(bufferSize)}
            onChange={(v) => setBufferSize((v === 'auto' ? 'auto' : Number(v)) as SidBufferSizeSetting)}
            options={[
              { value: 'auto', label: 'Auto (each engine\'s own)' },
              { value: '1024', label: '1024 samples (~23ms)' },
              { value: '2048', label: '2048 samples (~46ms)' },
              { value: '4096', label: '4096 samples (~93ms)' },
              { value: '8192', label: '8192 samples (~186ms)' },
              { value: '16384', label: '16384 samples (~372ms)' },
            ]}
            className={selectClass}
          />
          <p className="text-[10px] text-text-muted/60 leading-tight">
            Smaller buffers reduce latency but may cause audio glitches on slower devices. Takes effect from the next play.
          </p>
        </div>

      </div>
    </div>
  );
};
