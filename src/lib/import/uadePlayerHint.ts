/**
 * The filename UADE is given picks its eagleplayer (eagleplayer.conf is keyed
 * by prefix/extension). A few extensions name a format whose player UADE
 * files under another name:
 *
 *   .soc  Jochen Hippel Atari ST COSO. The `soc` name reaches UADE's Amiga
 *         Hippel-COSO player, which renders silence; the Wanted Team
 *         `Jochen_Hippel_ST` player (prefix `hst`) plays COSO-for-ST songs.
 *         Measured over the 96 corpus .soc: 80 audible as `x.hst`
 *         (thoughts/shared/research/2026-10-05_hippel-st-replayer.md, R1).
 *
 *   sdata.<tune>  MusicMaker 4V song in PREFIX form. UADE's MusicMaker4
 *         player refuses it ("module check failed", app error "UADE could not
 *         play: sdata.moveback"); as `<tune>.sdata` with `<tune>.i` beside it
 *         it plays (moveback, rms 0.070). The routing hands over the prefix
 *         form, so the name is mapped back to the extension form here.
 *
 * Every UADE load in the app (UADEEngine.load) and in the headless tools
 * (uadeRenderCore) passes its name through here, so the browser and the
 * sweep ask UADE the same question.
 */
const RENAMES: ReadonlyArray<[RegExp, string]> = [
  [/\.soc$/i, '.hst'],
];

const PREFIX_TO_EXTENSION: ReadonlyArray<RegExp> = [/^sdata\.(.+)$/i];

export function uadePlayerHint(filename: string): string {
  const slash = filename.lastIndexOf('/') + 1;
  for (const re of PREFIX_TO_EXTENSION) {
    const m = re.exec(filename.slice(slash));
    if (m) return `${filename.slice(0, slash)}${m[1]}.sdata`;
  }
  for (const [re, ext] of RENAMES) if (re.test(filename)) return filename.replace(re, ext);
  return filename;
}
