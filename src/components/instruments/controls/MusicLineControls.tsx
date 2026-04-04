/**
 * MusicLineControls -- Comprehensive instrument editor for MusicLine Editor.
 *
 * Exposes all 11 effect modules, each independently enabled via bit flags.
 * Reads/writes instrument parameters directly to WASM via MusicLineEngine.
 *
 * Instrument struct layout (206 bytes total, offsets from inst_Title):
 *   +0   title[32]
 *   +32  smplNumber[1]
 *   +33  smplType[1]
 *   +34  smplPointer[4]  (ignore)
 *   +38  smplLength[2]
 *   +40  smplRepPointer[4] (ignore)
 *   +44  smplRepLength[2]
 *   +46  fineTune[2]     (signed)
 *   +48  semiTone[2]     (signed)
 *   +50  smplStart[2]
 *   +52  smplEnd[2]
 *   +54  smplRepStart[2]
 *   +56  smplRepLen[2]
 *   +58  volume[2]
 *   +60  transpose[1]
 *   +61  slideSpeed[1]
 *   +62  effects1[1]     (bits 0-5: ADSR, Vibrato, Tremolo, Arpeggio, Loop, Transform)
 *   +63  effects2[1]     (bits 0-4: Phase, Mix, Resonance, Filter, HoldSustain)
 *   +64  ADSR (24 bytes: 4 stages x {Length u16, Speed u16, Volume u16})
 *   +88  Vibrato (12 bytes: Dir u8, WaveNum u8, Speed u16, Delay u16, AtkSpd u16, Attack u16, Depth u16)
 *   +100 Tremolo (12 bytes: same structure as Vibrato)
 *   +112 Arpeggio (4 bytes: ArpTable u16, ArpSpeed u8, ArpGroove u8)
 *   +116 Transform (18 bytes: 5xWaveNum u8 + pad u8 + Start u16, Repeat u16, RepEnd u16, Speed u16, Turns u16, Delay u16)
 *   +134 Phase (14 bytes: Type u16, Start u16, Repeat u16, RepEnd u16, Speed u16, Turns u16, Delay u16)
 *   +148 Mix (14 bytes: WaveNum u8, pad u8, Start u16, Repeat u16, RepEnd u16, Speed u16, Turns u16, Delay u16)
 *   +162 Resonance (14 bytes: Amp u8, FilBoost u8, Start u16, Repeat u16, RepEnd u16, Speed u16, Turns u16, Delay u16)
 *   +176 Filter (14 bytes: Type u8, pad u8, Start u16, Repeat u16, RepEnd u16, Speed u16, Turns u16, Delay u16)
 *   +190 Loop (16 bytes: Start u16, Repeat u16, RepEnd u16, Length u16, LpStep u16, Wait u16, Delay u16, Turns u16)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { MusicLineArpeggioEditor } from '@/components/musicline/MusicLineArpeggioEditor';

// ── Constants ──────────────────────────────────────────────────────────────────

const PAL_C3_RATE = 8287;
const BRAND_COLOR = '#7070ff';

const LOOP_SIZE_DEFS: Record<number, { samples: number; approxNote: string }> = {
  1: { samples: 16,  approxNote: 'C-4' },
  2: { samples: 32,  approxNote: 'C-3' },
  3: { samples: 64,  approxNote: 'C-2' },
  4: { samples: 128, approxNote: 'C-1' },
  5: { samples: 256, approxNote: 'C-0' },
};

// ── Instrument field offset map ────────────────────────────────────────────────
// All offsets relative to start of 206-byte INST chunk (after title at +0)

// Effects1 bits: 0=ADSR, 1=Vibrato, 2=Tremolo, 3=Arpeggio, 4=Loop, 5=Transform
// Effects2 bits: 0=Phase, 1=Mix, 2=Resonance, 3=Filter, 4=HoldSustain

const OFF = {
  // Header
  volume:     58,
  transpose:  60,
  slideSpeed: 61,
  effects1:   62,
  effects2:   63,

  // ADSR (+64, 24 bytes: 4 stages x {Length u16, Speed u16, Volume u16})
  atkLength:  64,
  atkSpeed:   66,
  atkVolume:  68,
  decLength:  70,
  decSpeed:   72,
  decVolume:  74,
  susLength:  76,
  susSpeed:   78,
  susVolume:  80,
  relLength:  82,
  relSpeed:   84,
  relVolume:  86,

  // Vibrato (+88, 12 bytes)
  vibDir:     88,
  vibWaveNum: 89,
  vibSpeed:   90,
  vibDelay:   92,
  vibAtkSpd:  94,
  vibAttack:  96,
  vibDepth:   98,

  // Tremolo (+100, 12 bytes)
  tremDir:     100,
  tremWaveNum: 101,
  tremSpeed:   102,
  tremDelay:   104,
  tremAtkSpd:  106,
  tremAttack:  108,
  tremDepth:   110,

  // Arpeggio (+112, 4 bytes)
  arpTable:   112,
  arpSpeed:   114,
  arpGroove:  115,

  // Transform (+116, 18 bytes: 5xu8 waveNums + pad + 6xu16)
  trfWave0:   116,
  trfWave1:   117,
  trfWave2:   118,
  trfWave3:   119,
  trfWave4:   120,
  // +121 pad
  trfStart:   122,
  trfRepeat:  124,
  trfRepEnd:  126,
  trfSpeed:   128,
  trfTurns:   130,
  trfDelay:   132,

  // Phase (+134, 14 bytes)
  phsType:    134,
  phsStart:   136,
  phsRepeat:  138,
  phsRepEnd:  140,
  phsSpeed:   142,
  phsTurns:   144,
  phsDelay:   146,

  // Mix (+148, 14 bytes)
  mixWaveNum: 148,
  // +149 pad
  mixStart:   150,
  mixRepeat:  152,
  mixRepEnd:  154,
  mixSpeed:   156,
  mixTurns:   158,
  mixDelay:   160,

  // Resonance (+162, 14 bytes)
  resAmp:     162,
  resFilBoost:163,
  resStart:   164,
  resRepeat:  166,
  resRepEnd:  168,
  resSpeed:   170,
  resTurns:   172,
  resDelay:   174,

  // Filter (+176, 14 bytes)
  filType:    176,
  // +177 pad
  filStart:   178,
  filRepeat:  180,
  filRepEnd:  182,
  filSpeed:   184,
  filTurns:   186,
  filDelay:   188,

  // Loop (+190, 16 bytes)
  lpStart:    190,
  lpRepeat:   192,
  lpRepEnd:   194,
  lpLength:   196,
  lpStep:     198,
  lpWait:     200,
  lpDelay:    202,
  lpTurns:    204,
} as const;

// Size map: 1=u8, 2=u16
const SIZES: Record<string, number> = {
  volume: 2, transpose: 1, slideSpeed: 1, effects1: 1, effects2: 1,
  // ADSR (all u16)
  atkLength: 2, atkSpeed: 2, atkVolume: 2,
  decLength: 2, decSpeed: 2, decVolume: 2,
  susLength: 2, susSpeed: 2, susVolume: 2,
  relLength: 2, relSpeed: 2, relVolume: 2,
  // Vibrato
  vibDir: 1, vibWaveNum: 1, vibSpeed: 2, vibDelay: 2, vibAtkSpd: 2, vibAttack: 2, vibDepth: 2,
  // Tremolo
  tremDir: 1, tremWaveNum: 1, tremSpeed: 2, tremDelay: 2, tremAtkSpd: 2, tremAttack: 2, tremDepth: 2,
  // Arpeggio
  arpTable: 2, arpSpeed: 1, arpGroove: 1,
  // Transform
  trfWave0: 1, trfWave1: 1, trfWave2: 1, trfWave3: 1, trfWave4: 1,
  trfStart: 2, trfRepeat: 2, trfRepEnd: 2, trfSpeed: 2, trfTurns: 2, trfDelay: 2,
  // Phase
  phsType: 2, phsStart: 2, phsRepeat: 2, phsRepEnd: 2, phsSpeed: 2, phsTurns: 2, phsDelay: 2,
  // Mix
  mixWaveNum: 1, mixStart: 2, mixRepeat: 2, mixRepEnd: 2, mixSpeed: 2, mixTurns: 2, mixDelay: 2,
  // Resonance
  resAmp: 1, resFilBoost: 1, resStart: 2, resRepeat: 2, resRepEnd: 2, resSpeed: 2, resTurns: 2, resDelay: 2,
  // Filter
  filType: 1, filStart: 2, filRepeat: 2, filRepEnd: 2, filSpeed: 2, filTurns: 2, filDelay: 2,
  // Loop
  lpStart: 2, lpRepeat: 2, lpRepEnd: 2, lpLength: 2, lpStep: 2, lpWait: 2, lpDelay: 2, lpTurns: 2,
};

// Build offset map for readInstAll (field name -> byte offset)
const ALL_OFFSETS: Record<string, number> = {};
for (const [key, val] of Object.entries(OFF)) {
  ALL_OFFSETS[key] = val;
}

// ── Effect module definitions ──────────────────────────────────────────────────

interface FxModuleDef {
  name: string;
  /** Index into effects1 (0-5) or effects2 (6-10, mapped as bit index + register) */
  fxIndex: number;
  /** Which effects register: 1 or 2 */
  register: 1 | 2;
  /** Bit within the register */
  bit: number;
  color: string;
}

const FX_MODULES: FxModuleDef[] = [
  { name: 'ADSR Envelope', fxIndex: 0, register: 1, bit: 0, color: '#60e060' },
  { name: 'Vibrato',       fxIndex: 1, register: 1, bit: 1, color: '#60a0ff' },
  { name: 'Tremolo',       fxIndex: 2, register: 1, bit: 2, color: '#a060ff' },
  { name: 'Arpeggio',      fxIndex: 3, register: 1, bit: 3, color: '#e0c040' },
  { name: 'Loop',          fxIndex: 4, register: 1, bit: 4, color: '#ff8040' },
  { name: 'Transform',     fxIndex: 5, register: 1, bit: 5, color: '#ff6090' },
  { name: 'Phase',         fxIndex: 6, register: 2, bit: 0, color: '#40d0d0' },
  { name: 'Mix',           fxIndex: 7, register: 2, bit: 1, color: '#d0a060' },
  { name: 'Resonance',     fxIndex: 8, register: 2, bit: 2, color: '#e06060' },
  { name: 'Filter',        fxIndex: 9, register: 2, bit: 3, color: '#60d080' },
  { name: 'Hold Sustain',  fxIndex: 10, register: 2, bit: 4, color: '#a0a0c0' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type MLTab = 'info' | 'effects' | 'arpeggio';

interface MusicLineControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

type InstFields = Record<string, number>;

// ── Component ──────────────────────────────────────────────────────────────────

export const MusicLineControls: React.FC<MusicLineControlsProps> = ({ instrument }) => {
  const [tab, setTab] = useState<MLTab>('effects');
  const [fields, setFields] = useState<InstFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set([0])); // ADSR expanded by default
  const fieldsRef = useRef<InstFields | null>(null);

  const mlConfig = instrument.metadata?.mlSynthConfig;
  const waveformType: number = mlConfig?.waveformType ?? 3;
  const volume = mlConfig?.volume ?? 64;
  const mlInstIdx: number = instrument.metadata?.mlInstIdx ?? 0;

  const colors = useInstrumentColors(BRAND_COLOR);
  const loopDef = LOOP_SIZE_DEFS[waveformType] ?? { samples: 256, approxNote: '?' };
  const freq = Math.round(PAL_C3_RATE / loopDef.samples);

  // Load all fields from WASM
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      await engine.ready();

      const data = await engine.readInstAll(mlInstIdx, ALL_OFFSETS, SIZES);
      if (cancelled) return;
      setFields(data);
      fieldsRef.current = data;
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [mlInstIdx]);

  // Write a field to WASM and update local state
  const writeField = useCallback((fieldName: string, value: number) => {
    const offset = ALL_OFFSETS[fieldName];
    const size = SIZES[fieldName] ?? 1;
    if (offset === undefined) return;

    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.writeInstField(mlInstIdx, offset, size, value);
    }

    setFields((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [fieldName]: value };
      fieldsRef.current = next;
      return next;
    });
  }, [mlInstIdx]);

  // Toggle an effect module on/off
  const toggleEffect = useCallback((fxIndex: number, enabled: boolean) => {
    if (!MusicLineEngine.hasInstance()) return;
    const engine = MusicLineEngine.getInstance();
    engine.setEffectFlag(mlInstIdx, fxIndex, enabled);

    // Update local effects1/effects2 fields
    const mod = FX_MODULES[fxIndex];
    const regKey = mod.register === 1 ? 'effects1' : 'effects2';
    setFields((prev) => {
      if (!prev) return prev;
      const oldVal = prev[regKey] ?? 0;
      const newVal = enabled
        ? oldVal | (1 << mod.bit)
        : oldVal & ~(1 << mod.bit);
      const next = { ...prev, [regKey]: newVal };
      fieldsRef.current = next;
      return next;
    });
  }, [mlInstIdx]);

  // Check if an effect is enabled
  const isEffectEnabled = useCallback((fxIndex: number): boolean => {
    if (!fields) return false;
    const mod = FX_MODULES[fxIndex];
    const regKey = mod.register === 1 ? 'effects1' : 'effects2';
    return !!(fields[regKey] & (1 << mod.bit));
  }, [fields]);

  // Toggle section expansion
  const toggleExpanded = useCallback((fxIndex: number) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(fxIndex)) next.delete(fxIndex);
      else next.add(fxIndex);
      return next;
    });
  }, []);

  const tabs: MLTab[] = ['info', 'effects', 'arpeggio'];

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #0a0a12 0%, #060608 100%)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        fontFamily: 'monospace',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px',
              background: tab === t ? '#1a1a30' : 'transparent',
              border: tab === t ? '1px solid #6060ff' : '1px solid #2a2a4a',
              borderRadius: 4,
              color: tab === t ? '#a0a0ff' : '#4a4a6a',
              fontSize: 11,
              fontFamily: 'monospace',
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <InfoTab waveformType={waveformType} volume={volume} loopDef={loopDef} freq={freq} />
      )}

      {tab === 'effects' && (
        <EffectsTab
          fields={fields}
          loading={loading}
          writeField={writeField}
          toggleEffect={toggleEffect}
          isEffectEnabled={isEffectEnabled}
          expandedModules={expandedModules}
          toggleExpanded={toggleExpanded}
          colors={colors}
        />
      )}

      {tab === 'arpeggio' && (
        <ArpPanel instIdx={mlInstIdx} />
      )}
    </div>
  );
};

// ── Info Tab ──────────────────────────────────────────────────────────────────

function InfoTab({ waveformType, volume, loopDef, freq }: {
  waveformType: number; volume: number;
  loopDef: { samples: number; approxNote: string }; freq: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#4a4a6a', textTransform: 'uppercase', marginBottom: 10 }}>
          Waveform Loop
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: '#0e0e18', border: '1px solid #2a2a4a', borderRadius: 6,
        }}>
          <div style={{
            padding: '6px 14px', background: '#1a1a30', border: '1px solid #6060ff',
            borderRadius: 4, fontSize: 18, fontWeight: 'bold', color: '#a0a0ff', letterSpacing: 1,
          }}>
            {loopDef.samples}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, color: '#7a7a9a' }}>
              {loopDef.samples}-sample single-cycle waveform
            </span>
            <span style={{ fontSize: 10, color: '#4a4a6a' }}>
              Loop type {waveformType} -- {freq} Hz fundamental at {loopDef.approxNote}
            </span>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 24, padding: '10px 14px',
        background: '#0e0e18', border: '1px solid #1e1e2e', borderRadius: 6,
      }}>
        <InfoItem label="Volume" value={`${volume} / 64`} />
        <InfoItem label="Sample rate" value={`${PAL_C3_RATE} Hz`} />
        <InfoItem label="Loop" value="Full cycle" />
        <InfoItem label="Base note" value={loopDef.approxNote} />
      </div>

      <div style={{ fontSize: 9, color: '#3a3a5a', lineHeight: 1.6, letterSpacing: 0.5 }}>
        Waveform shape is stored as PCM in the song file and cannot be edited here.
        The loop type determines the playback pitch at a given note trigger.
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#4a4a6a' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#7a7a9a', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

// ── Effects Tab ──────────────────────────────────────────────────────────────

interface EffectsTabProps {
  fields: InstFields | null;
  loading: boolean;
  writeField: (name: string, value: number) => void;
  toggleEffect: (fxIndex: number, enabled: boolean) => void;
  isEffectEnabled: (fxIndex: number) => boolean;
  expandedModules: Set<number>;
  toggleExpanded: (fxIndex: number) => void;
  colors: ReturnType<typeof useInstrumentColors>;
}

function EffectsTab({
  fields, loading, writeField, toggleEffect, isEffectEnabled,
  expandedModules, toggleExpanded, colors,
}: EffectsTabProps) {
  if (loading || !fields) {
    return <div style={{ color: '#4a4a6a', fontSize: 11, padding: 12 }}>Loading instrument data...</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Global params */}
      <div style={{
        display: 'flex', gap: 16, padding: '8px 12px',
        background: '#0c0c16', border: '1px solid #1e1e2e', borderRadius: 4,
        alignItems: 'center', flexShrink: 0,
      }}>
        <Knob value={fields.volume ?? 64} min={0} max={64} label="Volume" size="sm"
          color={colors.knob} onChange={(v) => writeField('volume', Math.round(v))} />
        <Knob value={fields.transpose ?? 0} min={0} max={255} label="Transpose" size="sm"
          color={colors.knob} onChange={(v) => writeField('transpose', Math.round(v))} />
        <Knob value={fields.slideSpeed ?? 0} min={0} max={255} label="Slide Spd" size="sm"
          color={colors.knob} onChange={(v) => writeField('slideSpeed', Math.round(v))} />
      </div>

      {/* Effect modules */}
      {FX_MODULES.map((mod, idx) => {
        // HoldSustain (index 10) is just a flag, no parameters
        if (idx === 10) {
          return (
            <FxModuleHeader
              key={idx}
              mod={mod}
              enabled={isEffectEnabled(idx)}
              expanded={false}
              onToggleEnabled={(en) => toggleEffect(idx, en)}
              onToggleExpanded={() => {}}
              simple
            />
          );
        }

        const expanded = expandedModules.has(idx);
        return (
          <div key={idx}>
            <FxModuleHeader
              mod={mod}
              enabled={isEffectEnabled(idx)}
              expanded={expanded}
              onToggleEnabled={(en) => toggleEffect(idx, en)}
              onToggleExpanded={() => toggleExpanded(idx)}
            />
            {expanded && (
              <FxModuleParams
                fxIndex={idx}
                fields={fields}
                writeField={writeField}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Effect module header (collapsible) ─────────────────────────────────────

function FxModuleHeader({ mod, enabled, expanded, onToggleEnabled, onToggleExpanded, simple }: {
  mod: FxModuleDef;
  enabled: boolean;
  expanded: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleExpanded: () => void;
  simple?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px',
        background: enabled ? '#0e0e1c' : '#08080e',
        border: `1px solid ${enabled ? mod.color + '40' : '#1a1a2a'}`,
        borderRadius: 4,
        cursor: simple ? 'default' : 'pointer',
        opacity: enabled ? 1 : 0.5,
        transition: 'all 0.15s ease',
      }}
      onClick={simple ? undefined : onToggleExpanded}
    >
      {/* Enable checkbox */}
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => {
          e.stopPropagation();
          onToggleEnabled(e.target.checked);
        }}
        style={{ accentColor: mod.color, cursor: 'pointer', width: 14, height: 14 }}
      />

      {/* Expand arrow (not for simple) */}
      {!simple && (
        <span style={{ fontSize: 10, color: '#4a4a6a', width: 12, textAlign: 'center', userSelect: 'none' }}>
          {expanded ? 'v' : '>'}
        </span>
      )}

      {/* Module name */}
      <span style={{
        fontSize: 11, fontFamily: 'monospace', letterSpacing: 1,
        color: enabled ? mod.color : '#4a4a6a',
        textTransform: 'uppercase', fontWeight: 'bold',
        flex: 1,
      }}>
        {mod.name}
      </span>

      {/* Status indicator */}
      <span style={{
        fontSize: 9, color: enabled ? '#60e060' : '#4a4a6a',
        fontFamily: 'monospace',
      }}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

// ── Per-module parameter panels ────────────────────────────────────────────

function FxModuleParams({ fxIndex, fields, writeField }: {
  fxIndex: number;
  fields: InstFields;
  writeField: (name: string, value: number) => void;
}) {
  const knobColor = FX_MODULES[fxIndex].color;
  const panelStyle: React.CSSProperties = {
    display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px',
    background: '#0a0a14', borderLeft: `2px solid ${knobColor}30`,
    borderRight: '1px solid #1a1a2a', borderBottom: '1px solid #1a1a2a',
    borderRadius: '0 0 4px 4px', marginTop: -1,
  };

  switch (fxIndex) {
    case 0: return <ADSRParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle} />;
    case 1: return <VibratoParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle} prefix="vib" />;
    case 2: return <VibratoParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle} prefix="trem" />;
    case 3: return <ArpeggioParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle} />;
    case 4: return <LoopParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle} />;
    case 5: return <TransformParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle} />;
    case 6: return <CommonFxParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle}
      prefix="phs" extraFields={[{ name: 'phsType', label: 'Type', max: 255 }]} />;
    case 7: return <CommonFxParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle}
      prefix="mix" extraFields={[{ name: 'mixWaveNum', label: 'WaveNum', max: 255 }]} />;
    case 8: return <CommonFxParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle}
      prefix="res" extraFields={[{ name: 'resAmp', label: 'Amp', max: 255 }, { name: 'resFilBoost', label: 'FilBoost', max: 255 }]} />;
    case 9: return <CommonFxParams fields={fields} writeField={writeField} color={knobColor} style={panelStyle}
      prefix="fil" extraFields={[{ name: 'filType', label: 'Type', max: 255 }]} />;
    default: return null;
  }
}

// ── ADSR ────────────────────────────────────────────────────────────────────

function ADSRParams({ fields, writeField, color, style }: {
  fields: InstFields; writeField: (n: string, v: number) => void; color: string; style: React.CSSProperties;
}) {
  const stages = [
    { label: 'Attack', prefix: 'atk' },
    { label: 'Decay', prefix: 'dec' },
    { label: 'Sustain', prefix: 'sus' },
    { label: 'Release', prefix: 'rel' },
  ];

  return (
    <div style={style}>
      {stages.map((stage) => (
        <div key={stage.prefix} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginRight: 12 }}>
          <span style={{ fontSize: 9, color: color + 'aa', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace' }}>
            {stage.label}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <Knob value={fields[`${stage.prefix}Length`] ?? 0} min={0} max={65535}
              label="Len" size="sm" color={color}
              onChange={(v) => writeField(`${stage.prefix}Length`, Math.round(v))} />
            <Knob value={fields[`${stage.prefix}Speed`] ?? 0} min={0} max={65535}
              label="Spd" size="sm" color={color}
              onChange={(v) => writeField(`${stage.prefix}Speed`, Math.round(v))} />
            <Knob value={fields[`${stage.prefix}Volume`] ?? 0} min={0} max={65535}
              label="Vol" size="sm" color={color}
              onChange={(v) => writeField(`${stage.prefix}Volume`, Math.round(v))} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Vibrato / Tremolo (shared structure) ────────────────────────────────────

function VibratoParams({ fields, writeField, color, style, prefix }: {
  fields: InstFields; writeField: (n: string, v: number) => void;
  color: string; style: React.CSSProperties; prefix: 'vib' | 'trem';
}) {
  return (
    <div style={style}>
      <Knob value={fields[`${prefix}Dir`] ?? 0} min={0} max={255}
        label="Dir" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Dir`, Math.round(v))} />
      <Knob value={fields[`${prefix}WaveNum`] ?? 0} min={0} max={255}
        label="Wave" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}WaveNum`, Math.round(v))} />
      <Knob value={fields[`${prefix}Speed`] ?? 0} min={0} max={65535}
        label="Speed" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Speed`, Math.round(v))} />
      <Knob value={fields[`${prefix}Delay`] ?? 0} min={0} max={65535}
        label="Delay" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Delay`, Math.round(v))} />
      <Knob value={fields[`${prefix}AtkSpd`] ?? 0} min={0} max={65535}
        label="Atk Spd" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}AtkSpd`, Math.round(v))} />
      <Knob value={fields[`${prefix}Attack`] ?? 0} min={0} max={65535}
        label="Attack" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Attack`, Math.round(v))} />
      <Knob value={fields[`${prefix}Depth`] ?? 0} min={0} max={65535}
        label="Depth" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Depth`, Math.round(v))} />
    </div>
  );
}

// ── Arpeggio params (table selector + speed + groove) ───────────────────────

function ArpeggioParams({ fields, writeField, color, style }: {
  fields: InstFields; writeField: (n: string, v: number) => void; color: string; style: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <Knob value={fields.arpTable ?? 0} min={0} max={65535}
        label="Table" size="sm" color={color}
        onChange={(v) => writeField('arpTable', Math.round(v))} />
      <Knob value={fields.arpSpeed ?? 0} min={0} max={255}
        label="Speed" size="sm" color={color}
        onChange={(v) => writeField('arpSpeed', Math.round(v))} />
      <Knob value={fields.arpGroove ?? 0} min={0} max={255}
        label="Groove" size="sm" color={color}
        onChange={(v) => writeField('arpGroove', Math.round(v))} />
    </div>
  );
}

// ── Loop params ────────────────────────────────────────────────────────────

function LoopParams({ fields, writeField, color, style }: {
  fields: InstFields; writeField: (n: string, v: number) => void; color: string; style: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <Knob value={fields.lpStart ?? 0} min={0} max={65535}
        label="Start" size="sm" color={color}
        onChange={(v) => writeField('lpStart', Math.round(v))} />
      <Knob value={fields.lpRepeat ?? 0} min={0} max={65535}
        label="Repeat" size="sm" color={color}
        onChange={(v) => writeField('lpRepeat', Math.round(v))} />
      <Knob value={fields.lpRepEnd ?? 0} min={0} max={65535}
        label="Rep End" size="sm" color={color}
        onChange={(v) => writeField('lpRepEnd', Math.round(v))} />
      <Knob value={fields.lpLength ?? 0} min={0} max={65535}
        label="Length" size="sm" color={color}
        onChange={(v) => writeField('lpLength', Math.round(v))} />
      <Knob value={fields.lpStep ?? 0} min={0} max={65535}
        label="Step" size="sm" color={color}
        onChange={(v) => writeField('lpStep', Math.round(v))} />
      <Knob value={fields.lpWait ?? 0} min={0} max={65535}
        label="Wait" size="sm" color={color}
        onChange={(v) => writeField('lpWait', Math.round(v))} />
      <Knob value={fields.lpDelay ?? 0} min={0} max={65535}
        label="Delay" size="sm" color={color}
        onChange={(v) => writeField('lpDelay', Math.round(v))} />
      <Knob value={fields.lpTurns ?? 0} min={0} max={65535}
        label="Turns" size="sm" color={color}
        onChange={(v) => writeField('lpTurns', Math.round(v))} />
    </div>
  );
}

// ── Transform params ──────────────────────────────────────────────────────

function TransformParams({ fields, writeField, color, style }: {
  fields: InstFields; writeField: (n: string, v: number) => void; color: string; style: React.CSSProperties;
}) {
  return (
    <div style={style}>
      {/* 5 waveform number slots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Knob key={i} value={fields[`trfWave${i}`] ?? 0} min={0} max={255}
            label={`W${i + 1}`} size="sm" color={color}
            onChange={(v) => writeField(`trfWave${i}`, Math.round(v))} />
        ))}
      </div>
      {/* Common loop params */}
      <div style={{ display: 'flex', gap: 6 }}>
        <Knob value={fields.trfStart ?? 0} min={0} max={65535}
          label="Start" size="sm" color={color}
          onChange={(v) => writeField('trfStart', Math.round(v))} />
        <Knob value={fields.trfRepeat ?? 0} min={0} max={65535}
          label="Repeat" size="sm" color={color}
          onChange={(v) => writeField('trfRepeat', Math.round(v))} />
        <Knob value={fields.trfRepEnd ?? 0} min={0} max={65535}
          label="Rep End" size="sm" color={color}
          onChange={(v) => writeField('trfRepEnd', Math.round(v))} />
        <Knob value={fields.trfSpeed ?? 0} min={0} max={65535}
          label="Speed" size="sm" color={color}
          onChange={(v) => writeField('trfSpeed', Math.round(v))} />
        <Knob value={fields.trfTurns ?? 0} min={0} max={65535}
          label="Turns" size="sm" color={color}
          onChange={(v) => writeField('trfTurns', Math.round(v))} />
        <Knob value={fields.trfDelay ?? 0} min={0} max={65535}
          label="Delay" size="sm" color={color}
          onChange={(v) => writeField('trfDelay', Math.round(v))} />
      </div>
    </div>
  );
}

// ── Common FX params (Phase, Mix, Resonance, Filter) ───────────────────────
// All share Start/Repeat/RepEnd/Speed/Turns/Delay pattern with type-specific extras

function CommonFxParams({ fields, writeField, color, style, prefix, extraFields }: {
  fields: InstFields; writeField: (n: string, v: number) => void;
  color: string; style: React.CSSProperties;
  prefix: string;
  extraFields: Array<{ name: string; label: string; max: number }>;
}) {
  return (
    <div style={style}>
      {extraFields.map((ef) => (
        <Knob key={ef.name} value={fields[ef.name] ?? 0} min={0} max={ef.max}
          label={ef.label} size="sm" color={color}
          onChange={(v) => writeField(ef.name, Math.round(v))} />
      ))}
      <Knob value={fields[`${prefix}Start`] ?? 0} min={0} max={65535}
        label="Start" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Start`, Math.round(v))} />
      <Knob value={fields[`${prefix}Repeat`] ?? 0} min={0} max={65535}
        label="Repeat" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Repeat`, Math.round(v))} />
      <Knob value={fields[`${prefix}RepEnd`] ?? 0} min={0} max={65535}
        label="Rep End" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}RepEnd`, Math.round(v))} />
      <Knob value={fields[`${prefix}Speed`] ?? 0} min={0} max={65535}
        label="Speed" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Speed`, Math.round(v))} />
      <Knob value={fields[`${prefix}Turns`] ?? 0} min={0} max={65535}
        label="Turns" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Turns`, Math.round(v))} />
      <Knob value={fields[`${prefix}Delay`] ?? 0} min={0} max={65535}
        label="Delay" size="sm" color={color}
        onChange={(v) => writeField(`${prefix}Delay`, Math.round(v))} />
    </div>
  );
}

// ── Arpeggio Panel — uses standalone MusicLineArpeggioEditor ─────────────────

interface ArpPanelProps {
  instIdx: number;
}

function ArpPanel({ instIdx }: ArpPanelProps) {
  const [arpConfig, setArpConfig] = useState<{ table: number; speed: number; groove: number; numArps: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      await engine.ready();

      const config = await engine.readInstArpConfig(instIdx);
      if (cancelled) return;
      setArpConfig(config);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [instIdx]);

  if (loading) {
    return <div style={{ color: '#4a4a6a', fontSize: 11, padding: 12 }}>Loading arpeggio data...</div>;
  }

  if (!arpConfig || arpConfig.numArps === 0) {
    return (
      <div style={{ color: '#4a4a6a', fontSize: 11, padding: 12 }}>
        No arpeggio tables in this song.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {/* Instrument arp config info */}
      <div style={{
        display: 'flex', gap: 16, padding: '8px 12px',
        background: '#0e0e18', border: '1px solid #1e1e2e', borderRadius: 4, fontSize: 10,
      }}>
        <span style={{ color: '#7a7a9a' }}>
          Inst Table: <span style={{ color: '#a0a0ff' }}>{arpConfig.table >= 0 ? arpConfig.table : 'none'}</span>
        </span>
        <span style={{ color: '#7a7a9a' }}>Speed: <span style={{ color: '#a0a0ff' }}>{arpConfig.speed}</span></span>
        <span style={{ color: '#7a7a9a' }}>Groove: <span style={{ color: '#a0a0ff' }}>{arpConfig.groove}</span></span>
      </div>

      {/* Full arpeggio table editor with dropdown to browse any table */}
      <MusicLineArpeggioEditor
        initialTable={arpConfig.table >= 0 ? arpConfig.table : 0}
      />
    </div>
  );
}
