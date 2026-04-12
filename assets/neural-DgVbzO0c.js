const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { bM as EffectRegistry, am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const neuralEffect = {
  id: "Neural",
  name: "Neural Amp Model",
  category: "neural",
  group: "Distortion",
  description: "AI-modeled guitar amp and pedal tones",
  loadMode: "lazy",
  create: async (c) => {
    const { NeuralEffectWrapper } = await __vitePreload(async () => {
      const { NeuralEffectWrapper: NeuralEffectWrapper2 } = await import("./main-BbV5VyEH.js").then((n) => n.iS);
      return { NeuralEffectWrapper: NeuralEffectWrapper2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const { GUITARML_MODEL_REGISTRY } = await __vitePreload(async () => {
      const { GUITARML_MODEL_REGISTRY: GUITARML_MODEL_REGISTRY2 } = await import("./guitarMLRegistry-CdfjBfrw.js");
      return { GUITARML_MODEL_REGISTRY: GUITARML_MODEL_REGISTRY2 };
    }, true ? [] : void 0);
    if (c.neuralModelIndex === void 0) {
      throw new Error("Neural effect requires neuralModelIndex");
    }
    const wrapper = new NeuralEffectWrapper({
      modelIndex: c.neuralModelIndex,
      wet: c.wet / 100
    });
    await wrapper.loadModel();
    Object.entries(c.parameters).forEach(([key, value]) => {
      wrapper.setParameter(key, value);
    });
    if (Object.keys(c.parameters).length === 0) {
      const { getModelCharacteristicDefaults } = await __vitePreload(async () => {
        const { getModelCharacteristicDefaults: getModelCharacteristicDefaults2 } = await import("./guitarMLRegistry-CdfjBfrw.js");
        return { getModelCharacteristicDefaults: getModelCharacteristicDefaults2 };
      }, true ? [] : void 0);
      const modelInfo = GUITARML_MODEL_REGISTRY.find((m) => m.index === c.neuralModelIndex);
      if (modelInfo) {
        const defaults = getModelCharacteristicDefaults(modelInfo.characteristics.gain, modelInfo.characteristics.tone);
        Object.entries(defaults).forEach(([key, value]) => wrapper.setParameter(key, value));
      }
    }
    return wrapper;
  },
  getDefaultParameters: () => ({})
};
EffectRegistry.register(neuralEffect);
