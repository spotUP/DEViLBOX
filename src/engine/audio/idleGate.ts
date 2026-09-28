/**
 * Install public/worklets/idle-gate.js as the audio context's first worklet
 * module, and make every later addModule on the context wait for it.
 *
 * The gate wraps registerProcessor, so it only reaches processors registered
 * after it evaluated. Effects add their modules at different moments (boot,
 * first dub use, a preset), and concurrent addModule calls may evaluate in
 * any order, so ordering is enforced here, once, rather than in every loader.
 */

let gateReady: Promise<void> | null = null;

export function installIdleGate(ctx: AudioContext): Promise<void> {
  if (gateReady) return gateReady;
  const worklet = ctx.audioWorklet;
  const addModule = worklet.addModule.bind(worklet);
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  gateReady = addModule(`${base}worklets/idle-gate.js`).catch(() => { /* ungated audio still plays */ });
  const ready = gateReady;
  worklet.addModule = (url: string | URL, options?: WorkletOptions) =>
    ready.then(() => addModule(url, options));
  return gateReady;
}
