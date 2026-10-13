/**
 * NV-1: third-party/nuade is the pristine upstream tree at the pinned commit, with its MIT licence.
 * Fails when the tree is edited in place, the licence is dropped, or UPSTREAM.md and the sources drift apart.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const NUADE = join(ROOT, 'third-party/nuade');
const PIN = '4900e597e6718d523e50bbaf6e1fc6ca41ebe683';

describe('NV-1 vendored nuade', () => {
  it('records the pinned upstream commit, repo and tarball hash in UPSTREAM.md', () => {
    const text = readFileSync(join(NUADE, 'UPSTREAM.md'), 'utf8');
    expect(text).toContain('https://github.com/emoon/nuade');
    expect(text).toContain(PIN);
    expect(text).toMatch(/sha256[^\n]*[0-9a-f]{64}/);
    expect(text).toContain('DEViLBOX changes: none');
  });

  it('ships the upstream MIT licence naming Daniel Collin, and the upstream notices verbatim', () => {
    const lic = readFileSync(join(NUADE, 'LICENSE'), 'utf8');
    expect(lic).toContain('MIT License');
    expect(lic).toContain('Daniel Collin');
    expect(existsSync(join(NUADE, 'THIRD_PARTY_NOTICES.md'))).toBe(true);
    expect(existsSync(join(NUADE, 'docs/players.md'))).toBe(true);
  });

  it('holds the 121 players and the host API of the pin', () => {
    const players = readdirSync(join(NUADE, 'players'), { withFileTypes: true }).filter(
      (e) => e.isDirectory() && existsSync(join(NUADE, 'players', e.name, 'nuade_player.cmake')),
    );
    expect(players.length).toBe(121);
    expect(readFileSync(join(NUADE, 'include/nuade/player.h'), 'utf8')).toContain('#define NUADE_PLAYER_API_VERSION 2');
    expect(existsSync(join(NUADE, 'update.sh'))).toBe(true);
  });
});
