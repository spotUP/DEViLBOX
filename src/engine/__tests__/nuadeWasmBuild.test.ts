/**
 * NV-2 / NV-3 / NV-4: nuade-wasm builds public/nuade/Nuade.{js,wasm} from the pristine third-party/nuade tree, the
 * shim exports the whole nw_* surface (edit slot included), and the committed binary renders like a native build.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NuadeHeadless, NUADE_CAP_STATE_READ, NUADE_CAP_CELL_WRITE } from '../nuade/nuadeHeadless';

const ROOT = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

describe('NV-2 nuade-wasm build files', () => {
  it('CMake builds every upstream player into Nuade.{js,wasm} as the createNuade module', () => {
    const cmake = read('nuade-wasm/CMakeLists.txt');
    expect(cmake).toContain('add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../third-party/nuade');
    expect(cmake).toContain('NUADE_PLAYERS "all"');
    expect(cmake).toContain('EXPORT_NAME=createNuade');
    expect(cmake).toContain('FILESYSTEM=0');
    expect(cmake).toContain('ALLOW_MEMORY_GROWTH=1');
    expect(cmake).toContain('src/nuade_wasm.c');
  });

  it('build.sh runs emcmake, applies patches to a scratch copy only, and the build dir is gitignored', () => {
    const sh = read('nuade-wasm/build.sh');
    expect(sh).toContain('emcmake cmake');
    expect(sh).toMatch(/patches\/\*\.patch/);
    expect(sh).toMatch(/cp -R "\$HERE\/\.\.\/third-party\/nuade"/);
    expect(statSync(join(ROOT, 'nuade-wasm/build.sh')).mode & 0o111).not.toBe(0);
    expect(read('.gitignore')).toMatch(/^nuade-wasm\/build\/$/m);
  });
});

describe('NV-3 shim exports', () => {
  it('the CMake export list names every nw_* function the shim defines, and nothing else', () => {
    const c = read('nuade-wasm/src/nuade_wasm.c');
    const defined = [...c.matchAll(/EMSCRIPTEN_KEEPALIVE\s+[\w\s*]+?\b(nw_\w+)\s*\(/g)].map((m) => `_${m[1]}`).sort();
    const exported = (read('nuade-wasm/CMakeLists.txt').match(/EXPORTED_FUNCS "([^"]+)"/)![1]!.split(',')).filter((f) => f.startsWith('_nw_')).sort();
    expect(defined.length).toBeGreaterThan(30);
    expect(exported).toEqual(defined);
  });

  it('the edit slot is probed and unwritten: state readable, cell and instrument writes return -ENOSYS', async () => {
    const nu = await NuadeHeadless.create();
    expect(nu.m._nw_caps()).toBe(0); // no song: nothing to read
    nu.open(readFileSync(join(ROOT, 'public/data/songs/formats/antidust.bp3')), 'antidust.bp3', 'soundmon');
    expect(nu.caps & NUADE_CAP_STATE_READ).toBe(NUADE_CAP_STATE_READ);
    expect(nu.caps & NUADE_CAP_CELL_WRITE).toBe(0);
    expect(nu.m._nw_cell_write(0, 0, 0, 0, 0)).toBe(-52);
    expect(nu.m._nw_instrument_write(0, 0, 0)).toBe(-52);
    expect(nu.m._nw_state_size()).toBeGreaterThan(0);
    expect(nu.m._nw_state_read(0, nu.m._nw_state_size() + 1, nu.m._malloc(8))).toBe(-1);
    nu.close();
  });
});

describe('NV-4 committed binary', () => {
  it('is at most 2.5 MB and plays all 121 upstream players', async () => {
    expect(statSync(join(ROOT, 'public/nuade/Nuade.wasm')).size).toBeLessThanOrEqual(2.5 * 1024 * 1024);
    expect(existsSync(join(ROOT, 'public/nuade/Nuade.js'))).toBe(true);
    const nu = await NuadeHeadless.create();
    expect(nu.playerIds().length).toBe(121);
  });

  it('renders antidust.bp3 byte-identical to the native build of the same pin (20 s, 1024-frame blocks, 48 kHz)', async () => {
    const nu = await NuadeHeadless.create(48000);
    nu.open(readFileSync(join(ROOT, 'public/data/songs/formats/antidust.bp3')), 'antidust.bp3', '');
    expect(nu.playerId).toBe('soundmon');
    expect(nu.start(nu.defaultSubsong)).toBe(true);
    const hash = createHash('sha256');
    for (let i = 0; i < 938; i++) hash.update(Buffer.from(nu.render(1024).stereo.buffer));
    nu.close();
    // sha256 of scratchpad/ab/antidust.bp3.raw, the research's native (cmake, clang) render of the pinned tree.
    expect(hash.digest('hex')).toBe('250f2d293b35054c77d6bb5c3dd24540186c6538b7cbc5af7b83fa48034eb539');
  });
});
