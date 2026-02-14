/**
 * MAME hardware-accurate chip synth registrations (lazy-loaded)
 *
 * This entire module is loaded lazily via `import('./mame')` — all top-level
 * imports are deferred until first use of any MAME synth.
 */

import * as Tone from 'tone';
import { SynthRegistry } from '../SynthRegistry';
import type { InstrumentConfig } from '@typedefs/instrument';
import { AICASynth } from '../../aica/AICASynth';
import { ASCSynth } from '../../asc/ASCSynth';
import { AstrocadeSynth } from '../../astrocade/AstrocadeSynth';
import { C352Synth } from '../../c352/C352Synth';
import { ES5503Synth } from '../../es5503/ES5503Synth';
import { ICS2115Synth } from '../../ics2115/ICS2115Synth';
import { K054539Synth } from '../../k054539/K054539Synth';
import { MEA8000Synth } from '../../mea8000/MEA8000Synth';
import { RF5C400Synth } from '../../rf5c400/RF5C400Synth';
import { SN76477Synth } from '../../sn76477/SN76477Synth';
import { SNKWaveSynth } from '../../snkwave/SNKWaveSynth';
import { SP0250Synth } from '../../sp0250/SP0250Synth';
import { TMS36XXSynth } from '../../tms36xx/TMS36XXSynth';
import { TMS5220Synth } from '../../tms5220/TMS5220Synth';
import { TR707Synth } from '../../tr707/TR707Synth';
import { UPD931Synth } from '../../upd931/UPD931Synth';
import { UPD933Synth } from '../../upd933/UPD933Synth';
import { VotraxSynth } from '../../votrax/VotraxSynth';
import { YMF271Synth } from '../../ymf271/YMF271Synth';
import { YMOPQSynth } from '../../ymopq/YMOPQSynth';
import { VASynthSynth } from '../../vasynth/VASynthSynth';

const VOLUME_OFFSETS: Record<string, number> = {
  MAMEAICA: 0, MAMEASC: 11, MAMEAstrocade: 18, MAMEC352: 17, MAMEES5503: 62,
  MAMEICS2115: 35, MAMEK054539: 22, MAMEMEA8000: 12, MAMERF5C400: 0,
  MAMESN76477: 5, MAMESNKWave: 8, MAMESP0250: 26, MAMETMS36XX: 6,
  MAMETMS5220: 37, MAMETR707: 22, MAMEUPD931: 23, MAMEUPD933: 28,
  MAMEVotrax: 20, MAMEYMF271: 15, MAMEYMOPQ: 19, MAMEVASynth: 20,
};

function getNormalizedVolume(synthType: string, configVolume: number | undefined): number {
  return (configVolume ?? -12) + (VOLUME_OFFSETS[synthType] ?? 0);
}

function applyChipParameters(synth: { setParam: (key: string, value: number) => void; loadPreset?: (index: number) => void }, config: InstrumentConfig): void {
  const params = config.parameters;
  if (!params) return;
  if (typeof params._program === 'number' && typeof synth.loadPreset === 'function') {
    synth.loadPreset(params._program);
  }
  for (const [key, value] of Object.entries(params)) {
    if (key === '_program' || typeof value !== 'number') continue;
    synth.setParam(key, value);
  }
}

// Constructor lookup — maps class name to actual class
const SYNTH_CLASSES: Record<string, new () => any> = {
  AICASynth, ASCSynth, AstrocadeSynth, C352Synth, ES5503Synth, ICS2115Synth,
  K054539Synth, MEA8000Synth, RF5C400Synth, SN76477Synth, SNKWaveSynth,
  SP0250Synth, TMS36XXSynth, TMS5220Synth, TR707Synth, UPD931Synth,
  UPD933Synth, VotraxSynth, YMF271Synth, YMOPQSynth, VASynthSynth,
};

interface MAMEChipDef {
  id: string;
  name: string;
  className: string;
}

const MAME_CHIPS: MAMEChipDef[] = [
  { id: 'MAMEAICA', name: 'Sega AICA (Dreamcast)', className: 'AICASynth' },
  { id: 'MAMEASC', name: 'Apple Sound Chip', className: 'ASCSynth' },
  { id: 'MAMEAstrocade', name: 'Bally Astrocade', className: 'AstrocadeSynth' },
  { id: 'MAMEC352', name: 'Namco C352', className: 'C352Synth' },
  { id: 'MAMEES5503', name: 'Ensoniq ES5503 DOC', className: 'ES5503Synth' },
  { id: 'MAMEICS2115', name: 'ICS WaveFront', className: 'ICS2115Synth' },
  { id: 'MAMEK054539', name: 'Konami 054539', className: 'K054539Synth' },
  { id: 'MAMEMEA8000', name: 'Philips MEA8000', className: 'MEA8000Synth' },
  { id: 'MAMERF5C400', name: 'Ricoh RF5C400', className: 'RF5C400Synth' },
  { id: 'MAMESN76477', name: 'TI SN76477', className: 'SN76477Synth' },
  { id: 'MAMESNKWave', name: 'SNK Wavetable', className: 'SNKWaveSynth' },
  { id: 'MAMESP0250', name: 'GI SP0250', className: 'SP0250Synth' },
  { id: 'MAMETMS36XX', name: 'TI TMS36XX', className: 'TMS36XXSynth' },
  { id: 'MAMETMS5220', name: 'TI TMS5220', className: 'TMS5220Synth' },
  { id: 'MAMETR707', name: 'Roland TR-707', className: 'TR707Synth' },
  { id: 'MAMEUPD931', name: 'NEC uPD931', className: 'UPD931Synth' },
  { id: 'MAMEUPD933', name: 'NEC uPD933', className: 'UPD933Synth' },
  { id: 'MAMEVotrax', name: 'Votrax SC-01', className: 'VotraxSynth' },
  { id: 'MAMEYMF271', name: 'Yamaha OPX (YMF271)', className: 'YMF271Synth' },
  { id: 'MAMEYMOPQ', name: 'Yamaha OPQ (YM3806)', className: 'YMOPQSynth' },
  { id: 'MAMEVASynth', name: 'Virtual Analog', className: 'VASynthSynth' },
];

for (const chip of MAME_CHIPS) {
  SynthRegistry.register({
    id: chip.id,
    name: chip.name,
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: VOLUME_OFFSETS[chip.id] ?? 0,
    controlsComponent: 'ChipSynthControls',
    create: (config) => {
      const SynthClass = SYNTH_CLASSES[chip.className];
      const synth = new SynthClass();
      synth.output.gain.value = Tone.dbToGain(getNormalizedVolume(chip.id, config.volume));
      applyChipParameters(synth, config);
      return synth as unknown as Tone.ToneAudioNode;
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  });
}
