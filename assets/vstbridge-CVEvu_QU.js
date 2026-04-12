import { bp as SYNTH_REGISTRY, aT as SynthRegistry, bq as VSTBridgeSynth } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
for (const [id, vstDesc] of SYNTH_REGISTRY.entries()) {
  if (SynthRegistry.has(id)) continue;
  SynthRegistry.register({
    id,
    name: vstDesc.name,
    category: "wasm",
    loadMode: "lazy",
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: vstDesc.volumeOffsetDb ?? 0,
    controlsComponent: vstDesc.panelComponent,
    commands: vstDesc.commands,
    create: (config) => {
      return new VSTBridgeSynth(vstDesc, config);
    },
    onTriggerRelease: (synth, _note, time) => {
      synth.triggerRelease(time);
      return true;
    }
  });
}
