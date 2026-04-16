/**
 * useConfirmStore — Global confirmation / alert dialog state.
 *
 * Allows any code (stores, hooks, components) to trigger a confirmation
 * dialog and await the result. The dialog renders at the App level.
 *
 * Features:
 * - Queues rapid-fire calls so no Promise is lost
 * - Guards against double-resolve (confirm+cancel on same tick)
 *
 * Usage:
 *   const confirmed = await showConfirm({
 *     title: 'Warning',
 *     message: 'Are you sure?',
 *     confirmLabel: 'Yes',
 *     danger: true,
 *   });
 *
 *   await showAlert({
 *     title: 'Error',
 *     message: 'File could not be loaded.',
 *   });
 */

import { create } from 'zustand';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When true, only show a single OK button (no Cancel). */
  alertOnly?: boolean;
}

interface QueuedDialog {
  request: ConfirmRequest;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmState {
  isOpen: boolean;
  request: ConfirmRequest | null;
  resolve: ((confirmed: boolean) => void) | null;

  // Internal — called by the ConfirmDialog component
  _confirm: () => void;
  _cancel: () => void;
}

// Queue of pending dialogs (module-level to avoid Zustand proxy issues)
const _queue: QueuedDialog[] = [];

function _showNext(): void {
  const next = _queue.shift();
  if (!next) return;
  useConfirmStore.setState({
    isOpen: true,
    request: next.request,
    resolve: next.resolve,
  });
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  request: null,
  resolve: null,

  _confirm: () => {
    const { resolve } = get();
    if (!resolve) return; // Already resolved (double-click guard)
    set({ isOpen: false, request: null, resolve: null });
    resolve(true);
    // Show next queued dialog on the next microtask
    queueMicrotask(_showNext);
  },

  _cancel: () => {
    const { resolve } = get();
    if (!resolve) return; // Already resolved (double-click guard)
    set({ isOpen: false, request: null, resolve: null });
    resolve(false);
    queueMicrotask(_showNext);
  },
}));

/**
 * Show a confirmation dialog and await the result.
 * Returns true if confirmed, false if cancelled.
 * If a dialog is already open, queues this one.
 */
export function showConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    const state = useConfirmStore.getState();
    if (state.isOpen) {
      // Queue — don't overwrite the current dialog's resolve
      _queue.push({ request, resolve });
    } else {
      useConfirmStore.setState({
        isOpen: true,
        request,
        resolve,
      });
    }
  });
}

/**
 * Show an alert dialog (single OK button) and await dismissal.
 */
export function showAlert(opts: { title: string; message: string }): Promise<void> {
  return new Promise((resolve) => {
    const request: ConfirmRequest = {
      title: opts.title,
      message: opts.message,
      confirmLabel: 'OK',
      alertOnly: true,
      danger: false,
    };
    const state = useConfirmStore.getState();
    if (state.isOpen) {
      _queue.push({ request, resolve: () => resolve() });
    } else {
      useConfirmStore.setState({
        isOpen: true,
        request,
        resolve: () => resolve(),
      });
    }
  });
}
