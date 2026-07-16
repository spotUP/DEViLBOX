/**
 * stereoSeparationPolicy — pure decision for the PT2-mode post-mix separation node.
 *
 * In PT2 ("Amiga clone") stereo mode the replayer normally separates by scaling
 * each channel's pan node toward centre. That only works for songs whose audio
 * flows through the per-channel Tone panners. Pre-mixed NATIVE output — libopenmpt
 * AND direct-routed native engines (UADE / Hively / SunTronic / …) whose finished
 * stereo is fed straight into `StereoSeparationNode.inputTone` — never touches those
 * panners, so the pan-scaling loop is a no-op and the slider appears to do nothing.
 * For those the post-mix `StereoSeparationNode` must do the work instead.
 *
 * Extracted as a pure function so the routing decision is unit-testable without
 * standing up Tone.js / WASM. Returns the 0-200 value to hand `setSeparation`.
 */
export function resolvePt2NodeSeparation(
  stereoSeparation: number,   // user 0-100
  useLibopenmptPlayback: boolean,
  nativeRoutedCount: number,  // TrackerReplayer.routedNativeEngines.size
): number {
  // Pre-mixed native path → drive the node (0-100 → 0-200 scale).
  if (useLibopenmptPlayback || nativeRoutedCount > 0) {
    return stereoSeparation * 2;
  }
  // Pure-Tone song → identity; per-channel pan scaling already separated it, so
  // driving the node too would double-narrow.
  return 100;
}
