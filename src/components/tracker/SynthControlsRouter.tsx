/**
 * SynthControlsRouter — Routes each synth type to its dedicated control component.
 * Used by InstrumentKnobPanel to show the best available UI for each instrument.
 *
 * Lazy-loads all control components to keep initial bundle small.
 */

import React, { lazy, Suspense, useCallback } from 'react';
import type { InstrumentConfig, MAMEConfig } from '@typedefs/instrument';
import {
  DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_V2, DEFAULT_V2_SPEECH,
  DEFAULT_SYNARE, DEFAULT_DEXED, DEFAULT_OBXD, DEFAULT_SAM,
  DEFAULT_HARMONIC_SYNTH as DEFAULT_HARMONIC_SYNTH_VAL,
  DEFAULT_HIVELY, DEFAULT_JAMCRACKER,
  DEFAULT_SOUNDMON, DEFAULT_SIDMON, DEFAULT_DIGMUG, DEFAULT_FC,
  DEFAULT_DELTAMUSIC1, DEFAULT_DELTAMUSIC2, DEFAULT_FRED, DEFAULT_TFMX,
  DEFAULT_OCTAMED, DEFAULT_SIDMON1, DEFAULT_HIPPEL_COSO, DEFAULT_ROB_HUBBARD,
  DEFAULT_DAVID_WHITTAKER, DEFAULT_SONIC_ARRANGER, DEFAULT_WOBBLE_BASS,
  DEFAULT_FURNACE, DEFAULT_MAME_VFX, DEFAULT_MAME_DOC,
} from '@typedefs/instrument';
import { deepMerge } from '@lib/migration';
import { isMAMEChipType } from '@constants/chipParameters';
import { SYNTH_REGISTRY } from '@engine/vstbridge/synth-registry';

// ─── Lazy imports ────────────────────────────────────────────────────────────

const WobbleBassControls = lazy(() =>
  import('@components/instruments/controls/WobbleBassControls').then(m => ({ default: m.WobbleBassControls }))
);
const DubSirenControls = lazy(() =>
  import('@components/instruments/controls/DubSirenControls').then(m => ({ default: m.DubSirenControls }))
);
const SpaceLaserControls = lazy(() =>
  import('@components/instruments/controls/SpaceLaserControls').then(m => ({ default: m.SpaceLaserControls }))
);
const V2Controls = lazy(() =>
  import('@components/instruments/controls/V2Controls').then(m => ({ default: m.V2Controls }))
);
const V2SpeechControls = lazy(() =>
  import('@components/instruments/controls/V2SpeechControls').then(m => ({ default: m.V2SpeechControls }))
);
const SAMControls = lazy(() =>
  import('@components/instruments/controls/SAMControls').then(m => ({ default: m.SAMControls }))
);
const SynareControls = lazy(() =>
  import('@components/instruments/controls/SynareControls').then(m => ({ default: m.SynareControls }))
);
const DexedControls = lazy(() =>
  import('@components/instruments/controls/DexedControls').then(m => ({ default: m.DexedControls }))
);
const OBXdControls = lazy(() =>
  import('@components/instruments/controls/OBXdControls').then(m => ({ default: m.OBXdControls }))
);
const HivelyControls = lazy(() =>
  import('@components/instruments/controls/HivelyControls').then(m => ({ default: m.HivelyControls }))
);
const JamCrackerControls = lazy(() =>
  import('@components/instruments/controls/JamCrackerControls').then(m => ({ default: m.JamCrackerControls }))
);
const SoundMonControls = lazy(() =>
  import('@components/instruments/controls/SoundMonControls').then(m => ({ default: m.SoundMonControls }))
);
const SidMonControls = lazy(() =>
  import('@components/instruments/controls/SidMonControls').then(m => ({ default: m.SidMonControls }))
);
const DigMugControls = lazy(() =>
  import('@components/instruments/controls/DigMugControls').then(m => ({ default: m.DigMugControls }))
);
const SonicArrangerControls = lazy(() =>
  import('@components/instruments/controls/SonicArrangerControls').then(m => ({ default: m.SonicArrangerControls }))
);
const FCControls = lazy(() =>
  import('@components/instruments/controls/FCControls').then(m => ({ default: m.FCControls }))
);
const DeltaMusic1Controls = lazy(() =>
  import('@components/instruments/controls/DeltaMusic1Controls').then(m => ({ default: m.DeltaMusic1Controls }))
);
const DeltaMusic2Controls = lazy(() =>
  import('@components/instruments/controls/DeltaMusic2Controls').then(m => ({ default: m.DeltaMusic2Controls }))
);
const FredControls = lazy(() =>
  import('@components/instruments/controls/FredControls').then(m => ({ default: m.FredControls }))
);
const TFMXControls = lazy(() =>
  import('@components/instruments/controls/TFMXControls').then(m => ({ default: m.TFMXControls }))
);
const OctaMEDControls = lazy(() =>
  import('@components/instruments/controls/OctaMEDControls').then(m => ({ default: m.OctaMEDControls }))
);
const SidMon1Controls = lazy(() =>
  import('@components/instruments/controls/SidMon1Controls').then(m => ({ default: m.SidMon1Controls }))
);
const HippelCoSoControls = lazy(() =>
  import('@components/instruments/controls/HippelCoSoControls').then(m => ({ default: m.HippelCoSoControls }))
);
const RobHubbardControls = lazy(() =>
  import('@components/instruments/controls/RobHubbardControls').then(m => ({ default: m.RobHubbardControls }))
);
const DavidWhittakerControls = lazy(() =>
  import('@components/instruments/controls/DavidWhittakerControls').then(m => ({ default: m.DavidWhittakerControls }))
);
const HarmonicSynthControls = lazy(() =>
  import('@components/instruments/controls/HarmonicSynthControls').then(m => ({ default: m.HarmonicSynthControls }))
);
const ModularSynthControls = lazy(() =>
  import('@components/instruments/synths/modular/ModularSynthControls').then(m => ({ default: m.ModularSynthControls }))
);
const TonewheelOrganControls = lazy(() =>
  import('@components/instruments/controls/TonewheelOrganControls').then(m => ({ default: m.TonewheelOrganControls }))
);
const MelodicaControls = lazy(() =>
  import('@components/instruments/controls/MelodicaControls').then(m => ({ default: m.MelodicaControls }))
);
const VitalControls = lazy(() =>
  import('@components/instruments/controls/VitalControls').then(m => ({ default: m.VitalControls }))
);
const Odin2Controls = lazy(() =>
  import('@components/instruments/controls/Odin2Controls').then(m => ({ default: m.Odin2Controls }))
);
const SurgeControls = lazy(() =>
  import('@components/instruments/controls/SurgeControls').then(m => ({ default: m.SurgeControls }))
);
const WAMControls = lazy(() =>
  import('@components/instruments/controls/WAMControls').then(m => ({ default: m.WAMControls }))
);
const VSTBridgePanel = lazy(() =>
  import('@components/instruments/controls/VSTBridgePanel').then(m => ({ default: m.VSTBridgePanel }))
);
const BuzzmachineControls = lazy(() =>
  import('@components/instruments/controls/BuzzmachineControls').then(m => ({ default: m.BuzzmachineControls }))
);
const ChipSynthControls = lazy(() =>
  import('@components/instruments/controls/ChipSynthControls').then(m => ({ default: m.ChipSynthControls }))
);
const MAMEControls = lazy(() =>
  import('@components/instruments/controls/MAMEControls').then(m => ({ default: m.MAMEControls }))
);
const GearmulatorEditor = lazy(() =>
  import('@components/instruments/GearmulatorEditor').then(m => ({ default: m.GearmulatorEditor }))
);
const FurnaceControls = lazy(() =>
  import('@components/instruments/controls/FurnaceControls').then(m => ({ default: m.FurnaceControls }))
);

// ─── Loading fallback ────────────────────────────────────────────────────────

const LoadingFallback = () => (
  <div className="flex items-center justify-center py-8 text-gray-500 text-xs">
    Loading controls…
  </div>
);

// ─── Props ───────────────────────────────────────────────────────────────────

interface SynthControlsRouterProps {
  instrument: InstrumentConfig;
  onUpdate: (updates: Partial<InstrumentConfig>) => void;
  fallback?: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SynthControlsRouter: React.FC<SynthControlsRouterProps> = ({ instrument, onUpdate, fallback }) => {
  const synthType = instrument.synthType;

  // Debug: log when routing WaveSabre/Oidos/Tunefish
  if (synthType === 'WaveSabreSynth' || synthType === 'OidosSynth' || synthType === 'TunefishSynth' || instrument.xrns) {
    console.log(`[SynthControlsRouter] Routing: synthType=${synthType} xrns=${JSON.stringify(instrument.xrns?.synthType)} hasXrns=${!!instrument.xrns}`);
  }

  // Chip synth param change handler
  const handleChipParamChange = useCallback((name: string, value: number | string) => {
    const params = { ...(instrument.parameters as Record<string, unknown> || {}), [name]: value };
    onUpdate({ parameters: params });
  }, [instrument.parameters, onUpdate]);

  const handleChipTextChange = useCallback((name: string, text: string) => {
    const params = { ...(instrument.parameters as Record<string, unknown> || {}), [name]: text };
    onUpdate({ parameters: params });
  }, [instrument.parameters, onUpdate]);

  const content = (() => {
    // ── WobbleBass ──────────────────────────────────────────
    if (synthType === 'WobbleBass') {
      const cfg = deepMerge(DEFAULT_WOBBLE_BASS, instrument.wobbleBass || {});
      return <WobbleBassControls config={cfg} instrumentId={instrument.id} onChange={(wb) => onUpdate({ wobbleBass: wb })} />;
    }

    // ── DubSiren ────────────────────────────────────────────
    if (synthType === 'DubSiren') {
      const cfg = deepMerge(DEFAULT_DUB_SIREN, instrument.dubSiren || {});
      return <DubSirenControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ dubSiren: { ...cfg, ...u } })} />;
    }

    // ── SpaceLaser ──────────────────────────────────────────
    if (synthType === 'SpaceLaser') {
      const cfg = deepMerge(DEFAULT_SPACE_LASER, instrument.spaceLaser || {});
      return <SpaceLaserControls config={cfg} onChange={(u) => onUpdate({ spaceLaser: { ...cfg, ...u } })} />;
    }

    // ── V2 / V2Speech ───────────────────────────────────────
    if (synthType === 'V2') {
      const cfg = deepMerge(DEFAULT_V2, instrument.v2 || {});
      return <V2Controls config={cfg} onChange={(u) => onUpdate({ v2: { ...cfg, ...u } })} />;
    }
    if (synthType === 'V2Speech') {
      const cfg = deepMerge(DEFAULT_V2_SPEECH, instrument.v2Speech || {});
      return <V2SpeechControls config={cfg} onChange={(u) => onUpdate({ v2Speech: { ...cfg, ...u } })} />;
    }

    // ── SAM ─────────────────────────────────────────────────
    if (synthType === 'Sam') {
      const cfg = deepMerge(DEFAULT_SAM, instrument.sam || {});
      return <SAMControls config={cfg} onChange={(u) => onUpdate({ sam: { ...cfg, ...u } })} />;
    }

    // ── Synare ──────────────────────────────────────────────
    if (synthType === 'Synare') {
      const cfg = deepMerge(DEFAULT_SYNARE, instrument.synare || {});
      return <SynareControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ synare: { ...cfg, ...u } })} />;
    }

    // ── Dexed (DX7) ─────────────────────────────────────────
    if (synthType === 'Dexed') {
      const cfg = deepMerge(DEFAULT_DEXED, instrument.dexed || {});
      return <DexedControls config={cfg} onChange={(u) => onUpdate({ dexed: { ...cfg, ...u } })} />;
    }

    // ── OBXd (Oberheim) ─────────────────────────────────────
    if (synthType === 'OBXd') {
      const cfg = deepMerge(DEFAULT_OBXD, instrument.obxd || {});
      return <OBXdControls config={cfg} onChange={(u) => onUpdate({ obxd: { ...cfg, ...u } })} />;
    }

    // ── HivelyTracker ───────────────────────────────────────
    if (synthType === 'HivelySynth') {
      const cfg = deepMerge(DEFAULT_HIVELY, instrument.hively || {});
      return <HivelyControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ hively: { ...cfg, ...u } })} />;
    }

    // ── JamCracker ──────────────────────────────────────────
    if (synthType === 'JamCrackerSynth') {
      const cfg = deepMerge(DEFAULT_JAMCRACKER, instrument.jamCracker || {});
      return <JamCrackerControls config={cfg} onChange={(u) => onUpdate({ jamCracker: { ...cfg, ...u } })} />;
    }

    // ── UADE tracker synths ─────────────────────────────────
    if (synthType === 'SoundMonSynth') {
      const cfg = deepMerge(DEFAULT_SOUNDMON, instrument.soundMon || {});
      return <SoundMonControls config={cfg} onChange={(u) => onUpdate({ soundMon: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SidMonSynth') {
      const cfg = deepMerge(DEFAULT_SIDMON, instrument.sidMon || {});
      return <SidMonControls config={cfg} onChange={(u) => onUpdate({ sidMon: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DigMugSynth') {
      const cfg = deepMerge(DEFAULT_DIGMUG, instrument.digMug || {});
      return <DigMugControls config={cfg} onChange={(u) => onUpdate({ digMug: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SonicArrangerSynth') {
      const cfg = deepMerge(DEFAULT_SONIC_ARRANGER, instrument.sonicArranger || {});
      return <SonicArrangerControls config={cfg} onChange={(u) => onUpdate({ sonicArranger: { ...cfg, ...u } })} />;
    }
    if (synthType === 'FCSynth') {
      const cfg = deepMerge(DEFAULT_FC, instrument.fc || {});
      return <FCControls config={cfg} onChange={(u) => onUpdate({ fc: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DeltaMusic1Synth') {
      const cfg = deepMerge(DEFAULT_DELTAMUSIC1, instrument.deltaMusic1 || {});
      return <DeltaMusic1Controls config={cfg} onChange={(u) => onUpdate({ deltaMusic1: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DeltaMusic2Synth') {
      const cfg = deepMerge(DEFAULT_DELTAMUSIC2, instrument.deltaMusic2 || {});
      return <DeltaMusic2Controls config={cfg} onChange={(u) => onUpdate({ deltaMusic2: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'FredSynth') {
      const cfg = deepMerge(DEFAULT_FRED, instrument.fred || {});
      return <FredControls config={cfg} onChange={(u) => onUpdate({ fred: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'TFMXSynth') {
      const cfg = deepMerge(DEFAULT_TFMX, instrument.tfmx || {});
      return <TFMXControls config={cfg} onChange={(c) => onUpdate({ tfmx: c })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'OctaMEDSynth') {
      const cfg = deepMerge(DEFAULT_OCTAMED, instrument.octamed || {});
      return <OctaMEDControls config={cfg} onChange={(u) => onUpdate({ octamed: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SidMon1Synth') {
      const cfg = deepMerge(DEFAULT_SIDMON1, instrument.sidmon1 || {});
      return <SidMon1Controls config={cfg} onChange={(u) => onUpdate({ sidmon1: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'HippelCoSoSynth') {
      const cfg = deepMerge(DEFAULT_HIPPEL_COSO, instrument.hippelCoso || {});
      return <HippelCoSoControls config={cfg} onChange={(u) => onUpdate({ hippelCoso: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'RobHubbardSynth') {
      const cfg = deepMerge(DEFAULT_ROB_HUBBARD, instrument.robHubbard || {});
      return <RobHubbardControls config={cfg} onChange={(u) => onUpdate({ robHubbard: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DavidWhittakerSynth') {
      const cfg = deepMerge(DEFAULT_DAVID_WHITTAKER, instrument.davidWhittaker || {});
      return <DavidWhittakerControls config={cfg} onChange={(u) => onUpdate({ davidWhittaker: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }

    // ── HarmonicSynth ───────────────────────────────────────
    if (synthType === 'HarmonicSynth') {
      const cfg = deepMerge(DEFAULT_HARMONIC_SYNTH_VAL, instrument.harmonicSynth || {});
      return <HarmonicSynthControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ harmonicSynth: { ...cfg, ...u } })} />;
    }

    // ── ModularSynth ────────────────────────────────────────
    if (synthType === 'ModularSynth') {
      return <ModularSynthControls config={instrument} onChange={onUpdate} />;
    }

    // ── VST-bridge synths ───────────────────────────────────
    if (synthType === 'TonewheelOrgan') {
      return <TonewheelOrganControls instrument={instrument} onChange={onUpdate} />;
    }
    if (synthType === 'Melodica') {
      return <MelodicaControls instrument={instrument} onChange={onUpdate} />;
    }
    if (synthType === 'Vital') {
      return <VitalControls instrument={instrument} onChange={onUpdate} />;
    }
    if (synthType === 'Odin2') {
      return <Odin2Controls instrument={instrument} onChange={onUpdate} />;
    }
    if (synthType === 'Surge') {
      return <SurgeControls instrument={instrument} onChange={onUpdate} />;
    }

    // ── WAM ─────────────────────────────────────────────────
    if (synthType === 'WAM') {
      return <WAMControls instrument={instrument} onChange={onUpdate} />;
    }

    // ── Buzzmachines ────────────────────────────────────────
    if (synthType === 'Buzzmachine' || synthType.startsWith('Buzz')) {
      return <BuzzmachineControls config={instrument} onChange={onUpdate} />;
    }

    // ── Gearmulator ─────────────────────────────────────────
    if (synthType.startsWith('Gearmulator')) {
      const cfg = instrument.gearmulator || { synthType: 0, preset: 0, bank: 0 };
      return <GearmulatorEditor config={cfg} onChange={(u) => onUpdate({ gearmulator: u })} />;
    }

    // ── VSTBridge (generic) ─────────────────────────────────
    if (SYNTH_REGISTRY.has(synthType)) {
      return <VSTBridgePanel instrument={instrument} onChange={onUpdate} />;
    }

    // ── MAME Chip synths ────────────────────────────────────
    if (isMAMEChipType(synthType)) {
      return (
        <ChipSynthControls
          synthType={synthType}
          parameters={(instrument.parameters || {}) as Record<string, number | string>}
          instrumentId={instrument.id}
          onParamChange={handleChipParamChange}
          onTextChange={handleChipTextChange}
          onLoadPreset={(program) => onUpdate({ parameters: { ...instrument.parameters, program } })}
        />
      );
    }

    // ── MAME VFX/DOC ────────────────────────────────────────
    if (synthType === 'MAMEVFX' || synthType === 'MAMEDOC') {
      const defaultCfg = synthType === 'MAMEVFX' ? DEFAULT_MAME_VFX : DEFAULT_MAME_DOC;
      const cfg: MAMEConfig = instrument.mame || defaultCfg;
      return <MAMEControls config={cfg} handle={instrument.id} onChange={(u) => onUpdate({ mame: { ...cfg, ...u } })} />;
    }

    // ── Furnace chip synths ─────────────────────────────────
    if (synthType === 'Furnace' || synthType.startsWith('Furnace')) {
      const cfg = deepMerge(DEFAULT_FURNACE, instrument.furnace || {});
      return <FurnaceControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ furnace: { ...cfg, ...u } })} />;
    }

    // ── XRNS demoscene synths (WaveSabre, Oidos, Tunefish) ──
    // These use WASM engines with parameters stored in instrument.xrns
    if (synthType === 'WaveSabreSynth' || synthType === 'OidosSynth' || synthType === 'TunefishSynth') {
      const xrnsSynthType = instrument.xrns?.synthType || synthType;
      const paramCount = instrument.xrns?.parameters?.length || 0;
      return (
        <div style={{ padding: '12px', color: '#aaa', fontSize: '12px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>
            {xrnsSynthType.replace('wavesabre-', '').replace('WaveSabreSynth', 'WaveSabre').toUpperCase()}
          </div>
          <div>WASM synth with {paramCount} parameters</div>
          <div style={{ marginTop: '8px', opacity: 0.7 }}>
            Parameters loaded from XRNS file
          </div>
        </div>
      );
    }

    // ── No dedicated controls — use fallback ──
    return null;
  })();

  if (!content) return fallback ? <>{fallback}</> : null;

  return (
    <Suspense fallback={<LoadingFallback />}>
      {content}
    </Suspense>
  );
};
