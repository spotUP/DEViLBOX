import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveViewTarget, VIEW_TARGETS, MAIN_VIEWS } from '../uiViews';

/**
 * set_active_view offered 'mixer', 'studio', 'arrangement', 'split' and
 * 'pianoroll', and the bridge wrote any of them straight into activeView -
 * App.tsx mounts nothing for those names, so the page went blank (2026-10-12).
 */
const handler = readFileSync(join(process.cwd(), 'src/bridge/handlers/writeHandlers.ts'), 'utf-8');
const server = readFileSync(join(process.cwd(), 'server/src/mcp/mcpServer.ts'), 'utf-8');

describe('set_active_view', () => {
  it('refuses a name that is no view', () => {
    for (const name of ['mixer', 'studio', 'arrangement', 'split', '', undefined, 3]) {
      expect(resolveViewTarget(name)).toBeNull();
    }
  });

  it('opens every main view, and a tracker sub-view inside the tracker', () => {
    for (const v of MAIN_VIEWS) expect(resolveViewTarget(v)?.activeView).toBe(v);
    expect(resolveViewTarget('pianoroll')).toEqual({ activeView: 'tracker', trackerViewMode: 'pianoroll' });
    expect(resolveViewTarget('sunvox')).toEqual({ activeView: 'tracker', trackerViewMode: 'sunvox' });
  });

  it('the bridge resolves the name before writing the store', () => {
    const fn = handler.slice(handler.indexOf('export function setActiveView('), handler.indexOf('export function setActiveView(') + 600);
    expect(fn).toContain('resolveViewTarget(params.view)');
    expect(fn).not.toContain('params.view as');
  });

  it('the MCP schema offers exactly the views the app has', () => {
    const tool = server.slice(server.indexOf("'set_active_view',"), server.indexOf("'set_active_view',") + 400);
    const m = tool.match(/view: z\.enum\(\[([^\]]+)\]\)/);
    expect(m).not.toBeNull();
    const offered = m![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect([...offered].sort()).toEqual([...VIEW_TARGETS].sort());
  });
});
