import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A dialog covering the UI must be visible in EVERY MCP response.
 *
 * DEViLBOX has separate blocking surfaces, each added without the
 * others knowing: a `useUIStore` modal (the start dialog is one) and the
 * synth-error dialog (its own store, its own renderer in App.tsx). The store
 * layer keeps answering `ok: true` underneath all three, so an agent driving
 * the app over MCP sees a stalled engine, levels reading zero and no reason
 * given — and goes hunting in the audio graph instead.
 *
 * Only one kind was ever annotated. The synth-error dialog was
 * invisible to both `get_modal_state` and the annotation, which is the one
 * that actually fired on 2026-09-23 ("Pattern editor renderer stalled").
 * Owner, the same day: "there was a dialog in devilbox", "you always miss
 * those", "the mcp should be improved so you can see them and dismiss them
 * as i have said around a million times now".
 */
const BRIDGE = readFileSync(join(process.cwd(), 'src/bridge/MCPBridge.ts'), 'utf-8');
const WRITE = readFileSync(join(process.cwd(), 'src/bridge/handlers/writeHandlers.ts'), 'utf-8');

describe('get_modal_state reports every blocking surface', () => {
  const body = WRITE.slice(WRITE.indexOf('export function getModalState()'), WRITE.indexOf('// ─── Format Regression Testing'));

  it('reports the useUIStore modal', () => {
    expect(body).toContain('modalOpen:');
  });

  it('has no recovery prompt or splash surface left, only the one start dialog as a modal', () => {
    expect(body).not.toContain('recoveryPromptOpen');
    expect(body).not.toContain('startupSplashOpen');
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
    // dispatchBridgeCall is the one path for the relay socket and the AI chat tool loop.
    expect(BRIDGE).toContain("return { ok: true, data: annotateBlockingDialog(method, result) };");
    expect(BRIDGE).toContain('const outcome = await dispatchBridgeCall(request.method, request.params ?? {});');
  });

  it('covers both kinds on one key, so a caller looks for one thing', () => {
    for (const kind of ["blockingDialog: 'synth-error'", 'blockingDialog: modalOpen']) {
      expect(fn, kind).toContain(kind);
    }
  });

  it('names the call that clears each one', () => {
    expect(fn).not.toContain('resolve_recovery_prompt');
    expect(fn).toContain('dismiss_errors');
    expect(fn).toContain('dismiss_modal');
  });

  it('warns that a synth-error dialog means the numbers cannot be trusted', () => {
    const branch = fn.slice(fn.indexOf('if (synthErrorDialogOpen)'));
    expect(branch).toContain('half-started');
    expect(branch, 'the dialog text itself is the useful part').toContain('synthError?.message');
  });

  it('names the start dialog and says closing it starts the jingle', () => {
    expect(fn).toContain('The start dialog');
    expect(fn).toContain('starts the startup jingle');
  });

  it('puts the synth error before the modal', () => {
    expect(fn.indexOf('if (synthErrorDialogOpen)')).toBeLessThan(fn.indexOf('if (modalOpen)'));
  });

  it('still answers the calls that speak about dialogs without annotating them', () => {
    expect(fn).toContain("method === 'get_modal_state'");
    expect(fn).toContain("method === 'dismiss_errors'");
  });

  it('never clears a dialog on its own — that stays an explicit call', () => {
    expect(fn).not.toContain('dismissAll(');
  });
});
