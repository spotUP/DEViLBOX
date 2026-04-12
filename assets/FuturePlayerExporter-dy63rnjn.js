const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css"])))=>i.map(i=>d[i]);
import { am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function findEdits(shadowVoices, song) {
  const edits = [];
  for (let voice = 0; voice < Math.min(4, shadowVoices.length); voice++) {
    const shadowCells = shadowVoices[voice];
    let linearRow = 0;
    for (let ordIdx = 0; ordIdx < song.songLength; ordIdx++) {
      const patIdx = song.songPositions[ordIdx] ?? 0;
      const pat = song.patterns[patIdx];
      const channel = pat == null ? void 0 : pat.channels[voice];
      const numRows = (pat == null ? void 0 : pat.length) ?? 64;
      for (let row = 0; row < numRows; row++) {
        if (linearRow >= shadowCells.length) break;
        const shadowCell = shadowCells[linearRow];
        const songCell = channel == null ? void 0 : channel.rows[row];
        const songNote = (songCell == null ? void 0 : songCell.note) ?? 0;
        const songInstr = (songCell == null ? void 0 : songCell.instrument) ?? 0;
        const songEffTyp = (songCell == null ? void 0 : songCell.effTyp) ?? 0;
        const songEff = (songCell == null ? void 0 : songCell.eff) ?? 0;
        if (shadowCell.note !== songNote || shadowCell.instrument !== songInstr || shadowCell.effect !== songEffTyp || shadowCell.param !== songEff) {
          edits.push({
            voice,
            row: linearRow,
            note: shadowCell.note,
            instrument: shadowCell.instrument,
            effect: shadowCell.effect,
            param: shadowCell.param
          });
        }
        linearRow++;
      }
    }
    for (let r = linearRow; r < shadowCells.length; r++) {
      const cell = shadowCells[r];
      if (cell.note !== 0 || cell.instrument !== 0 || cell.effect !== 0 || cell.param !== 0) {
        edits.push({
          voice,
          row: r,
          note: cell.note,
          instrument: cell.instrument,
          effect: cell.effect,
          param: cell.param
        });
      }
    }
  }
  return edits;
}
async function exportAsFuturePlayer(song) {
  const warnings = [];
  const fileData = song.futurePlayerFileData;
  if (!fileData || fileData.byteLength === 0) {
    throw new Error("No FuturePlayer file data available for export");
  }
  const baseName = (song.name || "untitled").replace(/[^a-zA-Z0-9_-]/g, "_");
  const binaryBlob = new Blob([fileData], { type: "application/octet-stream" });
  try {
    const { FuturePlayerEngine } = await __vitePreload(async () => {
      const { FuturePlayerEngine: FuturePlayerEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iM);
      return { FuturePlayerEngine: FuturePlayerEngine2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    if (FuturePlayerEngine.hasInstance()) {
      const engine = FuturePlayerEngine.getInstance();
      const shadowVoices = await engine.getShadowData();
      if (shadowVoices && shadowVoices.length > 0) {
        const edits = findEdits(shadowVoices, song);
        if (edits.length > 0) {
          const sidecarData = {
            format: "FuturePlayer",
            version: 1,
            description: "In-session pattern edits for FuturePlayer module. Apply these edits to the shadow array after loading the original binary.",
            editCount: edits.length,
            edits,
            // Also include the full shadow array for complete state
            shadowVoices: shadowVoices.map((cells, voice) => ({
              voice,
              length: cells.length,
              cells
            }))
          };
          const sidecarJson = JSON.stringify(sidecarData, null, 2);
          const sidecarBlob = new Blob([sidecarJson], { type: "application/json" });
          warnings.push(`${edits.length} pattern edit(s) saved to sidecar JSON file.`);
          warnings.push("Load the original .fp file, then apply edits from the .edits.json sidecar.");
          return {
            data: binaryBlob,
            filename: `${baseName}.fp`,
            warnings,
            sidecar: {
              data: sidecarBlob,
              filename: `${baseName}.fp.edits.json`
            }
          };
        } else {
          warnings.push("No pattern edits detected — exporting original file.");
        }
      }
    }
  } catch {
  }
  warnings.push("Exports original file — in-session edits could not be read from engine.");
  return { data: binaryBlob, filename: `${baseName}.fp`, warnings };
}
export {
  exportAsFuturePlayer
};
