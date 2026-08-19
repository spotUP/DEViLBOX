/**
 * audiodeviceSafety.test.ts — runs the fake audio.device memory-safety harness.
 *
 * The harness (uade-wasm/tests/) compiles third-party/uade-3.05/src/audiodevice.c under
 * AddressSanitizer + UBSan with -fno-sanitize-recover=all and drives its three entry
 * points with the values a malformed player produces: a unit with no channel bit, an
 * out-of-range io_Command, a bogus request address, a 256 MB ioa_Length, and a cyclic
 * reply chain.
 *
 * Verified to discriminate: all six cases FAIL against the pre-fix audiodevice.c
 * (five sanitizer aborts plus one timeout from the unbounded reply-list walk) and pass
 * against the current one. Point the script at any revision to re-check:
 *
 *   git show <rev>:third-party/uade-3.05/src/audiodevice.c > /tmp/old.c
 *   uade-wasm/tests/run_audiodevice_tests.sh /tmp/old.c
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'uade-wasm/tests/run_audiodevice_tests.sh');

/** Sanitizers need a C compiler; skip rather than fail where there is none. */
function haveCompiler(): boolean {
  try {
    execFileSync('cc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('fake audio.device — memory safety under sanitizers', () => {
  it.skipIf(!haveCompiler() || !existsSync(SCRIPT))(
    'survives hostile IOAudio requests without OOB access or unbounded loops',
    () => {
      const out = execFileSync('bash', [SCRIPT], { encoding: 'utf8', timeout: 300_000 });
      expect(out).toMatch(/all 6 audio\.device safety cases passed/);
    },
    300_000,
  );
});
