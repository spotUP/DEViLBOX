const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
async function parseMIDIFile(file, options) {
  const { importMIDIFile } = await __vitePreload(async () => {
    const { importMIDIFile: importMIDIFile2 } = await import("./main-BbV5VyEH.js").then((n) => n.js);
    return { importMIDIFile: importMIDIFile2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const result = await importMIDIFile(file, {
    quantize: (options == null ? void 0 : options.quantize) ?? 1,
    velocityToVolume: (options == null ? void 0 : options.velocityToVolume) ?? true,
    defaultPatternLength: (options == null ? void 0 : options.defaultPatternLength) ?? 64
  });
  const order = result.patterns.map((_, i) => i);
  const maxChannels = result.patterns.reduce((max, p) => Math.max(max, p.channels.length), 1);
  return {
    name: result.metadata.name,
    format: "XM",
    patterns: result.patterns,
    instruments: result.instruments,
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: maxChannels,
    initialSpeed: 6,
    initialBPM: result.bpm
  };
}
export {
  parseMIDIFile
};
