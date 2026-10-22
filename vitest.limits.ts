import os from 'node:os';

// One CPU budget for every vitest config in the repo (root, server, tools/*).
//
// A worker cap alone did not keep the machine usable: each worker also runs
// native threads (WASM, node-web-audio-api render threads) that maxWorkers
// does not count, and the configs without a cap fell back to vitest's default
// of one worker per core. A run, or two hooks plus an agent at once, pinned
// every core and left the desktop unresponsive for the length of the run.
//
// So every config takes its worker count from here, and the vitest process
// drops to a low scheduling priority before it starts any worker. Workers are
// forked child processes and inherit the priority, native threads included,
// so interactive work always wins the CPU while tests only use what is idle.
// Priority, not a core limit: the tests still get every idle core, which keeps
// the offline-render timeouts meaningful.

// The lowest priority, as in the BMS repo: tests only ever get idle CPU.
const TEST_NICE = 19;
const DEFAULT_MAX_WORKERS = 2;

function lowerProcessPriority(): void {
  // vite.config.ts also feeds the dev server and the build; only a vitest run
  // (which sets VITEST before it loads a config) gets the low priority.
  if (!process.env.VITEST) return;
  try {
    if (os.getPriority(0) < TEST_NICE) os.setPriority(0, TEST_NICE);
  } catch {
    // A platform without setpriority keeps the default priority.
  }
}

/** Worker cap for a vitest config; VITEST_MAX_WORKERS overrides the default. */
export function testCpuLimits(): { maxWorkers: number } {
  lowerProcessPriority();
  const fromEnv = Number(process.env.VITEST_MAX_WORKERS);
  return { maxWorkers: fromEnv > 0 ? fromEnv : DEFAULT_MAX_WORKERS };
}
