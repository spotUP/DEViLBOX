/**
 * WasmInfoEditor.tsx — Minimal info display for playback-only WASM formats
 *
 * Shows format name, channel count, and any available metadata.
 * Used for Tier 3/4 formats where the WASM engine has no instrument param API.
 */

import React from 'react';
import type { SynthType } from '@/types/instrument/base';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';

interface WasmInfoEditorProps {
  synthType: SynthType;
  instrumentName?: string;
}

const FORMAT_INFO: Record<string, { name: string; description: string; color: string }> = {
  SonixSynth: {
    name: 'Sonix',
    description: 'Hybrid PCM/Synth/IFF/SMUS replayer (Amiga). Supports SNX, SMUS, and Tiny Sound formats.',
    color: '#44ccaa',
  },
  PxtoneSynth: {
    name: 'PxTone Collage',
    description: 'PxTone by Pixel (Cave Story engine). Wavetable, PCM, noise, and OGGV voice types with multi-point volume envelopes.',
    color: '#ff66aa',
  },
  OrganyaSynth: {
    name: 'Organya',
    description: 'Cave Story music format by Pixel. 8 melody + 8 drum channels using 100 built-in wavetable instruments.',
    color: '#66aaff',
  },
  Sc68Synth: {
    name: 'SC68 / SNDH',
    description: 'Atari ST music replayer. YM2149 PSG + 68000 CPU emulation for SNDH and SC68 formats.',
    color: '#ffaa44',
  },
  ZxtuneSynth: {
    name: 'ZXTune',
    description: 'ZX Spectrum music replayer. AY-3-8910/YM2149 PSG emulation for PT3, STC, VTX, PSG, and 30+ formats.',
    color: '#44ff66',
  },
  IxalanceSynth: {
    name: 'Ixalance',
    description: 'Ixalance music system (IXS). Transpiled x86 replayer with internal Impulse Tracker engine.',
    color: '#aa66ff',
  },
  CpsycleSynth: {
    name: 'Cpsycle',
    description: 'Psycle tracker format. Plugin-based synthesis — instruments are defined by plugin chains.',
    color: '#ff6644',
  },
  PumaTrackerSynth: {
    name: 'PumaTracker',
    description: 'PumaTracker (Amiga). Transpiled 68k replayer with Paula DMA emulation.',
    color: '#44aaff',
  },
  HippelSynth: {
    name: 'Hippel (Simple)',
    description: 'Jochen Hippel simple format (Amiga). Transpiled 68k replayer with Paula emulation.',
    color: '#aaff44',
  },
  MusicAssemblerSynth: {
    name: 'Music-Assembler',
    description: 'Music-Assembler (Amiga). Transpiled 68k replayer — ADSR, vibrato, and arpeggio synthesis.',
    color: '#aaaa44',
  },
  BenDaglishSynth: {
    name: 'Ben Daglish',
    description: 'Ben Daglish music format (Amiga). Transpiled 68k replayer with portamento and sample playback.',
    color: '#44aaaa',
  },
  ArtOfNoiseSynth: {
    name: 'Art of Noise',
    description: 'Art of Noise AON4/AON8 (Amiga). RetrovertApp C port — finetune table synthesis.',
    color: '#aa44aa',
  },
  MdxminiSynth: {
    name: 'MDX',
    description: 'Sharp X68000 FM music format. YM2151 (OPM) + ADPCM emulation via mdxmini library.',
    color: '#ff8866',
  },
  PmdminiSynth: {
    name: 'PMD',
    description: 'PC-98 FM music format (Professional Music Driver). YM2203/YM2608 (OPN/OPNA) emulation via pmdmini library.',
    color: '#6688ff',
  },
  AsapSynth: {
    name: 'ASAP',
    description: 'Another Slight Atari Player. Atari 8-bit POKEY chip music — SAP, CMC, CM3, TMC, TM2, and more.',
    color: '#88cc44',
  },
  KlysSynth: {
    name: 'Klystrack',
    description: 'Klystrack chiptune tracker. Multi-oscillator wavetable synthesis with effects chains.',
    color: '#44cccc',
  },
  QsfSynth: {
    name: 'QSF',
    description: 'Capcom QSound format. Z80 CPU + QSound DSP emulation for CPS1/CPS2 arcade music.',
    color: '#cc4488',
  },
  UADESynth: {
    name: 'UADE',
    description: 'Unix Amiga Delitracker Emulator. Playback-only engine for 130+ exotic Amiga tracker formats — load a file to play, instruments are managed by the underlying replayer.',
    color: '#aaccff',
  },
};

export const WasmInfoEditor: React.FC<WasmInfoEditorProps> = ({ synthType, instrumentName }) => {
  const info = FORMAT_INFO[synthType];
  const { panelStyle } = useInstrumentColors(info?.color ?? '#888888');

  if (!info) {
    return (
      <div className="p-4 text-text-muted text-sm">
        Unknown format: {synthType}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4" style={panelStyle}>
      <div className="text-text-primary font-medium text-sm">{info.name}</div>
      {instrumentName && (
        <div className="text-text-muted text-xs">Instrument: {instrumentName}</div>
      )}
      <div className="text-text-muted text-xs leading-relaxed">{info.description}</div>
      <div className="text-text-muted text-[10px] mt-2 border-t border-border-primary/30 pt-2">
        Playback-only format — instrument parameters are handled internally by the WASM replayer engine.
      </div>
    </div>
  );
};
