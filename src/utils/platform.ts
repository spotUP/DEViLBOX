/** Detect iOS (iPhone/iPad/iPod) — cached at module load */
export const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

/** Detect any mobile device */
export const isMobileDevice = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
