// Headless check, SNES Terrific Audio Driver route (.fur -> TAD player .sfc -> Mesen2 S-DSP KON tap vs Furnace CLI NOTE_ON).
// The check itself is src/lib/export/tad/__tests__/snesRomCheck.test.ts (vitest: the TAD build imports a Vite `?raw` asset).
// Usage: nice -n 19 npx tsx tools/snes-rom-check.ts [--only <name>] [--failed] [--seconds N] [--diag]
// Results: test-data/snes-rom-check.json (resumable: songs whose input hash matches a recorded verdict are skipped).
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const env = { ...process.env, SNES_ROM_CHECK: '1', SNES_ONLY: arg('--only') ?? '', SNES_FAILED: args.includes('--failed') ? '1' : '', SNES_SECONDS: arg('--seconds') ?? '20', SNES_DIAG: args.includes('--diag') ? '1' : '' };
const r = spawnSync('npx', ['vitest', 'run', 'src/lib/export/tad/__tests__/snesRomCheck.test.ts', '--maxWorkers=1'], { cwd: path.resolve(import.meta.dirname, '..'), env, stdio: 'inherit' });
process.exit(r.status ?? 1);
