import { MaEngine } from "./MaEngine-E1EHjQty.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
async function exportAsMusicAssembler(song) {
  const warnings = [];
  if (MaEngine.hasInstance()) {
    const engine = MaEngine.getInstance();
    try {
      const buf = await engine.save();
      if (buf.length > 0) {
        const data2 = new Blob([buf.buffer], { type: "application/octet-stream" });
        const baseName2 = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
        return { data: data2, filename: `${baseName2}.ma`, warnings };
      }
      warnings.push("WASM save returned empty data. Falling back to original file.");
    } catch (e) {
      warnings.push(`WASM save failed: ${e.message}. Falling back to original data.`);
    }
  }
  const fileData = song.maFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error("No Music Assembler file data available for export");
  }
  warnings.push("Engine not running — exports original file without in-session edits.");
  const data = new Blob([fileData], { type: "application/octet-stream" });
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  return { data, filename: `${baseName}.ma`, warnings };
}
export {
  exportAsMusicAssembler
};
