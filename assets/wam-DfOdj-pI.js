const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { bM as EffectRegistry, am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function wamEffect(id, name, group, defaults = {}) {
  return {
    id,
    name,
    category: "wam",
    group,
    loadMode: "lazy",
    create: async (c) => {
      const { WAM_EFFECT_URLS } = await __vitePreload(async () => {
        const { WAM_EFFECT_URLS: WAM_EFFECT_URLS2 } = await import("./main-BbV5VyEH.js").then((n) => n.iU);
        return { WAM_EFFECT_URLS: WAM_EFFECT_URLS2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const { WAMEffectNode } = await __vitePreload(async () => {
        const { WAMEffectNode: WAMEffectNode2 } = await import("./main-BbV5VyEH.js").then((n) => n.iT);
        return { WAMEffectNode: WAMEffectNode2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      const wamUrl = WAM_EFFECT_URLS[c.type];
      if (!wamUrl) {
        const Tone = await __vitePreload(() => import("./vendor-tone-48TQc1H3.js"), true ? [] : void 0);
        console.warn(`[EffectRegistry] No WAM URL for effect: ${c.type}`);
        return new Tone.Gain(1);
      }
      const wamNode = new WAMEffectNode({ moduleUrl: wamUrl, wet: c.wet / 100 });
      await wamNode.ensureInitialized();
      for (const [key, value] of Object.entries(c.parameters)) {
        await wamNode.setParameter(key, Number(value));
      }
      return wamNode;
    },
    getDefaultParameters: () => ({ ...defaults })
  };
}
EffectRegistry.register([
  // Distortion
  // BigMuff: Sustain=moderate, Tone=neutral, Volume=unity (Faust param naming)
  wamEffect("WAMBigMuff", "Big Muff Pi", "Distortion", { Sustain: 0.4, Tone: 0.5, Volume: 0.7 }),
  wamEffect("WAMTS9", "TS-9 Overdrive", "Distortion"),
  wamEffect("WAMDistoMachine", "Disto Machine", "Distortion"),
  wamEffect("WAMQuadraFuzz", "QuadraFuzz", "Distortion"),
  wamEffect("WAMVoxAmp", "Vox Amp 30", "Distortion"),
  // Modulation
  wamEffect("WAMStonePhaser", "Stone Phaser", "Modulation"),
  // Reverb & Delay
  wamEffect("WAMPingPongDelay", "Ping Pong Delay", "Reverb & Delay"),
  wamEffect("WAMFaustDelay", "Faust Delay", "Reverb & Delay"),
  // Pitch
  wamEffect("WAMPitchShifter", "Csound Pitch Shifter", "Pitch"),
  // EQ & Stereo
  wamEffect("WAMGraphicEQ", "Graphic Equalizer", "EQ & Stereo"),
  // Multi-FX
  wamEffect("WAMPedalboard", "Pedalboard", "Multi-FX")
]);
