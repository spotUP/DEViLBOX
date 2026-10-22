// Makes node-web-audio-api's OfflineAudioContext pre-render check event-driven.
//
// Upstream (v2.2.0, js/AudioWorklet.js) kCheckProcessorsCreated polls
// `setTimeout(r, 0)` until every 'processor-created' ack has arrived. A test
// that fakes setTimeout (src/test/audio/dubBusRig.ts) then never reaches the
// native startRendering. This resolves the check when the last ack arrives.
// Idempotent; exits non-zero if the upstream text no longer matches.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = 'node_modules/node-web-audio-api/js/AudioWorklet.js';
const MARK = '/* devilbox-patch: event-driven processor check */';
if (!existsSync(file)) { console.log('[patch-node-web-audio] package not installed - skipping'); process.exit(0); }
let src = readFileSync(file, 'utf8');
if (src.includes(MARK)) { console.log('[patch-node-web-audio] already patched'); process.exit(0); }

const A_OLD = `            this.#pendingCreateProcessors.delete(id);
            break;`;
const A_NEW = `            this.#pendingCreateProcessors.delete(id);
            ${MARK}
            if (this.#pendingCreateProcessors.size === 0) {
              const waiters = this.#processorsCreatedWaiters;
              this.#processorsCreatedWaiters = [];
              waiters.forEach(w => w());
            }
            break;`;
const B_OLD = `  async [kCheckProcessorsCreated]() {
    return new Promise(async resolve => {
      while (this.#pendingCreateProcessors.size !== 0) {
        // we need a macro-task to ensure message can be received
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      resolve();
    });
  }`;
const B_NEW = `  async [kCheckProcessorsCreated]() {
    if (this.#pendingCreateProcessors.size === 0) return;
    return new Promise(resolve => { this.#processorsCreatedWaiters.push(resolve); });
  }`;
const C_OLD = `  #pendingCreateProcessors = new Set();`;
const C_NEW = `  #pendingCreateProcessors = new Set();\n  #processorsCreatedWaiters = [];`;

for (const [name, old] of [['ack handler', A_OLD], ['check', B_OLD], ['field', C_OLD]]) {
  if (src.split(old).length !== 2) {
    console.error(`[patch-node-web-audio] ERROR: upstream ${name} text not found exactly once in ${file}; update the patch`);
    process.exit(1);
  }
}
src = src.replace(A_OLD, () => A_NEW).replace(B_OLD, () => B_NEW).replace(C_OLD, () => C_NEW);
writeFileSync(file, src);
console.log('[patch-node-web-audio] patched AudioWorklet.js');
