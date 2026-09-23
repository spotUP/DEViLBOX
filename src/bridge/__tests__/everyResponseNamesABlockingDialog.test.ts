import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A dialog covering the UI must be visible in EVERY MCP response.
 *
 * DEViLBOX has three separate blocking surfaces, each added without the
 * others knowing: a `useUIStore` modal, the crash-recovery prompt, and the
 * synth-error dialog (its own store, its own renderer in App.tsx). The store
 * layer keeps answering `ok: true` underneath all three, so an agent driving
 * the app over MCP sees a stalled engine, levels reading zero and no reason
 * given — and goes hunting in the audio graph instead.
 *
 * Only the recovery prompt was ever annotated. The synth-error dialog was
 * invisible to both `get_modal_state` and the annotation, which is the one
 * that actually fired on 2026-09-23 ("Pattern editor renderer stalled").
 * Owner, the same day: "there was a dialog in devilbox", "you always miss
 * those", "the mcp should be improved so you can see them and dismiss them
 * as i have said around a million times now".
 */
const BRIDGE = readFileSync(join(process.cwd(), 'src/bridge/MCPBridge.ts'), 'utf-8');
const WRITE = readFileSync(join(process.cwd(), 'src/bridge/handlers/writeHandlers.ts'), 'utf-8');

describe('get_modal_state reports every blocking surface', () => {
  const body = WRITE.slice(WRITE.indexOf('export function getModalState()'), WRITE.indexOf('* Answer the crash-recovery prompt.'));

  it('reports the useUIStore modal', () => {
    expect(body).toContain('modalOpen:');
  });

  it('reports the crash-recovery prompt', () => {
    expect(body).toContain('recoveryPromptOpen:');
  });

  it('reports the synth-error dialog, which used to be invisible here', () => {
    expect(body).toContain('synthErrorDialogOpen:');
    expect(body).toContain('useSynthErrorStore.getState().activeError');
    // The message too — "a dialog is open" without saying which is half an answer.
    expect(body).toContain('message: activeError.message');
  });
});

describe('every MCP response names an open dialog and how to clear it', () => {
  const fn = BRIDGE.slice(BRIDGE.indexOf('function annotateBlockingDialog('), BRIDGE.indexOf('function connect(): void {'));

  it('is what the dispatcher runs on every result', () => {
    expect(BRIDGE).toContain("send({ id: request.id, type: 'result', data: annotateBlockingDialog(request.method, result) });");
    expect(BRIDGE, 'the old recovery-only annotator is still wired').not.toContain('annotateRecoveryPrompt');
  });

  it('covers all three kinds on one key, so a caller looks for one thing', () => {
    for (const kind of ["blockingDialog: 'recovery-prompt'", "blockingDialog: 'synth-error'", 'blockingDialog: modalOpen']) {
      expect(fn, kind).toContain(kind);
    }
  });

  it('names the call that clears each one', () => {
    expect(fn).toContain('resolve_recovery_prompt');
    expect(fn).toContain('dismiss_errors');
    expect(fn).toContain('dismiss_modal');
  });

  it('warns that a synth-error dialog means the numbers cannot be trusted', () => {
    const branch = fn.slice(fn.indexOf('if (synthErrorDialogOpen)'));
    expect(branch).toContain('half-started');
    expect(branch, 'the dialog text itself is the useful part').toContain('synthError?.message');
  });

  it('keeps the recovery prompt first — it is the one holding unsaved work', () => {
    expect(fn.indexOf('if (recoveryPromptOpen)')).toBeLessThan(fn.indexOf('if (synthErrorDialogOpen)'));
    expect(fn.indexOf('if (synthErrorDialogOpen)')).toBeLessThan(fn.indexOf('if (modalOpen)'));
  });

  it('still answers the calls that speak about dialogs without annotating them', () => {
    expect(fn).toContain("method === 'get_modal_state'");
    expect(fn).toContain("method === 'dismiss_errors'");
  });

  it('never clears a dialog on its own — that stays an explicit call', () => {
    expect(fn).not.toContain('dismissAll(');
    expect(fn).not.toContain('resolveRecovery(');
  });
});
