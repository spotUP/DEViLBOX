import { a1 as useThemeStore } from "./main-BbV5VyEH.js";
function hexToDim(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.round(r * 0.2).toString(16).padStart(2, "0")}${Math.round(g * 0.2).toString(16).padStart(2, "0")}${Math.round(b * 0.2).toString(16).padStart(2, "0")}`;
}
function useInstrumentColors(brandColor, opts) {
  const isCyan = useThemeStore((s) => s.currentThemeId) === "cyan-lineart";
  const accent = isCyan ? "#00ffff" : brandColor;
  const knob = isCyan ? "#00ffff" : (opts == null ? void 0 : opts.knob) ?? brandColor;
  const dim = isCyan ? "#004444" : (opts == null ? void 0 : opts.dim) ?? hexToDim(brandColor);
  const panelBg = isCyan ? "bg-[#041510]" : "";
  const panelStyle = {
    backgroundColor: dim,
    borderColor: accent + "33"
    // 20% opacity hex suffix
  };
  return { isCyan, accent, knob, dim, panelBg, panelStyle };
}
export {
  useInstrumentColors as u
};
