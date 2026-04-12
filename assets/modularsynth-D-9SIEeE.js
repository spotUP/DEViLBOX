import { aT as SynthRegistry, bK as MODULAR_INIT_PATCH, bL as ModularSynth } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const descriptor = {
  id: "ModularSynth",
  name: "Modular Synth",
  category: "native",
  loadMode: "lazy",
  create: (config) => {
    const patchConfig = config.modularSynth || MODULAR_INIT_PATCH;
    return new ModularSynth(patchConfig);
  },
  useSynthBus: true,
  controlsComponent: "ModularSynthControls"
};
SynthRegistry.register(descriptor);
