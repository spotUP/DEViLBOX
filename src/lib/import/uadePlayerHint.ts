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
 * Every UADE load in the app (UADEEngine.load) and in the headless tools
 * (uadeRenderCore) passes its name through here, so the browser and the
 * sweep ask UADE the same question.
 */
const RENAMES: ReadonlyArray<[RegExp, string]> = [
  [/\.soc$/i, '.hst'],
];

export function uadePlayerHint(filename: string): string {
  for (const [re, ext] of RENAMES) if (re.test(filename)) return filename.replace(re, ext);
  return filename;
}
