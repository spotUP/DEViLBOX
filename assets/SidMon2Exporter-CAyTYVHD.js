import { Sd2Engine } from "./Sd2Engine-BgIHLVPo.js";
import "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
async function exportSidMon2File(song) {
  if (Sd2Engine.hasInstance()) {
    const engine = Sd2Engine.getInstance();
    const data = await engine.save();
    if (data && data.byteLength > 0) {
      return data;
    }
  }
  if (song.sd2FileData) {
    return song.sd2FileData;
  }
  throw new Error("SidMon II export requires either a running Sd2Engine or stored file data");
}
export {
  exportSidMon2File
};
