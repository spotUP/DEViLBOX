const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { bM as EffectRegistry, bN as BUZZMACHINE_INFO, am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function buzzEffect(id, name, machineType, group) {
  return {
    id,
    name,
    category: "buzzmachine",
    group,
    loadMode: "lazy",
    create: async (c) => {
      const { BuzzmachineSynth } = await __vitePreload(async () => {
        const { BuzzmachineSynth: BuzzmachineSynth2 } = await import("./main-BbV5VyEH.js").then((n) => n.iV);
        return { BuzzmachineSynth: BuzzmachineSynth2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const synth = new BuzzmachineSynth(machineType);
      Object.entries(c.parameters).forEach(([key, value]) => {
        const paramIndex = parseInt(key, 10);
        if (!isNaN(paramIndex)) synth.setParameter(paramIndex, value);
      });
      return synth;
    },
    getDefaultParameters: () => {
      var _a;
      const info = BUZZMACHINE_INFO[machineType];
      if (!((_a = info == null ? void 0 : info.parameters) == null ? void 0 : _a.length)) return {};
      const defaults = {};
      for (const p of info.parameters) {
        defaults[String(p.index)] = p.defaultValue;
      }
      return defaults;
    }
  };
}
EffectRegistry.register([
  // Distortion
  buzzEffect("BuzzDistortion", "Arguru Distortion", "ArguruDistortion", "Distortion"),
  buzzEffect("BuzzOverdrive", "Geonik Overdrive", "GeonikOverdrive", "Distortion"),
  buzzEffect("BuzzDistortion2", "Jeskola Distortion", "JeskolaDistortion", "Distortion"),
  buzzEffect("BuzzDist2", "Elak Dist2", "ElakDist2", "Distortion"),
  buzzEffect("BuzzSoftSat", "Graue Soft Saturation", "GraueSoftSat", "Distortion"),
  buzzEffect("BuzzStereoDist", "WhiteNoise Stereo Dist", "WhiteNoiseStereoDist", "Distortion"),
  // Filter
  buzzEffect("BuzzSVF", "Elak State Variable Filter", "ElakSVF", "Filter"),
  buzzEffect("BuzzPhilta", "FSM Philta", "FSMPhilta", "Filter"),
  buzzEffect("BuzzNotch", "CyanPhase Notch", "CyanPhaseNotch", "Filter"),
  buzzEffect("BuzzZfilter", "Q Zfilter", "QZfilter", "Filter"),
  // Reverb & Delay
  buzzEffect("BuzzDelay", "Jeskola Delay", "JeskolaDelay", "Reverb & Delay"),
  buzzEffect("BuzzCrossDelay", "Jeskola Cross Delay", "JeskolaCrossDelay", "Reverb & Delay"),
  buzzEffect("BuzzFreeverb", "Jeskola Freeverb", "JeskolaFreeverb", "Reverb & Delay"),
  buzzEffect("BuzzPanzerDelay", "FSM Panzer Delay", "FSMPanzerDelay", "Reverb & Delay"),
  // Modulation
  buzzEffect("BuzzChorus", "FSM Chorus", "FSMChorus", "Modulation"),
  buzzEffect("BuzzChorus2", "FSM Chorus 2", "FSMChorus2", "Modulation"),
  buzzEffect("BuzzWhiteChorus", "WhiteNoise White Chorus", "WhiteNoiseWhiteChorus", "Modulation"),
  buzzEffect("BuzzFreqShift", "Bigyo Frequency Shifter", "BigyoFrequencyShifter", "Pitch"),
  // Dynamics
  buzzEffect("BuzzCompressor", "Geonik Compressor", "GeonikCompressor", "Dynamics"),
  buzzEffect("BuzzLimiter", "Ld Soft Limiter", "LdSLimit", "Dynamics"),
  buzzEffect("BuzzExciter", "Oomek Exciter", "OomekExciter", "Dynamics"),
  buzzEffect("BuzzMasterizer", "Oomek Masterizer", "OomekMasterizer", "Dynamics"),
  // EQ & Stereo
  buzzEffect("BuzzStereoGain", "DedaCode Stereo Gain", "DedaCodeStereoGain", "EQ & Stereo")
]);
