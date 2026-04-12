import { bO as getDevilboxAudioContext } from "./main-BbV5VyEH.js";
let globalAudioContext = null;
let resumePromise = null;
function getAudioContext() {
  if (!globalAudioContext) {
    try {
      const shared = getDevilboxAudioContext();
      if (shared) {
        globalAudioContext = shared;
        console.log("[AudioContext] Using shared ToneEngine context");
        return globalAudioContext;
      }
    } catch {
    }
    globalAudioContext = new AudioContext();
    console.log("[AudioContext] Created standalone instance (ToneEngine not yet available)");
  }
  return globalAudioContext;
}
async function resumeAudioContext() {
  const context = getAudioContext();
  if (context.state === "suspended") {
    if (!resumePromise) {
      resumePromise = context.resume().then(() => {
        console.log("[AudioContext] Resumed");
        resumePromise = null;
      });
    }
    await resumePromise;
  }
}
const SAMPLE_CATEGORY_LABELS = {
  kicks: "Kicks",
  snares: "Snares",
  hihats: "Hi-Hats",
  claps: "Claps",
  percussion: "Percussion",
  fx: "FX",
  bass: "Bass",
  leads: "Leads",
  pads: "Pads",
  loops: "Loops",
  vocals: "Vocals",
  other: "Other"
};
export {
  SAMPLE_CATEGORY_LABELS as S,
  getAudioContext as g,
  resumeAudioContext as r
};
