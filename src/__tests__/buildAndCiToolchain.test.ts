/**
 * Guards for two CI-only breakages that the local gate could not see.
 *
 * 1. `vite build` failed with `Invalid value "iife" for option "worker.format"
 *    - UMD and IIFE output formats are not supported for code-splitting builds`
 *    once a worker graph reached a dynamic import() (songWalk.worker.ts ->
 *    songWalkClient -> import('./fpWalk') ...). Vite defaults worker.format to
 *    'iife'; the app's workers are all module workers, so the config must say
 *    'es'. The full production build takes ~4 min, too long for the pre-push
 *    gate, so this pins the config value instead.
 *
 * 2. CI ran Node 20, which cannot load a `.ts` file in a worker_threads Worker
 *    ("Unknown file extension .ts"); the render-worker tests passed locally on
 *    Node 24. Every workflow now takes its Node from .nvmrc, which must be a
 *    version that strips TypeScript types natively.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');

describe('production build', () => {
  it('emits module workers, so a worker whose graph code-splits still builds', () => {
    // Read as text: importing vite.config.ts runs its plugin factories
    // (version.json generation) as a side effect.
    const text = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(text).toMatch(/\n  worker:\s*\{[^}]*\bformat:\s*'es'/);
  });
});

describe('CI toolchain', () => {
  const workflowsDir = join(ROOT, '.github/workflows');
  const workflows = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));

  it('every workflow takes its Node version from .nvmrc, never a hard-coded one', () => {
    for (const wf of workflows) {
      const text = readFileSync(join(workflowsDir, wf), 'utf8');
      expect(text, wf).not.toMatch(/node-version:\s/);
      if (text.includes('actions/setup-node')) {
        expect(text, wf).toMatch(/node-version-file:\s*'\.nvmrc'/);
      }
    }
  });

  it('.nvmrc names a Node that loads .ts files in worker threads (type stripping, >= 22.18)', () => {
    const v = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
    const [major, minor = 0] = v.split('.').map(Number);
    expect(major > 22 || (major === 22 && minor >= 18)).toBe(true);
  });

  it('the heavy offline-render suites run nightly, not on every push', () => {
    const heavy = JSON.parse(readFileSync(join(ROOT, 'tools/test-tiers/heavy.json'), 'utf8')) as { files: { file: string }[] };
    expect(heavy.files.length).toBeGreaterThan(0);
    for (const { file } of heavy.files) expect(existsSync(join(ROOT, file)), file).toBe(true);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:ci']).toMatch(/^VITEST_TIER=fast /);
    expect(pkg.scripts['test:heavy']).toMatch(/^VITEST_TIER=heavy /);
    expect(readFileSync(join(ROOT, '.github/workflows/nightly.yml'), 'utf8')).toContain('npm run test:heavy');
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toContain("testTier === 'fast' ? heavyTestFiles");
  });
});


describe('NV-5 nuade workflow', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/nuade.yml'), 'utf8');

  it('triggers on the vendored tree, our shim and both artifacts', () => {
    for (const path of ['third-party/nuade/**', 'nuade-wasm/**', 'public/nuade/Nuade.wasm', 'public/nuade/Nuade.js', '.github/workflows/nuade.yml']) {
      expect(text, path).toContain(`- '${path}'`);
    }
  });

  it('rebuilds with nuade-wasm/build.sh and fails when the sources changed without Nuade.wasm', () => {
    expect(text).toContain('nuade-wasm/build.sh');
    expect(text).toContain('~/emsdk/emsdk install latest');
    expect(text).toMatch(/grep -qE '\^\(third-party\/nuade\|nuade-wasm\)\/'/);
    expect(text).toContain("grep -qx 'public/nuade/Nuade.wasm'");
    expect(text).toContain('exit 1');
  });

  it('the build command it runs exists and is executable', () => {
    expect(existsSync(join(ROOT, 'nuade-wasm/build.sh'))).toBe(true);
  });
});

describe('CI checkout depth', () => {
  // A depth-1 checkout made `git rev-list --count HEAD` return 1, so the live
  // version.json said buildNumber "1" and the changelog held one commit.
  const workflowsDir = join(ROOT, '.github/workflows');
  const jobs = readdirSync(workflowsDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((wf) =>
      readFileSync(join(workflowsDir, wf), 'utf8')
        .split(/^(?=  [a-z-]+:$)/m)
        .filter((body) => /^  [a-z-]+:\n/.test(body))
        .map((body) => ({ name: `${wf} ${body.split('\n')[0].trim()}`, body })),
    );

  it('every job that runs the production build checks out the full commit history', () => {
    const building = jobs.filter((j) => j.body.includes('npm run build'));
    expect(building.length).toBeGreaterThan(0);
    for (const j of building) {
      const checkouts = j.body.match(/uses: actions\/checkout@v\d+\n(?:\s+with:\n(?:\s{10}.*\n)*)?/g) ?? [];
      expect(checkouts.length, j.name).toBeGreaterThan(0);
      for (const c of checkouts) expect(c, j.name).toMatch(/fetch-depth: 0/);
    }
  });
});

describe('backend image ships with every deploy', () => {
  // The webhook deploy only rsynced the web build, so the live backend stayed
  // on a hand-built image and never got new server code (the free AI provider).
  const deploy = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
  const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  const setup = readFileSync(join(ROOT, 'scripts/server-setup.sh'), 'utf8');
  const TAG = 'devilbox-backend:latest';
  const ASSET = 'devilbox-backend.tar.gz';

  it('CI builds the image, saves it and releases it beside the web build', () => {
    expect(deploy).toContain(`docker build -f Dockerfile.backend -t ${TAG} .`);
    expect(deploy).toContain(`docker save ${TAG} | gzip > ${ASSET}`);
    expect(deploy).toMatch(/needs: \[[^\]]*backend-image[^\]]*\]/);
    expect(deploy).toMatch(/name: backend-image\n\s+path: release-assets\//);
  });

  it('compose runs that tag and the deploy script loads it without a build', () => {
    expect(compose).toContain(`image: ${TAG}`);
    const script = setup.slice(setup.indexOf("<< 'DEPLOY_SCRIPT'"), setup.indexOf('\nDEPLOY_SCRIPT\n'));
    expect(script).toContain(`releases/download/\${RELEASE_TAG}/${ASSET}`);
    expect(script).toContain('docker load');
    expect(script).toMatch(/docker compose .*up -d --no-build backend/);
  });
});
