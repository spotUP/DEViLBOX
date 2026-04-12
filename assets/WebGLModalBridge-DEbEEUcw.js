import { a as reactExports } from "./vendor-ui-AJ7AT9BN.js";
import { a as useUIStore } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const WebGLModalBridge = () => {
  const dialogOpen = useUIStore((s) => s.dialogOpen);
  const closeDialogCommand = useUIStore((s) => s.closeDialogCommand);
  const openModal = useUIStore((s) => s.openModal);
  reactExports.useEffect(() => {
    if (!dialogOpen) return;
    switch (dialogOpen) {
      case "interpolate-volume":
      case "interpolate-effect":
        openModal("interpolate");
        break;
      case "humanize":
        openModal("humanize");
        break;
      case "find-replace":
        openModal("findReplace");
        break;
      case "groove-settings":
        openModal("grooveSettings");
        break;
      case "scale-volume-block":
        openModal("scaleVolume", { scope: "block" });
        break;
      case "scale-volume-track":
        openModal("scaleVolume", { scope: "track" });
        break;
      case "scale-volume-pattern":
        openModal("scaleVolume", { scope: "pattern" });
        break;
      case "keyboard-help":
        openModal("shortcutSheet");
        break;
      case "advanced-edit":
        openModal("advancedEdit");
        break;
      case "fade-volume":
        openModal("fadeVolume");
        break;
      case "strum":
        openModal("strum");
        break;
      case "effect-picker":
        openModal("effectPicker");
        break;
      case "undo-history":
        openModal("undoHistory");
        break;
      case "automation":
        openModal("automation");
        break;
      case "collaboration":
        openModal("collaboration");
        break;
      case "randomize":
        openModal("randomize");
        break;
      case "acid-pattern":
        openModal("acidPattern");
        break;
      case "pattern-length":
        openModal("patternLength");
        break;
    }
    closeDialogCommand();
  }, [dialogOpen, closeDialogCommand, openModal]);
  return null;
};
export {
  WebGLModalBridge
};
