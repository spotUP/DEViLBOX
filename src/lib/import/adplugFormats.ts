/**
 * Extensions the AdPlug WASM engine plays (from adplug.cpp's player registry).
 * Its own module: the parser used to import the whole UnifiedFileLoader to
 * read this one list, which put the app's largest module graph into every
 * parse (a cold parseModuleToSong spent 30-40 s importing in tests).
 * Removed on purpose: m (too broad), mus/ims/ksm/raw/sng (UADE/GoatTracker).
 */
const ADPLUG_WASM_EXTS = /\.(adl|agd|a2m|a2t|amd|bam|bmf|cff|cmf|d00|dfm|dmo|dro|dtm|got|ha2|hsc|hsp|hsq|imf|jbm|laa|lds|mad|mdi|mkf|mkj|msc|mtk|mtr|mdy|pis|plx|rac|rad|rix|rol|sa2|sat|sci|sdb|sop|sqx|xad|xms|xsm|edl|dtl|as3m|adlib|wlf)$/i;

export function isAdPlugWasmFormat(filename: string): boolean {
  return ADPLUG_WASM_EXTS.test(filename);
}
