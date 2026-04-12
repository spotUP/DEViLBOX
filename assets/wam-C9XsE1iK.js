import { dbToGain } from "./vendor-tone-48TQc1H3.js";
import { aT as SynthRegistry, br as WAMSynth, bs as WAM_SYNTH_URLS } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
const wamDescs = [
  {
    id: "WAM",
    name: "Web Audio Module",
    category: "wam",
    loadMode: "lazy",
    useSynthBus: true,
    create: (config) => {
      const wamConfig = config.wam || { moduleUrl: "", pluginState: null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = dbToGain(config.volume ?? -12);
      return synth;
    }
  },
  {
    id: "WAMOBXd",
    name: "OB-Xd (WAM)",
    category: "wam",
    loadMode: "lazy",
    useSynthBus: true,
    create: (config) => {
      var _a;
      const url = WAM_SYNTH_URLS["WAMOBXd"];
      const wamConfig = { ...config.wam, moduleUrl: url || "", pluginState: ((_a = config.wam) == null ? void 0 : _a.pluginState) ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = dbToGain(config.volume ?? -12);
      return synth;
    }
  },
  {
    id: "WAMSynth101",
    name: "Synth-101 (WAM)",
    category: "wam",
    loadMode: "lazy",
    useSynthBus: true,
    create: (config) => {
      var _a;
      const url = WAM_SYNTH_URLS["WAMSynth101"];
      const wamConfig = { ...config.wam, moduleUrl: url || "", pluginState: ((_a = config.wam) == null ? void 0 : _a.pluginState) ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = dbToGain(config.volume ?? -12);
      return synth;
    }
  },
  {
    id: "WAMTinySynth",
    name: "TinySynth (WAM)",
    category: "wam",
    loadMode: "lazy",
    useSynthBus: true,
    create: (config) => {
      var _a;
      const url = WAM_SYNTH_URLS["WAMTinySynth"];
      const wamConfig = { ...config.wam, moduleUrl: url || "", pluginState: ((_a = config.wam) == null ? void 0 : _a.pluginState) ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = dbToGain(config.volume ?? -12);
      return synth;
    }
  },
  {
    id: "WAMFaustFlute",
    name: "Faust Flute (WAM)",
    category: "wam",
    loadMode: "lazy",
    useSynthBus: true,
    create: (config) => {
      var _a;
      const url = WAM_SYNTH_URLS["WAMFaustFlute"];
      const wamConfig = { ...config.wam, moduleUrl: url || "", pluginState: ((_a = config.wam) == null ? void 0 : _a.pluginState) ?? null };
      const synth = new WAMSynth(wamConfig);
      synth.output.gain.value = dbToGain(config.volume ?? -12);
      return synth;
    }
  }
];
SynthRegistry.register(wamDescs);
