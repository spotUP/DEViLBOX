/**
 * kill-own-vite.cjs — Kill only Vite processes owned by THIS project.
 *
 * The old `pkill -f 'node.*vite'` killed ALL Vite processes system-wide,
 * including those from other projects. This script checks each process's
 * working directory and only kills if it's under this project's root.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

try {
  const raw = execSync('lsof -ti tcp:5173 2>/dev/null', { encoding: 'utf8' }).trim();
  if (!raw) process.exit(0);

  for (const pidStr of raw.split('\n')) {
    const pid = parseInt(pidStr, 10);
    if (!pid || isNaN(pid)) continue;

    try {
      const lsofOut = execSync(`lsof -p ${pid} 2>/dev/null`, { encoding: 'utf8' });
      // lsof cwd line format: COMMAND PID USER FD TYPE DEVICE SIZE NODE /path
      const cwdLine = lsofOut.split('\n').find(l => /\bcwd\b/.test(l));
      const cwd = cwdLine ? (cwdLine.match(/(\/\S+)\s*$/) || [])[1] || '' : '';

      if (cwd.startsWith(projectRoot)) {
        console.log(`[kill-own-vite] Killing DEViLBOX vite (PID: ${pid}, cwd: ${cwd})`);
        process.kill(pid, 'SIGKILL');
      } else {
        console.log(`[kill-own-vite] Skipping non-DEViLBOX process (PID: ${pid}, cwd: ${cwd || 'unknown'})`);
      }
    } catch {
      // Process may have exited between lsof calls
    }
  }
} catch {
  // No process on port 5173 — nothing to do
}
