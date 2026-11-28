/**
 * The frame loop of an offscreen-canvas worker that sleeps while idle.
 *
 * `step` draws one frame and returns true while the picture still changes
 * without a message (moving clock, tween, pending draw). When it returns false
 * no frame is requested until `wake()`, which every incoming message calls, so
 * an idle worker gets no 60 Hz wake-ups at all (APP-IDLE-CPU item 3).
 */
export function createWorkerFrameLoop(
  step: (now: number) => boolean,
  raf: (cb: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb),
): { wake: () => void; isArmed: () => boolean } {
  let armed = false;
  const tick = (now: number) => {
    armed = false;
    if (step(now)) arm();
  };
  const arm = () => {
    if (armed) return;
    armed = true;
    raf(tick);
  };
  return { wake: arm, isArmed: () => armed };
}
