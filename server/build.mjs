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
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const srcDir = join(root, 'src');
// SERVER_BUILD_OUT / SERVER_BUILD_SKIP_TSC let the build-output test emit into a temp dir
// without the slow type-check; the real build uses neither.
const outDir = process.env.SERVER_BUILD_OUT ? resolve(process.env.SERVER_BUILD_OUT) : join(root, 'dist');

if (!process.env.SERVER_BUILD_SKIP_TSC) {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', root, '--noEmit'], {
    stdio: 'inherit',
  });
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') && !p.endsWith('.d.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

const entryPoints = walk(srcDir);
// Only imports of files this build emits may stay external: they exist in dist at run time.
// Anything else under server/src (data such as JSON) is inlined, or dist would require a file
// it never wrote (the 2026-11-04 outage: '../data/hippo-playlists.json' crash-looped the backend).
const emitted = new Set(entryPoints);

const keepServerImportsExternal = {
  name: 'keep-server-imports-external',
  setup(b) {
    b.onResolve({ filter: /^\.\.?\// }, async (args) => {
      if (args.kind === 'entry-point' || args.pluginData === 'inner') return null;
      const r = await b.resolve(args.path, { resolveDir: args.resolveDir, kind: args.kind, pluginData: 'inner' });
      if (r.errors.length) return { errors: r.errors };
      if (emitted.has(r.path)) return { path: args.path, external: true };
      return null;
    });
  },
};

rmSync(outDir, { recursive: true, force: true });
await build({
  entryPoints,
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

// Every relative require in dist must resolve inside dist, or the server dies at start.
const missing = [];
for (const file of (function list(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? list(p) : p.endsWith('.js') ? [p] : [];
  });
})(outDir)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/require\((["'])(\.\.?\/[^"']+)\1\)/g)) {
    const target = resolve(dirname(file), m[2]);
    if (![target, `${target}.js`, join(target, 'index.js')].some((t) => existsSync(t))) {
      missing.push(`${file.slice(outDir.length + 1)} requires ${m[2]}`);
    }
  }
}
if (missing.length) {
  console.error(`server build: dist requires files it does not contain:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`server built: ${resolve(outDir)}`);
