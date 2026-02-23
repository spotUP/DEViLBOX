/**
 * KeyboardRouter - Centralized keyboard event routing by active view.
 *
 * This singleton intercepts all keyboard events at the capture phase and
 * routes them to the appropriate handler based on:
 * 1. Whether it's a global key (works in all views)
 * 2. The currently active view from useUIStore
 *
 * This prevents key leaks between views (e.g., tracker note keys
 * triggering while in DJ view).
 */

import { useUIStore } from '@/stores/useUIStore';
import { KeyboardNormalizer } from './KeyboardNormalizer';
import { isGlobalKey, eventToComboString, type ViewType } from './globalKeys';
import type { NormalizedKeyEvent } from './types';

export type KeyboardHandler = (e: NormalizedKeyEvent, originalEvent: KeyboardEvent) => boolean;

interface RouterState {
  initialized: boolean;
  globalHandler: KeyboardHandler | null;
  viewHandlers: Map<ViewType, KeyboardHandler>;
  debug: boolean;
}

const state: RouterState = {
  initialized: false,
  globalHandler: null,
  viewHandlers: new Map(),
  debug: false,
};

/**
 * Check if event target is an input field where we shouldn't intercept keys.
 */
function isInputElement(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  if (!target) return false;

  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    // Allow Escape to still work in inputs
    if (e.key === 'Escape') return false;
    // Allow Tab to still work for navigation
    if (e.key === 'Tab') return false;
    return true;
  }

  // Check for contenteditable
  if (target.isContentEditable) {
    if (e.key === 'Escape') return false;
    return true;
  }

  return false;
}

/**
 * Check if a modal dialog is open.
 */
function isModalOpen(): boolean {
  // Common modal selectors
  return !!(
    document.querySelector('.fixed.inset-0.z-50') ||
    document.querySelector('[role="dialog"]') ||
    document.querySelector('.modal-overlay')
  );
}

/**
 * Main keyboard event handler.
 */
function handleKeyDown(e: KeyboardEvent): void {
  // Skip if target is an input field
  if (isInputElement(e)) {
    return;
  }

  const normalized = KeyboardNormalizer.normalize(e);
  const combo = eventToComboString(normalized);
  const activeView = useUIStore.getState().activeView;

  if (state.debug) {
    console.debug(`[KeyboardRouter] Key: ${combo}, View: ${activeView}, Global: ${isGlobalKey(normalized)}`);
  }

  // Check if modal is open - only allow Escape
  if (isModalOpen()) {
    if (e.key === 'Escape') {
      if (state.globalHandler?.(normalized, e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    return;
  }

  let handled = false;

  // Global keys: dispatch to global handler regardless of view
  if (isGlobalKey(normalized)) {
    if (state.globalHandler) {
      handled = state.globalHandler(normalized, e);
    }
  }

  // If not handled by global, try view-specific handler
  if (!handled) {
    const viewHandler = state.viewHandlers.get(activeView);
    if (viewHandler) {
      handled = viewHandler(normalized, e);
    }
  }

  // If still not handled but is a global key, try global handler as fallback
  // (for keys that might be handled differently per context)
  if (!handled && !isGlobalKey(normalized) && state.globalHandler) {
    handled = state.globalHandler(normalized, e);
  }

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * Handle keyup events for release handlers (e.g., DJ fader cut release).
 */
function handleKeyUp(e: KeyboardEvent): void {
  if (isInputElement(e)) {
    return;
  }

  const activeView = useUIStore.getState().activeView;

  // View-specific handler for keyup
  const viewHandler = state.viewHandlers.get(activeView);
  if (viewHandler) {
    // View handlers can check for keyup internally if needed
    // We pass the event so they can distinguish
  }
}

/**
 * Initialize the keyboard router.
 * Should be called once at app startup.
 */
export function initKeyboardRouter(): void {
  if (state.initialized) {
    console.warn('[KeyboardRouter] Already initialized');
    return;
  }

  window.addEventListener('keydown', handleKeyDown, { capture: true });
  window.addEventListener('keyup', handleKeyUp, { capture: true });

  state.initialized = true;

  if (state.debug) {
    console.debug('[KeyboardRouter] Initialized');
  }
}

/**
 * Cleanup the keyboard router.
 * Call this on app unmount if needed.
 */
export function destroyKeyboardRouter(): void {
  if (!state.initialized) return;

  window.removeEventListener('keydown', handleKeyDown, { capture: true });
  window.removeEventListener('keyup', handleKeyUp, { capture: true });

  state.initialized = false;
  state.globalHandler = null;
  state.viewHandlers.clear();
}

/**
 * Register the global keyboard handler.
 * This handles keys that should work in all views.
 */
export function registerGlobalHandler(handler: KeyboardHandler): () => void {
  state.globalHandler = handler;
  return () => {
    state.globalHandler = null;
  };
}

/**
 * Register a view-specific keyboard handler.
 * This handler only receives events when that view is active.
 */
export function registerViewHandler(view: ViewType, handler: KeyboardHandler): () => void {
  state.viewHandlers.set(view, handler);
  return () => {
    state.viewHandlers.delete(view);
  };
}

/**
 * Enable or disable debug logging.
 */
export function setKeyboardRouterDebug(enabled: boolean): void {
  state.debug = enabled;
}

/**
 * Get current router state for debugging.
 */
export function getKeyboardRouterState(): {
  initialized: boolean;
  hasGlobalHandler: boolean;
  registeredViews: ViewType[];
  debug: boolean;
} {
  return {
    initialized: state.initialized,
    hasGlobalHandler: state.globalHandler !== null,
    registeredViews: Array.from(state.viewHandlers.keys()),
    debug: state.debug,
  };
}
