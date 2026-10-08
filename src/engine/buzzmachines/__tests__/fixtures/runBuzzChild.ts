/**
 * Runs fixtures/runBuzzMachine.cjs in a child process and tells a real hang
 * from a starved child.
 *
 * A wall-clock timeout cannot: the child needs ~0.1 s of CPU, but under the
 * full pre-push suite (load average 140 on 8 cores) it can wait tens of seconds
 * to be scheduled. 2026-10-08: with 24 children and 16 busy loops, two of 24
 * finished printing their result and were still killed at 20 s. A machine that
 * hangs spins in a loop and burns CPU without end, so the budget is CPU time
 * (read from ps), which scheduling delay does not change. A wall-clock backstop
 * stays for a child that blocks without spinning (see --single-threaded below).
 */
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export const RUNNER = resolve(__dirname, 'runBuzzMachine.cjs');
/** A healthy run measures about 0.1 s of CPU; a hang spins forever. */
export const CPU_BUDGET_S = 10;
/** Backstop for a child that blocks without using CPU. */
export const WALL_BACKSTOP_MS = 120_000;

/** ps TIME: [[dd-]hh:]mm:ss[.ff] -> seconds. */
export function parsePsTime(t: string): number {
  const [days, rest] = t.includes('-') ? t.trim().split('-') : ['0', t.trim()];
  return rest.split(':').reduce((acc, p) => acc * 60 + parseFloat(p), 0) + Number(days) * 86400;
}

function cpuSeconds(pid: number): number | null {
  try {
    return parsePsTime(execFileSync('ps', ['-o', 'time=', '-p', String(pid)], { encoding: 'utf8' }));
  } catch { return null; }
}

export interface BuzzChildResult { stdout: string; stderr: string; hung: 'cpu' | 'wall' | null; cpuSeconds: number }

export function runBuzzChild(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<BuzzChildResult> {
  return new Promise((done) => {
    // --single-threaded: node's process.exit() can deadlock at shutdown. The main thread
    // joins V8's worker threads (NodePlatform::Shutdown) while a worker waits for a GC the
    // exiting main thread will never run (sampled with `sample`: a concurrent baseline
    // compile in AwaitCollectionBackground). The child had printed its result and sat there
    // with 0.05 s of CPU: 9 of 120 children under load, 0 of 120 with this flag. With no
    // worker threads there is nothing to join.
    const child = spawn(process.execPath, ['--single-threaded', RUNNER, ...args], { env });
    let stdout = '', stderr = '', hung: BuzzChildResult['hung'] = null, cpu = 0;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const started = Date.now();
    const poll = setInterval(() => {
      const c = child.pid ? cpuSeconds(child.pid) : null;
      if (c !== null) cpu = Math.max(cpu, c);
      if (!hung && cpu > CPU_BUDGET_S) hung = 'cpu';
      else if (!hung && Date.now() - started > WALL_BACKSTOP_MS) hung = 'wall';
      if (hung) child.kill('SIGKILL');
    }, 250);
    child.on('close', () => { clearInterval(poll); done({ stdout, stderr, hung, cpuSeconds: cpu }); });
  });
}

export function lastJsonLine(stdout: string): string | undefined {
  return stdout.split('\n').reverse().find((l) => l.startsWith('{'));
}
