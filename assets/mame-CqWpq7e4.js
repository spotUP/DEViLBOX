import { dbToGain } from "./vendor-tone-48TQc1H3.js";
import { aT as SynthRegistry, aU as HC55516Synth, aV as VLM5030Synth, aW as S14001ASynth, aX as RolandGPSynth, aY as SWP20Synth, aZ as SWP00Synth, a_ as KS0164Synth, a$ as ZSG2Synth, b0 as PS1SPUSynth, b1 as FZSynth, b2 as CMISynth, b3 as VASynthSynth, b4 as YMOPQSynth, b5 as YMF271Synth, b6 as VotraxSynth, b7 as UPD933Synth, b8 as UPD931Synth, b9 as TR707Synth, ba as TMS5220Synth, bb as TMS36XXSynth, bc as SP0250Synth, bd as SNKWaveSynth, be as SN76477Synth, bf as RF5C400Synth, bg as MEA8000Synth, bh as K054539Synth, bi as ICS2115Synth, bj as ES5503Synth, bk as C352Synth, bl as AstrocadeSynth, bm as ASCSynth } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const VOLUME_OFFSETS = {
  MAMEASC: 11,
  MAMEAstrocade: 18,
  MAMEC352: 17,
  MAMEES5503: 62,
  MAMEICS2115: 35,
  MAMEK054539: 22,
  MAMEMEA8000: 12,
  MAMERF5C400: 0,
  MAMESN76477: 5,
  MAMESNKWave: 8,
  MAMESP0250: 26,
  MAMETMS36XX: 6,
  MAMETMS5220: 37,
  MAMETR707: 22,
  MAMEUPD931: 23,
  MAMEUPD933: 28,
  MAMEVotrax: 20,
  MAMEYMF271: 15,
  MAMEYMOPQ: 19,
  MAMEVASynth: 20,
  MAMECMI: 0,
  // TBD — needs calibration once WASM is compiled
  MAMEFZPCM: 0,
  // TBD
  MAMEPS1SPU: 0,
  // TBD
  MAMEZSG2: 0,
  // TBD
  MAMEKS0164: 0,
  // TBD
  MAMESWP00: 0,
  // TBD
  MAMESWP20: 0,
  // TBD
  MAMERolandGP: 0,
  // TBD
  MAMES14001A: 32,
  MAMEVLM5030: 34,
  MAMEHC55516: 30
};
function getNormalizedVolume(synthType, configVolume) {
  return (configVolume ?? -12) + (VOLUME_OFFSETS[synthType] ?? 0);
}
function applyChipParameters(synth, config) {
  const params = config.parameters;
  if (!params) return;
  if (typeof params._program === "number" && typeof synth.loadPreset === "function") {
    synth.loadPreset(params._program);
  }
  for (const [key, value] of Object.entries(params)) {
    if (key === "_program" || typeof value !== "number") continue;
    synth.setParam(key, value);
  }
}
const SYNTH_CLASSES = {
  ASCSynth,
  AstrocadeSynth,
  C352Synth,
  ES5503Synth,
  ICS2115Synth,
  K054539Synth,
  MEA8000Synth,
  RF5C400Synth,
  SN76477Synth,
  SNKWaveSynth,
  SP0250Synth,
  TMS36XXSynth,
  TMS5220Synth,
  TR707Synth,
  UPD931Synth,
  UPD933Synth,
  VotraxSynth,
  YMF271Synth,
  YMOPQSynth,
  VASynthSynth,
  CMISynth,
  FZSynth,
  PS1SPUSynth,
  ZSG2Synth,
  KS0164Synth,
  SWP00Synth,
  SWP20Synth,
  RolandGPSynth,
  S14001ASynth,
  VLM5030Synth,
  HC55516Synth
};
const MAME_CHIPS = [
  { id: "MAMEASC", name: "Apple Sound Chip", className: "ASCSynth" },
  { id: "MAMEAstrocade", name: "Bally Astrocade", className: "AstrocadeSynth" },
  { id: "MAMEC352", name: "Namco C352", className: "C352Synth" },
  { id: "MAMEES5503", name: "Ensoniq ES5503 DOC", className: "ES5503Synth" },
  { id: "MAMEICS2115", name: "ICS WaveFront", className: "ICS2115Synth" },
  { id: "MAMEK054539", name: "Konami 054539", className: "K054539Synth" },
  { id: "MAMEMEA8000", name: "Philips MEA8000", className: "MEA8000Synth" },
  { id: "MAMERF5C400", name: "Ricoh RF5C400", className: "RF5C400Synth" },
  { id: "MAMESN76477", name: "TI SN76477", className: "SN76477Synth" },
  { id: "MAMESNKWave", name: "SNK Wavetable", className: "SNKWaveSynth" },
  { id: "MAMESP0250", name: "GI SP0250", className: "SP0250Synth" },
  { id: "MAMETMS36XX", name: "TI TMS36XX", className: "TMS36XXSynth" },
  { id: "MAMETMS5220", name: "TI TMS5220", className: "TMS5220Synth" },
  { id: "MAMETR707", name: "Roland TR-707", className: "TR707Synth" },
  { id: "MAMEUPD931", name: "NEC uPD931", className: "UPD931Synth" },
  { id: "MAMEUPD933", name: "NEC uPD933", className: "UPD933Synth" },
  { id: "MAMEVotrax", name: "Votrax SC-01", className: "VotraxSynth" },
  { id: "MAMEYMF271", name: "Yamaha OPX (YMF271)", className: "YMF271Synth" },
  { id: "MAMEYMOPQ", name: "Yamaha OPQ (YM3806)", className: "YMOPQSynth" },
  { id: "MAMEVASynth", name: "Virtual Analog", className: "VASynthSynth" },
  { id: "MAMECMI", name: "Fairlight CMI IIx", className: "CMISynth" },
  { id: "MAMEFZPCM", name: "Casio FZ PCM", className: "FZSynth" },
  { id: "MAMEPS1SPU", name: "PlayStation SPU", className: "PS1SPUSynth" },
  { id: "MAMEZSG2", name: "ZOOM ZSG-2", className: "ZSG2Synth" },
  { id: "MAMEKS0164", name: "Samsung KS0164", className: "KS0164Synth" },
  { id: "MAMESWP00", name: "Yamaha SWP00", className: "SWP00Synth" },
  { id: "MAMESWP20", name: "Yamaha SWP20", className: "SWP20Synth" },
  { id: "MAMERolandGP", name: "Roland GP TC6116", className: "RolandGPSynth" },
  { id: "MAMES14001A", name: "SSi TSI S14001A", className: "S14001ASynth" },
  { id: "MAMEVLM5030", name: "Sanyo VLM5030", className: "VLM5030Synth" },
  { id: "MAMEHC55516", name: "Harris HC55516", className: "HC55516Synth" }
];
for (const chip of MAME_CHIPS) {
  SynthRegistry.register({
    id: chip.id,
    name: chip.name,
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: VOLUME_OFFSETS[chip.id] ?? 0,
    controlsComponent: "ChipSynthControls",
    create: (config) => {
      const SynthClass = SYNTH_CLASSES[chip.className];
      const synth = new SynthClass();
      synth.output.gain.value = dbToGain(getNormalizedVolume(chip.id, config.volume));
      applyChipParameters(synth, config);
      return synth;
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  });
}
