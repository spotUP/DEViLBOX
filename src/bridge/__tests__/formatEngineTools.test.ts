/**
 * NS-10 / NS-11: the MCP reaches the per-format engine choice through the one resolver and the one switch, and
 * get_format_state names the nuade player and credit of the loaded song.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useFormatStore } from '@stores/useFormatStore';
import { getFormatEngines, setFormatEngine } from '../handlers/engineHandlers';
import { getFormatState } from '../handlers/readHandlers';
import { NUADE_ENGINE_CREDIT } from '@/engine/nuade/nuadeFormats';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = join(__dirname, '../../..');

beforeEach(() => {
  useSettingsStore.setState((s) => { delete (s.formatEngine as unknown as Record<string, unknown>).soundmon; delete (s.formatEngine as unknown as Record<string, unknown>).mmdc; });
  useFormatStore.getState().applyEditorMode({ format: 'MOD' } as unknown as TrackerSong);
});

describe('NS-10 get_format_engines / set_format_engine', () => {
  it('lists the table with choices, effective engine and default, and filters by key or player id', () => {
    const all = getFormatEngines() as { count: number; rows: { id: string }[] };
    expect(all.count).toBe(114);
    const one = (getFormatEngines({ format: 'soundmon' }) as { rows: Record<string, unknown>[] }).rows;
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ id: 'soundmon', role: 'dual', choices: ['native', 'uade', 'nuade'], effective: 'native', default: 'native', heldBecause: null });
  });

  it('set_format_engine stores the choice (no song of the format loaded: nothing reopens) and get_format_engines shows it', async () => {
    const r = await setFormatEngine({ format: 'mmdc', engine: 'nuade' });
    expect(r).toEqual({ ok: true, prefKey: 'mmdc', stored: 'nuade', reopened: false });
    expect((getFormatEngines({ format: 'mmdc' }) as { rows: { effective: string }[] }).rows[0]!.effective).toBe('nuade');
    expect(await setFormatEngine({ format: 'nonsense', engine: 'nuade' })).toMatchObject({ error: expect.stringContaining('unknown format') });
    expect(await setFormatEngine({ format: 'mmdc', engine: 'native' })).toMatchObject({ error: expect.stringContaining('cannot play') });
  });

  it('is registered: a server tool for each, and the bridge dispatch table', () => {
    const server = readFileSync(join(ROOT, 'server/src/mcp/mcpServer.ts'), 'utf8');
    expect(server).toContain("'get_format_engines'");
    expect(server).toContain("'set_format_engine'");
    const bridge = readFileSync(join(ROOT, 'src/bridge/MCPBridge.ts'), 'utf8');
    expect(bridge).toContain('get_format_engines: getFormatEngines');
    expect(bridge).toContain('set_format_engine: setFormatEngine');
  });
});

describe('NS-11 get_format_state', () => {
  it('names the nuade player and credit of a song that plays on nuade, and neither for any other', () => {
    expect(getFormatState()).toMatchObject({ nuadePlayerId: null, engineCredit: null });
    useFormatStore.getState().applyEditorMode({ format: 'MOD', nuadePlayerId: 'mmdc', nuadeFileData: new ArrayBuffer(4) } as unknown as TrackerSong);
    expect(getFormatState()).toMatchObject({ playingEngine: 'Nuade', nuadePlayerId: 'mmdc', engineCredit: NUADE_ENGINE_CREDIT });
  });
});
