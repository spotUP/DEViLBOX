// Server build: type-check, then emit dist/ with the same layout tsc used
// (dist/index.js, dist/routes/*.js ...), because the server resolves data and
// project paths relative to __dirname.
//
// Each server file is bundled on its own. Imports between server files and
// from node_modules stay external; only the shared leaf modules the server
// reaches in the frontend tree (../../../src/lib/...) are inlined, since that
// tree is not deployed with server/. Those leaves must stay free of app
// imports (src/lib/import/__tests__/serverImportsStayLeaf.test.ts).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
const outDir = join(root, 'dist');

execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', root, '--noEmit'], {
  stdio: 'inherit',
});

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') && !p.endsWith('.d.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

const keepServerImportsExternal = {
  name: 'keep-server-imports-external',
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, async (args) => {
      if (args.kind === 'entry-point' || args.pluginData === 'inner') return null;
      const r = await b.resolve(args.path, { resolveDir: args.resolveDir, kind: args.kind, pluginData: 'inner' });
      if (r.errors.length) return { errors: r.errors };
      if (r.path.startsWith(srcDir + sep)) return { path: args.path, external: true };
      return null;
    });
  },
};

rmSync(outDir, { recursive: true, force: true });
await build({
  entryPoints: walk(srcDir),
  outdir: outDir,
  outbase: srcDir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  // The tsconfig paths map bare packages into node_modules; esbuild would then
  // resolve (and inline) them before 'external' applies.
  tsconfigRaw: '{}',
  sourcemap: true,
  logLevel: 'warning',
  plugins: [keepServerImportsExternal],
});
console.log(`server built: ${resolve(outDir)}`);
