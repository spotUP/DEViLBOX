/**
 * FredControls.tsx — Fred Editor (PWM synthesis) instrument editor
 *
 * Exposes all FredConfig parameters: ADSR envelope, vibrato, arpeggio,
 * and PWM pulse-width modulation controls.
 *
 * When loaded via UADE (uadeChipRam present), scalar params are also written
 * directly to chip RAM so UADE picks them up on the next note trigger.
 *
 * Fred instrument byte layout (64 bytes at instrBase):
 *   +0..+3   : pointer (uint32) — skip
 *   +4..+5   : loopPtr (int16)  — skip
 *   +6..+7   : length (uint16)  — skip
 *   +8..+9   : relative (uint16 BE)   ✓ writeU16
 *   +10      : vibratoDelay (uint8)   ✓ writeU8
 *   +11      : (skip)
 *   +12      : vibratoSpeed (uint8)   ✓ writeU8
 *   +13      : vibratoDepth (uint8)   ✓ writeU8
 *   +14      : envelopeVol (uint8)    ✓ writeU8
 *   +15      : attackSpeed (uint8)    ✓ writeU8
 *   +16      : attackVol (uint8)      ✓ writeU8
 *   +17      : decaySpeed (uint8)     ✓ writeU8
 *   +18      : decayVol (uint8)       ✓ writeU8
 *   +19      : sustainTime (uint8)    ✓ writeU8
 *   +20      : releaseSpeed (uint8)   ✓ writeU8
 *   +21      : releaseVol (uint8)     ✓ writeU8
 *   +22..+37 : arpeggio[16] (int8×16) ✓ writeBlock
 *   +38      : arpeggioSpeed (uint8)  ✓ writeU8
 *   +39      : type (int8) — skip (sample type)
 *   +40      : pulseRateNeg (int8)    ✓ writeS8
 *   +41      : pulseRatePos (uint8)   ✓ writeU8
 *   +42      : pulseSpeed (uint8)     ✓ writeU8
 *   +43      : pulsePosL (uint8)      ✓ writeU8
 *   +44      : pulsePosH (uint8)      ✓ writeU8
 *   +45      : pulseDelay (uint8)     ✓ writeU8
 *   +51      : arpeggioLimit (uint8)  ✓ writeU8
 *   +52..+63 : padding
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { FredConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { EnvelopeVisualization, SequenceEditor } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { Download } from 'lucide-react';

interface FredControlsProps {
  config: FredConfig;
  onChange: (updates: Partial<FredConfig>) => void;
  /** Present when this instrument was loaded via UADE's native Fred parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type FredTab = 'envelope' | 'pwm' | 'arpeggio' | 'vibrato';

const ARP_PRESETS: SequencePreset[] = [
  { name: 'Major',  data: [0, 4, 7, 0, 4, 7, 12, 12, 0, 4, 7, 0, 4, 7, 12, 12], loop: 0 },
  { name: 'Minor',  data: [0, 3, 7, 0, 3, 7, 12, 12, 0, 3, 7, 0, 3, 7, 12, 12], loop: 0 },
  { name: 'Octave', data: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12], loop: 0 },
  { name: 'Clear',  data: new Array(16).fill(0) },
];

export const FredControls: React.FC<FredControlsProps> = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = useState<FredTab>('envelope');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  function getEditor(): UADEChipEditor | null {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ff8800';
  const knob    = isCyan ? '#00ffff' : '#ffaa44';
  const dim     = isCyan ? '#004444' : '#332200';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a0e00] border-orange-900/30';

  /**
   * Like `upd`, but also writes to chip RAM when a UADE context is active.
   * `chipWriter` receives the editor and instrBase address.
   */
  async function updWithChipRam<K extends keyof FredConfig>(
    key: K,
    value: FredConfig[K],
    chipWriter?: (editor: UADEChipEditor, base: number) => Promise<void>
  ): Promise<void> {
    onChange({ [key]: value } as Partial<FredConfig>);
    const editor = getEditor();
    if (editor && uadeChipRam && chipWriter) {
      chipWriter(editor, uadeChipRam.instrBase).catch(console.error);
    }
  }

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  const NumBox: React.FC<{
    label: string; value: number; min: number; max: number;
    onChange: (v: number) => void; signed?: boolean; width?: string;
  }> = ({ label, value, min, max, onChange: onBx, signed, width = '52px' }) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-20 text-right whitespace-nowrap">{label}</span>
      <input
        type="number"
        value={value}
        min={signed ? min : Math.max(0, min)}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onBx(Math.max(min, Math.min(max, v)));
        }}
        className="text-xs font-mono text-center border rounded px-1 py-0.5"
        style={{ width, background: '#0a0800', borderColor: dim, color: accent }}
      />
    </div>
  );

  // ── ENVELOPE TAB ──
  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Envelope" />

        {/* Envelope curve visualization */}
        <div className="mb-3">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.attackVol}    attackSpeed={config.attackSpeed}
            decayVol={config.decayVol}      decaySpeed={config.decaySpeed}
            sustainVol={config.envelopeVol} sustainLen={config.sustainTime}
            releaseVol={config.releaseVol}  releaseSpeed={config.releaseSpeed}
            maxVol={64}
            width={320} height={72}
            color={accent}
          />
        </div>

        <div className="grid grid-cols-4 gap-3 mb-3">
          {/* Attack */}
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.attackVol} min={0} max={64} step={1}
              onChange={(v) => void updWithChipRam('attackVol', Math.round(v), async (ed, base) => { await ed.writeU8(base + 16, Math.round(v)); })}
              label="Atk Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.attackSpeed} min={1} max={255} step={1}
              onChange={(v) => void updWithChipRam('attackSpeed', Math.round(v), async (ed, base) => { await ed.writeU8(base + 15, Math.round(v)); })}
              label="Atk Spd" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          {/* Decay */}
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.decayVol} min={0} max={64} step={1}
              onChange={(v) => void updWithChipRam('decayVol', Math.round(v), async (ed, base) => { await ed.writeU8(base + 18, Math.round(v)); })}
              label="Dec Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.decaySpeed} min={1} max={255} step={1}
              onChange={(v) => void updWithChipRam('decaySpeed', Math.round(v), async (ed, base) => { await ed.writeU8(base + 17, Math.round(v)); })}
              label="Dec Spd" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          {/* Sustain */}
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.sustainTime} min={0} max={255} step={1}
              onChange={(v) => void updWithChipRam('sustainTime', Math.round(v), async (ed, base) => { await ed.writeU8(base + 19, Math.round(v)); })}
              label="Sus Time" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.envelopeVol} min={0} max={64} step={1}
              onChange={(v) => void updWithChipRam('envelopeVol', Math.round(v), async (ed, base) => { await ed.writeU8(base + 14, Math.round(v)); })}
              label="Init Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          {/* Release */}
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.releaseVol} min={0} max={64} step={1}
              onChange={(v) => void updWithChipRam('releaseVol', Math.round(v), async (ed, base) => { await ed.writeU8(base + 21, Math.round(v)); })}
              label="Rel Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.releaseSpeed} min={1} max={255} step={1}
              onChange={(v) => void updWithChipRam('releaseSpeed', Math.round(v), async (ed, base) => { await ed.writeU8(base + 20, Math.round(v)); })}
              label="Rel Spd" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Relative Tuning" />
        <div className="flex items-center gap-4">
          <Knob value={config.relative} min={256} max={4096} step={1}
            onChange={(v) => void updWithChipRam('relative', Math.round(v), async (ed, base) => { await ed.writeU16(base + 8, Math.round(v)); })}
            label="Relative" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-gray-500 max-w-[120px]">
            1024 = no shift. Values &lt;1024 pitch down, &gt;1024 pitch up.
          </span>
        </div>
      </div>
    </div>
  );

  // ── PWM TAB ──
  const renderPWM = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Pulse Width Range" />
        <div className="flex items-center gap-4">
          <Knob value={config.pulsePosL} min={0} max={64} step={1}
            onChange={(v) => void updWithChipRam('pulsePosL', Math.round(v), async (ed, base) => { await ed.writeU8(base + 43, Math.round(v)); })}
            label="Low" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.pulsePosH} min={0} max={64} step={1}
            onChange={(v) => void updWithChipRam('pulsePosH', Math.round(v), async (ed, base) => { await ed.writeU8(base + 44, Math.round(v)); })}
            label="High" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <div className="flex-1 h-4 rounded relative overflow-hidden" style={{ background: '#111', border: `1px solid ${dim}` }}>
            <div className="absolute h-full" style={{
              left: `${(config.pulsePosL / 64) * 100}%`,
              width: `${Math.max(0, (config.pulsePosH - config.pulsePosL) / 64 * 100)}%`,
              background: accent,
              opacity: 0.4,
            }} />
          </div>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="PWM Modulation" />
        <div className="flex flex-wrap gap-3">
          <Knob value={config.pulseSpeed} min={1} max={255} step={1}
            onChange={(v) => void updWithChipRam('pulseSpeed', Math.round(v), async (ed, base) => { await ed.writeU8(base + 42, Math.round(v)); })}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.pulseDelay} min={0} max={255} step={1}
            onChange={(v) => void updWithChipRam('pulseDelay', Math.round(v), async (ed, base) => { await ed.writeU8(base + 45, Math.round(v)); })}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.pulseRatePos} min={0} max={127} step={1}
            onChange={(v) => void updWithChipRam('pulseRatePos', Math.round(v), async (ed, base) => { await ed.writeU8(base + 41, Math.round(v)); })}
            label="Rate +" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.pulseRateNeg} min={-128} max={0} step={1}
            onChange={(v) => void updWithChipRam('pulseRateNeg', Math.round(v), async (ed, base) => { await ed.writeS8(base + 40, Math.round(v)); })}
            label="Rate -" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2 text-[9px] text-gray-600 font-mono">
          PWM sweeps pulse width from Low→High at +Rate then High→Low at |Rate-|
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──
  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Arpeggio Settings" />
        <div className="flex gap-4 mb-3">
          <NumBox label="Active Steps" value={config.arpeggioLimit} min={0} max={16}
            onChange={(v) => void updWithChipRam('arpeggioLimit', v, async (ed, base) => { await ed.writeU8(base + 51, v); })} />
          <NumBox label="Speed (ticks)" value={config.arpeggioSpeed} min={1} max={255}
            onChange={(v) => void updWithChipRam('arpeggioSpeed', v, async (ed, base) => { await ed.writeU8(base + 38, v); })} />
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Arpeggio Table (semitone offsets)" />
        <SequenceEditor
          label="Arpeggio"
          data={config.arpeggio}
          onChange={(d) => void updWithChipRam('arpeggio', d, async (ed, base) => {
            const bytes = d.slice(0, 16).map((v) => v < 0 ? v + 256 : v);
            await ed.writeBlock(base + 22, bytes);
          })}
          min={-64} max={63}
          bipolar
          fixedLength
          showNoteNames
          presets={ARP_PRESETS}
          color={accent}
          height={100}
        />
        <p className="text-[9px] text-gray-600 mt-1">
          Steps 0–{config.arpeggioLimit - 1} active (set by Active Steps limit above)
        </p>
      </div>
    </div>
  );

  // ── VIBRATO TAB ──
  const renderVibrato = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => void updWithChipRam('vibratoDelay', Math.round(v), async (ed, base) => { await ed.writeU8(base + 10, Math.round(v)); })}
            label="Delay" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => void updWithChipRam('vibratoSpeed', Math.round(v), async (ed, base) => { await ed.writeU8(base + 12, Math.round(v)); })}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={63} step={1}
            onChange={(v) => void updWithChipRam('vibratoDepth', Math.round(v), async (ed, base) => { await ed.writeU8(base + 13, Math.round(v)); })}
            label="Depth" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2 text-[9px] text-gray-600 font-mono">
          Depth in 1/64th semitone units. Speed = ticks per LFO step.
        </div>
      </div>
    </div>
  );

  const TABS: { id: FredTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'pwm',      label: 'PWM' },
    { id: 'arpeggio', label: 'Arpeggio' },
    { id: 'vibrato',  label: 'Vibrato' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {TABS.map(({ id, label }) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#1a0e00') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-1 border-b" style={{ borderColor: dim }}>
          <button
            onClick={() => {
              const editor = getEditor();
              if (editor && uadeChipRam) {
                editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, 'fred_module.fred')
                  .catch(console.error);
              }
            }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors"
            title="Export module with current edits"
          >
            <Download size={10} />
            Export .fred (Amiga)
          </button>
        </div>
      )}
      {activeTab === 'envelope' && renderEnvelope()}
      {activeTab === 'pwm'      && renderPWM()}
      {activeTab === 'arpeggio' && renderArpeggio()}
      {activeTab === 'vibrato'  && renderVibrato()}
    </div>
  );
};
