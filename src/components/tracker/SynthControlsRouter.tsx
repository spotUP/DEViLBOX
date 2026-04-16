/**
 * SynthControlsRouter — Routes each synth type to its dedicated control component.
 * Used by InstrumentKnobPanel to show the best available UI for each instrument.
 *
 * Lazy-loads all control components to keep initial bundle small.
 */

import React, { lazy, Suspense, useCallback } from 'react';
import type { InstrumentConfig, MAMEConfig } from '@typedefs/instrument';
import { getToneEngine } from '@engine/ToneEngine';
import {
  DEFAULT_DUB_SIREN, DEFAULT_SPACE_LASER, DEFAULT_V2, DEFAULT_V2_SPEECH,
  DEFAULT_SYNARE, DEFAULT_SAM, DEFAULT_PINK_TROMBONE, DEFAULT_DECTALK,
  DEFAULT_HARMONIC_SYNTH as DEFAULT_HARMONIC_SYNTH_VAL,
  DEFAULT_HIVELY, DEFAULT_JAMCRACKER,
  DEFAULT_SOUNDMON, DEFAULT_SIDMON, DEFAULT_DIGMUG, DEFAULT_FC,
  DEFAULT_DELTAMUSIC1, DEFAULT_DELTAMUSIC2, DEFAULT_FRED, DEFAULT_TFMX,
  DEFAULT_OCTAMED, DEFAULT_SIDMON1, DEFAULT_HIPPEL_COSO, DEFAULT_ROB_HUBBARD, DEFAULT_STEVE_TURNER,
  DEFAULT_DAVID_WHITTAKER, DEFAULT_SONIC_ARRANGER, DEFAULT_INSTEREO2, DEFAULT_WOBBLE_BASS, DEFAULT_SYMPHONIE,
  DEFAULT_FUTUREPLAYER,
  DEFAULT_FURNACE, DEFAULT_MAME_VFX, DEFAULT_MAME_DOC,
} from '@typedefs/instrument';
import { DEFAULT_MDA_EPIANO } from '@engine/mda-epiano/MdaEPianoSynth';
import { DEFAULT_MDA_JX10 } from '@engine/mda-jx10/MdaJX10Synth';
import { DEFAULT_MDA_DX10 } from '@engine/mda-dx10/MdaDX10Synth';
import { DEFAULT_AMSYNTH } from '@engine/amsynth/AMSynthSynth';
import { DEFAULT_RAFFO } from '@engine/raffo/RaffoSynth';
import { DEFAULT_CALF_MONO } from '@engine/calf-mono/CalfMonoSynth';
import { DEFAULT_SETBFREE } from '@engine/setbfree/SetBfreeSynth';
import { DEFAULT_SYNTHV1 } from '@engine/synthv1/SynthV1Synth';
import { DEFAULT_MONIQUE } from '@engine/monique/MoniqueSynth';
import { DEFAULT_VL1 } from '@engine/vl1/VL1Synth';
import { DEFAULT_TAL_NOIZEMAKER } from '@engine/tal-noizemaker/TalNoizeMakerSynth';
import { DEFAULT_AEOLUS } from '@engine/aeolus/AeolusSynth';
import { DEFAULT_FLUIDSYNTH } from '@engine/fluidsynth/FluidSynthSynth';
import { DEFAULT_SFIZZ } from '@engine/sfizz/SfizzSynth';
import { DEFAULT_ZYNADDSUBFX } from '@engine/zynaddsubfx/ZynAddSubFXSynth';
import { deepMerge } from '@lib/migration';
import { isMAMEChipType } from '@constants/chipParameters';
import { SYNTH_REGISTRY } from '@engine/vstbridge/synth-registry';
import { getSynthLayout } from '@/constants/synthLayouts';

// ─── Lazy imports ────────────────────────────────────────────────────────────

const DOMSynthPanel = lazy(() =>
  import('@components/instruments/controls/DOMSynthPanel').then(m => ({ default: m.DOMSynthPanel }))
);
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
const PinkTromboneControls = lazy(() =>
  import('@components/instruments/controls/PinkTromboneControls').then(m => ({ default: m.PinkTromboneControls }))
);
const DECtalkControls = lazy(() =>
  import('@components/instruments/controls/DECtalkControls').then(m => ({ default: m.DECtalkControls }))
);
const SynareControls = lazy(() =>
  import('@components/instruments/controls/SynareControls').then(m => ({ default: m.SynareControls }))
);
const MdaEPianoControls = lazy(() =>
  import('@components/instruments/controls/MdaEPianoControls').then(m => ({ default: m.MdaEPianoControls }))
);
const MdaJX10Controls = lazy(() =>
  import('@components/instruments/controls/MdaJX10Controls').then(m => ({ default: m.MdaJX10Controls }))
);
const MdaDX10Controls = lazy(() =>
  import('@components/instruments/controls/MdaDX10Controls').then(m => ({ default: m.MdaDX10Controls }))
);
const AMSynthControls = lazy(() =>
  import('@components/instruments/controls/AMSynthControls').then(m => ({ default: m.AMSynthControls }))
);
const RaffoSynthControls = lazy(() =>
  import('@components/instruments/controls/RaffoSynthControls').then(m => ({ default: m.RaffoSynthControls }))
);
const CalfMonoControls = lazy(() =>
  import('@components/instruments/controls/CalfMonoControls').then(m => ({ default: m.CalfMonoControls }))
);
const SetBfreeControls = lazy(() =>
  import('@components/instruments/controls/SetBfreeControls').then(m => ({ default: m.SetBfreeControls }))
);
const SynthV1Controls = lazy(() =>
  import('@components/instruments/controls/SynthV1Controls').then(m => ({ default: m.SynthV1Controls }))
);
import { MoniqueControls } from '@components/instruments/controls/MoniqueControls';
import { VL1Controls } from '@components/instruments/controls/VL1Controls';
const TalNoizeMakerControls = lazy(() =>
  import('@components/instruments/controls/TalNoizeMakerControls').then(m => ({ default: m.TalNoizeMakerControls }))
);
const AeolusControls = lazy(() =>
  import('@components/instruments/controls/AeolusControls').then(m => ({ default: m.AeolusControls }))
);
const FluidSynthControls = lazy(() =>
  import('@components/instruments/controls/FluidSynthControls').then(m => ({ default: m.FluidSynthControls }))
);
const SfizzControls = lazy(() =>
  import('@components/instruments/controls/SfizzControls').then(m => ({ default: m.SfizzControls }))
);
const ZynAddSubFXControls = lazy(() =>
  import('@components/instruments/controls/ZynAddSubFXControls').then(m => ({ default: m.ZynAddSubFXControls }))
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
const InStereo2Controls = lazy(() =>
  import('@components/instruments/controls/InStereo2Controls').then(m => ({ default: m.InStereo2Controls }))
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
const SteveTurnerControls = lazy(() =>
  import('@components/instruments/controls/SteveTurnerControls').then(m => ({ default: m.SteveTurnerControls }))
);
const DavidWhittakerControls = lazy(() =>
  import('@components/instruments/controls/DavidWhittakerControls').then(m => ({ default: m.DavidWhittakerControls }))
);
const SymphonieControls = lazy(() =>
  import('@components/instruments/controls/SymphonieControls').then(m => ({ default: m.SymphonieControls }))
);
const FuturePlayerControls = lazy(() =>
  import('@components/instruments/controls/FuturePlayerControls').then(m => ({ default: m.FuturePlayerControls }))
);
const HarmonicSynthControls = lazy(() =>
  import('@components/instruments/controls/HarmonicSynthControls').then(m => ({ default: m.HarmonicSynthControls }))
);
const ModularSynthControls = lazy(() =>
  import('@components/instruments/synths/modular/ModularSynthControls').then(m => ({ default: m.ModularSynthControls }))
);
import { SunVoxModularEditor } from '@components/instruments/synths/modular/SunVoxModularEditor';
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
const CMIControls = lazy(() =>
  import('@components/instruments/controls/CMIControls').then(m => ({ default: m.CMIControls }))
);
const MAMEControls = lazy(() =>
  import('@components/instruments/controls/MAMEControls').then(m => ({ default: m.MAMEControls }))
);
const FurnaceControls = lazy(() =>
  import('@components/instruments/controls/FurnaceControls').then(m => ({ default: m.FurnaceControls }))
);

// ─── Loading fallback ────────────────────────────────────────────────────────

const LoadingFallback = () => (
  <div className="flex items-center justify-center py-8 text-text-muted text-xs">
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

  /** Wrap onUpdate to also push live config to running WASM synth engine */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onUpdateLive = useCallback((configKey: string, cfg: any, updates: any) => {
    const newConfig = { ...cfg, ...updates };
    onUpdate({ [configKey]: newConfig });
    try { getToneEngine().updateNativeSynthConfig(instrument.id, newConfig); } catch { /* engine not ready */ }
  }, [instrument.id, onUpdate]);

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

    // ── Pink Trombone ────────────────────────────────────────
    if (synthType === 'PinkTrombone') {
      const cfg = deepMerge(DEFAULT_PINK_TROMBONE, instrument.pinkTrombone || {});
      return <PinkTromboneControls config={cfg} onChange={(u) => onUpdate({ pinkTrombone: { ...cfg, ...u } })} />;
    }

    // ── DECtalk ────────────────────────────────────────────
    if (synthType === 'DECtalk') {
      const cfg = deepMerge(DEFAULT_DECTALK, instrument.dectalk || {});
      return <DECtalkControls config={cfg} onChange={(u) => onUpdate({ dectalk: { ...cfg, ...u } })} />;
    }

    // ── Synare ──────────────────────────────────────────────
    if (synthType === 'Synare') {
      const cfg = deepMerge(DEFAULT_SYNARE, instrument.synare || {});
      return <SynareControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ synare: { ...cfg, ...u } })} />;
    }

    // ── MDA ePiano (Fender Rhodes) ──────────────────────────
    if (synthType === 'MdaEPiano') {
      const cfg = { ...DEFAULT_MDA_EPIANO, ...(instrument.mdaEPiano || {}) };
      return <MdaEPianoControls config={cfg} onChange={(u) => onUpdate({ mdaEPiano: { ...cfg, ...u } })} />;
    }

    // ── MDA JX-10 (Roland-inspired poly) ────────────────────
    if (synthType === 'MdaJX10') {
      const cfg = { ...DEFAULT_MDA_JX10, ...(instrument.mdaJX10 || {}) };
      return <MdaJX10Controls config={cfg} onChange={(u) => onUpdate({ mdaJX10: { ...cfg, ...u } })} />;
    }

    // ── MDA DX10 (2-operator FM) ────────────────────────────
    if (synthType === 'MdaDX10') {
      const cfg = { ...DEFAULT_MDA_DX10, ...(instrument.mdaDX10 || {}) };
      return <MdaDX10Controls config={cfg} onChange={(u) => onUpdate({ mdaDX10: { ...cfg, ...u } })} />;
    }

    // ── ToneAM (Tone.js AM Synth) — uses generic controls ──
    if (synthType === 'ToneAM') {
      return fallback;
    }

    // ── Amsynth (real amsynth WASM) ──────────────────────────
    if (synthType === 'Amsynth') {
      const cfg = { ...DEFAULT_AMSYNTH, ...(instrument.amsynth || {}) };
      return <AMSynthControls config={cfg} onChange={(u) => onUpdate({ amsynth: { ...cfg, ...u } })} />;
    }

    // ── Raffo (Minimoog clone) ─────────────────────────────
    if (synthType === 'RaffoSynth') {
      const cfg = { ...DEFAULT_RAFFO, ...(instrument.raffo || {}) };
      return <RaffoSynthControls config={cfg} onChange={(u) => onUpdate({ raffo: { ...cfg, ...u } })} />;
    }

    // ── Calf Monosynth ─────────────────────────────────────
    if (synthType === 'CalfMono') {
      const cfg = { ...DEFAULT_CALF_MONO, ...(instrument.calfMono || {}) };
      return <CalfMonoControls config={cfg} onChange={(u) => onUpdate({ calfMono: { ...cfg, ...u } })} />;
    }

    // ── setBfree Hammond B3 ────────────────────────────────
    if (synthType === 'SetBfree') {
      const cfg = { ...DEFAULT_SETBFREE, ...(instrument.setbfree || {}) };
      return <SetBfreeControls config={cfg} onChange={(u) => onUpdate({ setbfree: { ...cfg, ...u } })} />;
    }

    // ── SynthV1 (4-osc poly) ───────────────────────────────
    if (synthType === 'SynthV1') {
      const cfg = { ...DEFAULT_SYNTHV1, ...(instrument.synthv1 || {}) };
      return <SynthV1Controls config={cfg} onChange={(u) => onUpdate({ synthv1: { ...cfg, ...u } })} />;
    }

    // ── Monique (Morphing Mono) ────────────────────────────
    if (synthType === 'Monique') {
      const cfg = { ...DEFAULT_MONIQUE, ...(instrument.monique || {}) };
      return <MoniqueControls config={cfg} onChange={(u) => onUpdate({ monique: { ...cfg, ...u } })} />;
    }

    // ── VL1 (Casio VL-Tone) ─────────────────────────────────
    if (synthType === 'VL1') {
      const cfg = { ...DEFAULT_VL1, ...(instrument.vl1 || {}) };
      return <VL1Controls config={cfg} onChange={(u) => onUpdate({ vl1: { ...cfg, ...u } })} />;
    }

    // ── TAL-NoiseMaker ─────────────────────────────────────
    if (synthType === 'TalNoizeMaker') {
      const cfg = { ...DEFAULT_TAL_NOIZEMAKER, ...(instrument.talNoizeMaker || {}) };
      return <TalNoizeMakerControls config={cfg} onChange={(u) => onUpdate({ talNoizeMaker: { ...cfg, ...u } })} />;
    }

    // ── Aeolus (Pipe Organ) ────────────────────────────────
    if (synthType === 'Aeolus') {
      const cfg = { ...DEFAULT_AEOLUS, ...(instrument.aeolus || {}) };
      return <AeolusControls config={cfg} onChange={(u) => onUpdate({ aeolus: { ...cfg, ...u } })} />;
    }

    // ── FluidSynth (SF2) ───────────────────────────────────
    if (synthType === 'FluidSynth') {
      const cfg = { ...DEFAULT_FLUIDSYNTH, ...(instrument.fluidsynth || {}) };
      return <FluidSynthControls config={cfg} onChange={(u) => onUpdate({ fluidsynth: { ...cfg, ...u } })} />;
    }

    // ── Sfizz (SFZ) ────────────────────────────────────────
    if (synthType === 'Sfizz') {
      const cfg = { ...DEFAULT_SFIZZ, ...(instrument.sfizz || {}) };
      return <SfizzControls config={cfg} onChange={(u) => onUpdate({ sfizz: { ...cfg, ...u } })} />;
    }

    // ── ZynAddSubFX ────────────────────────────────────────
    if (synthType === 'ZynAddSubFX') {
      const cfg = { ...DEFAULT_ZYNADDSUBFX, ...(instrument.zynaddsubfx || {}) };
      return <ZynAddSubFXControls config={cfg} onChange={(u) => onUpdate({ zynaddsubfx: { ...cfg, ...u } })} />;
    }

    // ── HivelyTracker ───────────────────────────────────────
    if (synthType === 'HivelySynth') {
      const cfg = deepMerge(DEFAULT_HIVELY, instrument.hively || {});
      return <HivelyControls config={cfg} instrumentId={instrument.id} onChange={(u) => onUpdate({ hively: { ...cfg, ...u } })} />;
    }

    // ── JamCracker ──────────────────────────────────────────
    if (synthType === 'JamCrackerSynth') {
      const cfg = deepMerge(DEFAULT_JAMCRACKER, instrument.jamCracker || {});
      return <JamCrackerControls config={cfg} onChange={(u) => onUpdateLive('jamCracker', cfg, u)} />;
    }

    // ── UADE tracker synths ─────────────────────────────────
    if (synthType === 'SoundMonSynth') {
      const cfg = deepMerge(DEFAULT_SOUNDMON, instrument.soundMon || {});
      return <SoundMonControls config={cfg} onChange={(u) => onUpdateLive('soundMon', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SidMonSynth') {
      const cfg = deepMerge(DEFAULT_SIDMON, instrument.sidMon || {});
      return <SidMonControls config={cfg} onChange={(u) => onUpdateLive('sidMon', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DigMugSynth') {
      const cfg = deepMerge(DEFAULT_DIGMUG, instrument.digMug || {});
      return <DigMugControls config={cfg} onChange={(u) => onUpdateLive('digMug', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SonicArrangerSynth') {
      const cfg = deepMerge(DEFAULT_SONIC_ARRANGER, instrument.sonicArranger || {});
      return <SonicArrangerControls config={cfg} onChange={(u) => onUpdateLive('sonicArranger', cfg, u)} />;
    }
    if (synthType === 'InStereo2Synth') {
      const cfg = deepMerge(DEFAULT_INSTEREO2, instrument.inStereo2 || {});
      return <InStereo2Controls config={cfg} onChange={(u) => onUpdateLive('inStereo2', cfg, u)} />;
    }
    if (synthType === 'InStereo1Synth') {
      const cfg = deepMerge(DEFAULT_INSTEREO2, instrument.inStereo1 || {});
      return <InStereo2Controls config={cfg} onChange={(u) => onUpdateLive('inStereo1', cfg, u)} />;
    }
    if (synthType === 'FCSynth') {
      const cfg = deepMerge(DEFAULT_FC, instrument.fc || {});
      return <FCControls config={cfg} onChange={(u) => onUpdateLive('fc', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DeltaMusic1Synth') {
      const cfg = deepMerge(DEFAULT_DELTAMUSIC1, instrument.deltaMusic1 || {});
      return <DeltaMusic1Controls config={cfg} onChange={(u) => onUpdateLive('deltaMusic1', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'DeltaMusic2Synth') {
      const cfg = deepMerge(DEFAULT_DELTAMUSIC2, instrument.deltaMusic2 || {});
      return <DeltaMusic2Controls config={cfg} onChange={(u) => onUpdateLive('deltaMusic2', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'FredSynth') {
      const cfg = deepMerge(DEFAULT_FRED, instrument.fred || {});
      return <FredControls config={cfg} onChange={(u) => onUpdateLive('fred', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'TFMXSynth') {
      const cfg = deepMerge(DEFAULT_TFMX, instrument.tfmx || {});
      return <TFMXControls config={cfg} onChange={(c) => onUpdateLive('tfmx', {}, c)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'OctaMEDSynth') {
      const cfg = deepMerge(DEFAULT_OCTAMED, instrument.octamed || {});
      return <OctaMEDControls config={cfg} onChange={(u) => onUpdateLive('octamed', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SidMon1Synth') {
      const cfg = deepMerge(DEFAULT_SIDMON1, instrument.sidmon1 || {});
      return <SidMon1Controls config={cfg} onChange={(u) => onUpdateLive('sidmon1', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'HippelCoSoSynth') {
      const cfg = deepMerge(DEFAULT_HIPPEL_COSO, instrument.hippelCoso || {});
      return <HippelCoSoControls config={cfg} onChange={(u) => onUpdateLive('hippelCoso', cfg, u)} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'RobHubbardSynth') {
      const cfg = deepMerge(DEFAULT_ROB_HUBBARD, instrument.robHubbard || {});
      return <RobHubbardControls config={cfg} onChange={(u) => onUpdate({ robHubbard: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SteveTurnerSynth') {
      const cfg = deepMerge(DEFAULT_STEVE_TURNER, instrument.steveTurner || {});
      return <SteveTurnerControls config={cfg} onChange={(u) => onUpdate({ steveTurner: { ...cfg, ...u } })} instrumentIndex={instrument.id} />;
    }
    if (synthType === 'DavidWhittakerSynth') {
      const cfg = deepMerge(DEFAULT_DAVID_WHITTAKER, instrument.davidWhittaker || {});
      return <DavidWhittakerControls config={cfg} onChange={(u) => onUpdate({ davidWhittaker: { ...cfg, ...u } })} uadeChipRam={instrument.uadeChipRam} />;
    }
    if (synthType === 'SymphonieSynth') {
      const cfg = deepMerge(DEFAULT_SYMPHONIE, instrument.symphonie || {});
      return <SymphonieControls config={cfg} onChange={(u) => onUpdateLive('symphonie', cfg, u)} />;
    }
    if (synthType === 'FuturePlayerSynth') {
      const cfg = deepMerge(DEFAULT_FUTUREPLAYER, instrument.futurePlayer || {});
      return <FuturePlayerControls config={cfg} onChange={(u) => onUpdateLive('futurePlayer', cfg, u)} />;
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

    // ── SunVox Modular ──────────────────────────────────────
    if (synthType === 'SunVoxModular') {
      return <SunVoxModularEditor config={instrument} onChange={onUpdate} />;
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

    // ── VSTBridge (generic) ─────────────────────────────────
    if (SYNTH_REGISTRY.has(synthType)) {
      return <VSTBridgePanel instrument={instrument} onChange={onUpdate} />;
    }

    // ── Fairlight CMI IIx (dedicated editor) ──────────────
    if (synthType === 'MAMECMI') {
      return (
        <CMIControls
          synthType={synthType}
          parameters={(instrument.parameters || {}) as Record<string, number | string>}
          instrumentId={instrument.id}
          onParamChange={handleChipParamChange}
          onTextChange={handleChipTextChange}
          onLoadPreset={(program) => onUpdate({ parameters: { ...instrument.parameters, program } })}
        />
      );
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

    // ── Synths with declarative layouts (DOMSynthPanel) ──
    // Covers demoscene synths, Retromulator synths, and any other with SynthPanelLayout
    {
      const declLayout = getSynthLayout(synthType);
      if (declLayout) {
        return (
          <DOMSynthPanel
            layout={declLayout}
            config={instrument as unknown as Record<string, unknown>}
            onChange={(updates) => onUpdate(updates)}
          />
        );
      }
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
