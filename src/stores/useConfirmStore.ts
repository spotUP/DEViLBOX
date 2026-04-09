/**
 * useConfirmStore — Global confirmation / alert dialog state.
 *
 * Allows any code (stores, hooks, components) to trigger a confirmation
 * dialog and await the result. The dialog renders at the App level.
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

interface ConfirmState {
  isOpen: boolean;
  request: ConfirmRequest | null;
  resolve: ((confirmed: boolean) => void) | null;

  // Internal — called by the ConfirmDialog component
  _confirm: () => void;
  _cancel: () => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  request: null,
  resolve: null,

  _confirm: () => {
    const { resolve } = get();
    set({ isOpen: false, request: null, resolve: null });
    resolve?.(true);
  },

  _cancel: () => {
    const { resolve } = get();
    set({ isOpen: false, request: null, resolve: null });
    resolve?.(false);
  },
}));

/**
 * Show a confirmation dialog and await the result.
 * Returns true if confirmed, false if cancelled.
 */
export function showConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({
      isOpen: true,
      request,
      resolve,
    });
  });
}

/**
 * Show an alert dialog (single OK button) and await dismissal.
 */
export function showAlert(opts: { title: string; message: string }): Promise<void> {
  return new Promise((resolve) => {
    useConfirmStore.setState({
      isOpen: true,
      request: {
        title: opts.title,
        message: opts.message,
        confirmLabel: 'OK',
        alertOnly: true,
        danger: false,
      },
      resolve: () => resolve(),
    });
  });
}
