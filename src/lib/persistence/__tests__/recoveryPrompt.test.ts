/**
 * The dialog the tools could not see.
 *
 * 2026-09-18: DEViLBOX's boot-time "Recover unsaved work" dialog was on screen
 * while `get_modal_state` answered `modalOpen: null` and `dismiss_modal`
 * answered "No modal was open". Both read `useUIStore.modalOpen`, and this
 * prompt is driven by `useProjectPersistence`'s own React state, so neither
 * could ever see it. A tool that reports the UI incorrectly is the same class
 * of fault as X8's stale descriptions — and here it hid a dialog holding the
 * user's unsaved work.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  setRecoveryPrompt,
  isRecoveryPromptOpen,
  describeRecoveryPrompt,
  resolveRecoveryPrompt,
} from '../recoveryPrompt';

beforeEach(() => setRecoveryPrompt(null));

describe('the prompt announces itself while it is up', () => {
  it('is not open when nothing registered', () => {
    expect(isRecoveryPromptOpen()).toBe(false);
  });

  it('is open once the dialog registers', () => {
    setRecoveryPrompt({ restore: () => {}, discard: () => {} });
    expect(isRecoveryPromptOpen()).toBe(true);
  });

  it('is closed again when the dialog goes', () => {
    setRecoveryPrompt({ restore: () => {}, discard: () => {} });
    setRecoveryPrompt(null);
    expect(isRecoveryPromptOpen()).toBe(false);
  });

  it('can say what is on offer', () => {
    setRecoveryPrompt({
      restore: () => {}, discard: () => {},
      describe: () => ({ name: 'world class dub', savedAt: '2026-09-18T18:00:00Z' }),
    });
    expect(describeRecoveryPrompt()).toEqual({
      name: 'world class dub', savedAt: '2026-09-18T18:00:00Z',
    });
  });

  it('survives a describe that throws rather than taking the reader down', () => {
    setRecoveryPrompt({
      restore: () => {}, discard: () => {},
      describe: () => { throw new Error('snapshot unreadable'); },
    });
    expect(describeRecoveryPrompt()).toBeNull();
  });
});

describe('resolving it', () => {
  it('restores when asked to restore', () => {
    let restored = 0, discarded = 0;
    setRecoveryPrompt({ restore: () => { restored++; }, discard: () => { discarded++; } });
    expect(resolveRecoveryPrompt('restore')).toBe(true);
    expect([restored, discarded]).toEqual([1, 0]);
  });

  it('discards when asked to discard', () => {
    let restored = 0, discarded = 0;
    setRecoveryPrompt({ restore: () => { restored++; }, discard: () => { discarded++; } });
    expect(resolveRecoveryPrompt('discard')).toBe(true);
    expect([restored, discarded]).toEqual([0, 1]);
  });

  it('reports when there was nothing to resolve', () => {
    // So a caller can tell "I discarded it" from "there was no dialog".
    expect(resolveRecoveryPrompt('discard')).toBe(false);
  });
});

describe('wiring contract', () => {
  const app = readFileSync(join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');
  const handlers = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'handlers', 'writeHandlers.ts'), 'utf8',
  );
  const bridge = readFileSync(
    join(__dirname, '..', '..', '..', 'bridge', 'MCPBridge.ts'), 'utf8',
  );
  const server = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'server', 'src', 'mcp', 'mcpServer.ts'), 'utf8',
  );

  it('the dialog registers while it is rendered, and unregisters after', () => {
    expect(app).toContain('setRecoveryPrompt({');
    expect(app).toContain('return () => setRecoveryPrompt(null);');
    expect(app).toContain("if (!recoverySnapshot) { setRecoveryPrompt(null); return; }");
  });

  it('get_modal_state reports it', () => {
    expect(handlers).toContain('recoveryPromptOpen: recoveryOpen');
  });

  it('dismiss_modal REFUSES it rather than discarding unsaved work', () => {
    // A general "close whatever is open" must never choose to destroy a take
    // nobody has saved.
    expect(handlers).toMatch(/if \(isRecoveryPromptOpen\(\)\) \{[\s\S]{0,400}ok: false/);
    expect(handlers).toContain('resolve_recovery_prompt');
  });

  it('the explicit resolver is routed and declared', () => {
    expect(handlers).toContain('export function resolveRecoveryPrompt');
    expect(bridge).toContain('resolve_recovery_prompt: resolveRecoveryPrompt');
    expect(server).toContain("'resolve_recovery_prompt'");
  });
});
