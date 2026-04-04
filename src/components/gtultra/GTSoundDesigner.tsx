/**
 * GTSoundDesigner — Noob-friendly visual SID instrument editor.
 *
 * Alternative to the hex-based Tables tab. Provides drag-to-draw canvases,
 * waveform step timelines, preset cards, and arpeggio grids — all reading
 * and writing the same underlying GT store table data.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import {
  SID_PRESETS,
  getPresetCategories,
  getPresetsByCategory,
  applyPresetToInstrument,
  type GTSIDPreset,
} from '@/constants/gtultraPresets';
import {
  ATTACK_MS, DECAY_MS, WAVEFORMS,
  encodeAD, encodeSR,
} from '@/lib/gtultra/GTVisualMapping';
import {
  decodeWaveSequence, encodeWaveSequence, waveformName, waveCommandLabel,
  decodePulseSequence, encodePulseSequence,
  type WaveStep,
} from '@/lib/gtultra/GTTableCodec';

// ── Constants ──────────────────────────────────────────────────────────────

const TABLE_COLORS = {
  wave: '#60e060',
  pulse: '#ff8866',
  filter: '#ffcc00',
  speed: '#6699ff',
};

const CATEGORY_LABELS: Record<string, string> = {
  bass: 'Bass', lead: 'Lead', pad: 'Pad', arp: 'Arp',
  drum: 'Drum', fx: 'FX', classic: 'Classic', template: 'Template',
};

const ARP_CHORDS: { label: string; semitones: number[] }[] = [
  { label: 'Major', semitones: [0, 4, 7] },
  { label: 'Minor', semitones: [0, 3, 7] },
  { label: 'Oct', semitones: [0, 12] },
  { label: 'Power', semitones: [0, 7] },
  { label: 'Dim', semitones: [0, 3, 6] },
  { label: '7th', semitones: [0, 4, 7, 10] },
  { label: 'Sus4', semitones: [0, 5, 7] },
];

// ── Component ──────────────────────────────────────────────────────────────

export const GTSoundDesigner: React.FC = () => {
  const { accent: accentColor, panelBg } = useInstrumentColors('#44ff88', { dim: '#1a3328' });

  // GT store state
  const currentInstrument = useGTUltraStore((s) => s.currentInstrument);
  const instrumentData = useGTUltraStore((s) => s.instrumentData);
  const tableData = useGTUltraStore((s) => s.tableData);
  const engine = useGTUltraStore((s) => s.engine);
  const inst = instrumentData[currentInstrument];

  // Local UI state
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isAuditioning, setIsAuditioning] = useState(false);

  // Derived instrument values
  const attack = (inst?.ad ?? 0) >> 4;
  const decay = (inst?.ad ?? 0) & 0xF;
  const sustain = (inst?.sr ?? 0) >> 4;
  const release = (inst?.sr ?? 0) & 0xF;
  const waveform = (inst?.firstwave ?? 0) & 0xFE;
  const gate = !!((inst?.firstwave ?? 0) & 0x01);
  const gateTimerValue = (inst?.gatetimer ?? 0) & 0x3F;
  const hardRestart = !((inst?.gatetimer ?? 0) & 0x40);
  const vibdelay = inst?.vibdelay ?? 0;

  // Decoded table sequences
  const waveSteps = useMemo(() => {
    if (!tableData?.wave || !inst?.wavePtr) return [];
    return decodeWaveSequence(tableData.wave.left, tableData.wave.right, inst.wavePtr);
  }, [tableData?.wave, inst?.wavePtr]);

  const pulseSteps = useMemo(() => {
    if (!tableData?.pulse || !inst?.pulsePtr) return [];
    return decodePulseSequence(tableData.pulse.left, tableData.pulse.right, inst.pulsePtr);
  }, [tableData?.pulse, inst?.pulsePtr]);

  // ── ADSR Callbacks ──

  const setADSR = useCallback((a: number, d: number, s: number, r: number) => {
    if (!engine) return;
    engine.setInstrumentAD(currentInstrument, encodeAD(a, d));
    engine.setInstrumentSR(currentInstrument, encodeSR(s, r));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);

  // ── Waveform Toggle ──

  const toggleWaveBit = useCallback((bit: number) => {
    if (!engine) return;
    const newWave = ((inst?.firstwave ?? 0) ^ bit);
    engine.setInstrumentFirstwave(currentInstrument, newWave);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, inst?.firstwave]);

  // ── Preset Application ──

  const applyPreset = useCallback((preset: GTSIDPreset) => {
    if (!engine) return;
    applyPresetToInstrument(preset, currentInstrument, engine, tableData);
    useGTUltraStore.getState().refreshAllInstruments();
    useGTUltraStore.getState().refreshAllTables();
  }, [engine, currentInstrument, tableData]);

  // ── Audition ──

  const toggleAudition = useCallback(() => {
    if (!engine) return;
    if (isAuditioning) {
      engine.jamNoteOff(0);
      setIsAuditioning(false);
    } else {
      engine.jamNoteOn(0, 37, currentInstrument); // C-3
      setIsAuditioning(true);
    }
  }, [engine, isAuditioning, currentInstrument]);

  // ── Wave Step Editing ──

  const writeWaveSteps = useCallback((steps: WaveStep[]) => {
    if (!engine || !inst?.wavePtr) return;
    const { left, right } = encodeWaveSequence(steps);
    const ptr = inst.wavePtr - 1; // Convert 1-based to 0-based
    for (let i = 0; i < left.length; i++) {
      engine.setTableEntry(0, 0, ptr + i, left[i]);
      engine.setTableEntry(0, 1, ptr + i, right[i]);
    }
    useGTUltraStore.getState().refreshAllTables();
  }, [engine, inst?.wavePtr]);

  const addWaveStep = useCallback(() => {
    const newSteps = [...waveSteps, {
      waveform: 0x40, gate: true, sync: false, ring: false,
      delay: 0, noteOffset: 0x80,
    }];
    writeWaveSteps(newSteps);
  }, [waveSteps, writeWaveSteps]);

  const removeWaveStep = useCallback((idx: number) => {
    const newSteps = waveSteps.filter((_, i) => i !== idx);
    writeWaveSteps(newSteps);
  }, [waveSteps, writeWaveSteps]);

  // ── Settings Callbacks ──

  const setGateTimer = useCallback((v: number) => {
    if (!engine) return;
    const current = inst?.gatetimer ?? 0;
    engine.setInstrumentGatetimer?.(currentInstrument, (current & 0xC0) | (v & 0x3F));
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument, inst?.gatetimer]);

  const setVibDelay = useCallback((v: number) => {
    if (!engine) return;
    engine.setInstrumentVibdelay?.(currentInstrument, v);
    useGTUltraStore.getState().refreshAllInstruments();
  }, [engine, currentInstrument]);

  // ── Helpers ──

  const SectionLabel = ({ label, color }: { label: string; color?: string }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: color ?? accentColor, opacity: 0.7 }}>{label}</div>
  );

  // Filter presets
  const filteredPresets = activeCategory === 'all'
    ? SID_PRESETS
    : getPresetsByCategory(activeCategory as GTSIDPreset['category']);

  // ADSR envelope SVG path
  const envPath = useMemo(() => {
    const ams = ATTACK_MS[attack], dms = DECAY_MS[decay], rms = DECAY_MS[release];
    const sLevel = sustain / 15;
    const totalMs = ams + dms + Math.max(rms, 200);
    if (totalMs === 0) return '';
    const w = 200, h = 60, scale = w / totalMs;
    const x1 = ams * scale, x2 = x1 + dms * scale, x3 = x2 + 200 * scale, x4 = x3 + rms * scale;
    return `M0,${h} L${x1.toFixed(1)},2 L${x2.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x3.toFixed(1)},${(h * (1 - sLevel)).toFixed(1)} L${x4.toFixed(1)},${h}`;
  }, [attack, decay, sustain, release]);

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ── Preset Bar ── */}
      <div className={`rounded-lg border p-2 ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <SectionLabel label="Presets" />
          <button
            onClick={toggleAudition}
            className="px-3 py-1 text-[10px] font-bold rounded ml-auto"
            style={{
              background: isAuditioning ? '#ff4444' : accentColor,
              color: '#000',
            }}
          >
            {isAuditioning ? 'STOP' : '▶ PLAY'}
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-1 mb-2 flex-wrap">
          <button
            className="px-2 py-0.5 text-[9px] font-mono rounded"
            style={{
              background: activeCategory === 'all' ? accentColor : 'transparent',
              color: activeCategory === 'all' ? '#000' : '#666',
              border: `1px solid ${activeCategory === 'all' ? accentColor : '#333'}`,
            }}
            onClick={() => setActiveCategory('all')}
          >All</button>
          {getPresetCategories().map(cat => (
            <button
              key={cat}
              className="px-2 py-0.5 text-[9px] font-mono rounded"
              style={{
                background: activeCategory === cat ? accentColor : 'transparent',
                color: activeCategory === cat ? '#000' : '#666',
                border: `1px solid ${activeCategory === cat ? accentColor : '#333'}`,
              }}
              onClick={() => setActiveCategory(cat)}
            >{CATEGORY_LABELS[cat] || cat}</button>
          ))}
        </div>

        {/* Preset cards */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
          {filteredPresets.map((preset, i) => (
            <button
              key={i}
              onClick={() => applyPreset(preset)}
              className="flex-shrink-0 px-3 py-2 rounded text-left"
              style={{
                background: '#111',
                border: '1px solid #333',
                minWidth: 120,
              }}
            >
              <div className="text-[10px] font-bold" style={{ color: accentColor }}>{preset.name}</div>
              <div className="text-[8px] text-text-secondary mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 3-Column Grid ── */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>

        {/* ════ Column 1: ADSR + Waveform Sequence ════ */}
        <div className="flex flex-col gap-3">

          {/* ADSR */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="ADSR Envelope" />
            <div className="rounded px-1 mb-2" style={{ background: '#060a08' }}>
              <svg viewBox="0 0 200 60" width="100%" height={60} preserveAspectRatio="none">
                {envPath && <path d={envPath} fill="none" stroke={accentColor} strokeWidth={1.5} opacity={0.8} />}
              </svg>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'A', value: attack, table: ATTACK_MS, set: (v: number) => setADSR(v, decay, sustain, release) },
                { label: 'D', value: decay, table: DECAY_MS, set: (v: number) => setADSR(attack, v, sustain, release) },
                { label: 'S', value: sustain, table: null, set: (v: number) => setADSR(attack, decay, v, release) },
                { label: 'R', value: release, table: DECAY_MS, set: (v: number) => setADSR(attack, decay, sustain, v) },
              ].map(({ label, value, table, set }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-bold text-text-secondary">{label}</span>
                  <input type="range" min={0} max={15} value={value}
                    onChange={(e) => set(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor }} />
                  <span className="text-[8px] font-mono" style={{ color: accentColor }}>
                    {table ? (table[value] >= 1000 ? `${(table[value] / 1000).toFixed(1)}s` : `${table[value]}ms`) : `${Math.round(value / 15 * 100)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Waveform Sequence */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Waveform Sequence" color={TABLE_COLORS.wave} />

            {/* Waveform buttons for firstwave */}
            <div className="flex gap-1.5 mb-3">
              {WAVEFORMS.map(wf => {
                const active = !!(waveform & wf.bit);
                return (
                  <button key={wf.bit} onClick={() => toggleWaveBit(wf.bit)}
                    className="px-2 py-1 text-[10px] font-mono rounded"
                    style={{
                      background: active ? TABLE_COLORS.wave : '#111',
                      color: active ? '#000' : '#555',
                      border: `1px solid ${active ? TABLE_COLORS.wave : '#333'}`,
                    }}>
                    {wf.shortName}
                  </button>
                );
              })}
              <button onClick={() => toggleWaveBit(0x01)}
                className="px-2 py-1 text-[10px] font-mono rounded"
                style={{
                  background: gate ? TABLE_COLORS.wave + '40' : '#111',
                  color: gate ? TABLE_COLORS.wave : '#555',
                  border: `1px solid ${gate ? TABLE_COLORS.wave : '#333'}`,
                }}>
                GATE
              </button>
            </div>

            {/* Wave table steps */}
            {waveSteps.length > 0 ? (
              <div className="flex flex-col gap-1">
                {waveSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded"
                    style={{ background: '#0a0f0c', border: '1px solid #1a3328' }}>
                    <span className="text-[9px] font-mono w-4" style={{ color: '#555' }}>{i + 1}</span>
                    {step.isCommand ? (
                      <span className="text-[9px] font-mono" style={{ color: '#888' }}>
                        {waveCommandLabel(step.cmdByte ?? 0)} ${(step.cmdParam ?? 0).toString(16).toUpperCase().padStart(2, '0')}
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] font-bold" style={{ color: TABLE_COLORS.wave }}>
                          {waveformName(step.waveform)}
                        </span>
                        {step.gate && <span className="text-[8px]" style={{ color: TABLE_COLORS.wave }}>G</span>}
                        {step.delay > 0 && (
                          <span className="text-[8px] font-mono text-text-secondary">
                            +{step.delay}f
                          </span>
                        )}
                        {step.noteOffset !== 0x80 && step.noteOffset !== 0 && (
                          <span className="text-[8px] font-mono" style={{ color: TABLE_COLORS.speed }}>
                            n:{step.noteOffset.toString(16).toUpperCase()}
                          </span>
                        )}
                      </>
                    )}
                    <button onClick={() => removeWaveStep(i)}
                      className="ml-auto text-[9px] text-text-secondary hover:text-red-400"
                    >x</button>
                  </div>
                ))}
                <button onClick={addWaveStep}
                  className="text-[9px] font-mono py-1 rounded"
                  style={{ color: TABLE_COLORS.wave, border: `1px dashed ${TABLE_COLORS.wave}40` }}>
                  + Add Step
                </button>
              </div>
            ) : (
              <div className="text-[9px] text-text-secondary text-center py-4">
                {inst?.wavePtr ? 'No wave table data at this pointer' : 'No wave table assigned'}
                <br />
                <button onClick={addWaveStep} className="mt-2 text-[9px] font-mono py-1 px-3 rounded"
                  style={{ color: TABLE_COLORS.wave, border: `1px dashed ${TABLE_COLORS.wave}40` }}>
                  + Create Wave Sequence
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ════ Column 2: Pulse Width + Filter ════ */}
        <div className="flex flex-col gap-3">

          {/* Pulse Width */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Pulse Width" color={TABLE_COLORS.pulse} />
            {pulseSteps.length > 0 ? (
              <div className="flex flex-col gap-1">
                {pulseSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded"
                    style={{ background: '#0a0f0c', border: '1px solid #2a1a18' }}>
                    <span className="text-[9px] font-mono w-4" style={{ color: '#555' }}>{i + 1}</span>
                    {step.type === 'set' ? (
                      <span className="text-[10px] font-mono" style={{ color: TABLE_COLORS.pulse }}>
                        PW={step.value} ({Math.round(step.value / 4095 * 100)}%)
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono" style={{ color: TABLE_COLORS.pulse }}>
                        Sweep {step.speed < 0x80 ? '↑' : '↓'} x{step.value} frames
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[9px] text-text-secondary text-center py-4">
                {inst?.pulsePtr ? 'No pulse table data' : 'No pulse table assigned'}
              </div>
            )}

            {/* Quick PWM presets */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {[
                { label: '50%', steps: [{ type: 'set' as const, value: 2048, speed: 0 }] },
                { label: 'Sweep ↑', steps: [{ type: 'set' as const, value: 512, speed: 0 }, { type: 'mod' as const, value: 64, speed: 8 }] },
                { label: 'Sweep ↓', steps: [{ type: 'set' as const, value: 3584, speed: 0 }, { type: 'mod' as const, value: 64, speed: 0xF8 }] },
                { label: 'Wobble', steps: [{ type: 'set' as const, value: 2048, speed: 0 }, { type: 'mod' as const, value: 32, speed: 6 }, { type: 'mod' as const, value: 32, speed: 0xFA }] },
              ].map(preset => (
                <button key={preset.label}
                  className="px-2 py-0.5 text-[8px] font-mono rounded"
                  style={{ color: TABLE_COLORS.pulse, border: `1px solid ${TABLE_COLORS.pulse}40` }}
                  onClick={() => {
                    if (!engine || !inst?.pulsePtr) return;
                    const { left, right } = encodePulseSequence(preset.steps);
                    const ptr = inst.pulsePtr - 1;
                    for (let i = 0; i < left.length; i++) {
                      engine.setTableEntry(1, 0, ptr + i, left[i]);
                      engine.setTableEntry(1, 1, ptr + i, right[i]);
                    }
                    useGTUltraStore.getState().refreshAllTables();
                  }}
                >{preset.label}</button>
              ))}
            </div>
          </div>

          {/* Filter (placeholder — shows current state) */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Filter" color={TABLE_COLORS.filter} />
            <div className="text-[9px] text-text-secondary text-center py-4">
              {inst?.filterPtr ? (
                <span>Filter table at ${(inst.filterPtr).toString(16).toUpperCase().padStart(2, '0')}</span>
              ) : (
                'No filter table assigned'
              )}
            </div>
            <div className="text-[8px] text-text-secondary opacity-60 text-center">
              Visual filter editor coming soon — use Tables tab for now
            </div>
          </div>
        </div>

        {/* ════ Column 3: Arpeggio + Settings ════ */}
        <div className="flex flex-col gap-3">

          {/* Arpeggio Quick Chords */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Arpeggio" color={TABLE_COLORS.speed} />
            <div className="flex gap-1 flex-wrap">
              {ARP_CHORDS.map(chord => (
                <button key={chord.label}
                  className="px-2.5 py-1 text-[9px] font-mono rounded"
                  style={{ color: TABLE_COLORS.speed, border: `1px solid ${TABLE_COLORS.speed}40` }}
                  onClick={() => {
                    if (!engine || !inst?.speedPtr) return;
                    // Write arpeggio pattern: each semitone as a speed table entry
                    const ptr = inst.speedPtr - 1;
                    for (let i = 0; i < chord.semitones.length; i++) {
                      // Speed table: left=0 for arp, right=semitone offset
                      engine.setTableEntry(3, 0, ptr + i, 0);
                      engine.setTableEntry(3, 1, ptr + i, chord.semitones[i]);
                    }
                    useGTUltraStore.getState().refreshAllTables();
                  }}
                >{chord.label} ({chord.semitones.join(',')})</button>
              ))}
            </div>
            <div className="text-[9px] text-text-secondary mt-2">
              {inst?.speedPtr ? (
                <span>Speed table at ${(inst.speedPtr).toString(16).toUpperCase().padStart(2, '0')}</span>
              ) : (
                'No speed table assigned'
              )}
            </div>
          </div>

          {/* Instrument Settings */}
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Settings" />
            <div className="flex flex-col gap-3">

              {/* Gate Timer */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-text-secondary">Gate Timer</span>
                  <span className="text-[9px] font-mono" style={{ color: accentColor }}>{gateTimerValue}</span>
                </div>
                <input type="range" min={0} max={63} value={gateTimerValue}
                  onChange={(e) => setGateTimer(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor }} />
                <div className="text-[8px] text-text-secondary opacity-60">
                  Note duration in frames (0 = default)
                </div>
              </div>

              {/* Vibrato Delay */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-text-secondary">Vibrato Delay</span>
                  <span className="text-[9px] font-mono" style={{ color: accentColor }}>{vibdelay}</span>
                </div>
                <input type="range" min={0} max={255} value={vibdelay}
                  onChange={(e) => setVibDelay(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor }} />
                <div className="text-[8px] text-text-secondary opacity-60">
                  Frames before vibrato starts (0 = off)
                </div>
              </div>

              {/* Hard Restart */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hardRestart}
                  onChange={() => {
                    if (!engine) return;
                    const gt = inst?.gatetimer ?? 0;
                    engine.setInstrumentGatetimer?.(currentInstrument, gt ^ 0x40);
                    useGTUltraStore.getState().refreshAllInstruments();
                  }}
                  style={{ accentColor }} />
                <span className="text-[9px] text-text-secondary">Hard Restart</span>
              </label>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
