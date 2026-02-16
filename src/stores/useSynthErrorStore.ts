/**
 * Synth Error Store
 * Manages synth initialization/runtime errors with detailed debug info
 * Shows modal dialogs instead of silent fallbacks
 */

import { create } from 'zustand';

export interface SynthError {
  id: string;
  synthType: string;
  synthName?: string;
  errorType: 'init' | 'wasm' | 'runtime' | 'audio';
  message: string;
  stack?: string;
  debugData: {
    timestamp: string;
    userAgent: string;
    audioContextState?: string;
    wasmSupported?: boolean;
    synthConfig?: Record<string, unknown>;
    [key: string]: unknown;
  };
  dismissed: boolean;
}

interface SynthErrorStore {
  errors: SynthError[];
  activeError: SynthError | null;

  // Actions
  reportError: (error: Omit<SynthError, 'id' | 'dismissed' | 'debugData'> & { debugData?: Partial<SynthError['debugData']> }) => string;
  dismissError: (id: string) => void;
  dismissAll: () => void;
  clearDismissed: () => void;
  getDebugString: (error: SynthError) => string;
  copyToClipboard: (error: SynthError) => Promise<boolean>;
}

let errorId = 0;

export const useSynthErrorStore = create<SynthErrorStore>((set, get) => ({
  errors: [],
  activeError: null,

  reportError: (errorInput) => {
    const id = `synth-error-${++errorId}`;

    // Gather debug data
    const debugData: SynthError['debugData'] = {
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      // Read the existing ToneEngine context state instead of creating a throwaway
      // AudioContext. Creating new contexts leaks them and iOS limits to ~4-6 total.
      audioContextState: (() => {
        try {
          // Try to get the shared context from ToneEngine without importing it
          // (avoid circular deps). Fall back to a safe check.
          const w = window as unknown as Record<string, unknown>;
          const engine = w._toneEngine as { getContextState?: () => string } | undefined;
          if (engine?.getContextState) return engine.getContextState();
          return 'unknown (no engine ref)';
        } catch {
          return 'unknown';
        }
      })(),
      wasmSupported: typeof WebAssembly !== 'undefined',
      ...errorInput.debugData,
    };

    const error: SynthError = {
      id,
      synthType: errorInput.synthType,
      synthName: errorInput.synthName,
      errorType: errorInput.errorType,
      message: errorInput.message,
      stack: errorInput.stack,
      debugData,
      dismissed: false,
    };

    set((state) => ({
      errors: [...state.errors, error],
      activeError: error, // Show immediately
    }));

    // Log to console for debugging
    console.error(`[SynthError] ${error.synthType}: ${error.message}`, {
      errorType: error.errorType,
      debugData: error.debugData,
      stack: error.stack,
    });

    return id;
  },

  dismissError: (id) => {
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === id ? { ...e, dismissed: true } : e
      ),
      activeError: state.activeError?.id === id ? null : state.activeError,
    }));
  },

  dismissAll: () => {
    set((state) => ({
      errors: state.errors.map((e) => ({ ...e, dismissed: true })),
      activeError: null,
    }));
  },

  clearDismissed: () => {
    set((state) => ({
      errors: state.errors.filter((e) => !e.dismissed),
    }));
  },

  getDebugString: (error) => {
    const lines = [
      '=== DEViLBOX Synth Error Report ===',
      '',
      `Synth Type: ${error.synthType}`,
      error.synthName ? `Synth Name: ${error.synthName}` : null,
      `Error Type: ${error.errorType}`,
      `Message: ${error.message}`,
      '',
      '--- Debug Data ---',
      `Timestamp: ${error.debugData.timestamp}`,
      `User Agent: ${error.debugData.userAgent}`,
      `AudioContext State: ${error.debugData.audioContextState}`,
      `WASM Supported: ${error.debugData.wasmSupported}`,
      '',
    ].filter(Boolean);

    // Add any additional debug data
    const additionalKeys = Object.keys(error.debugData).filter(
      (k) => !['timestamp', 'userAgent', 'audioContextState', 'wasmSupported', 'synthConfig'].includes(k)
    );
    if (additionalKeys.length > 0) {
      lines.push('--- Additional Info ---');
      for (const key of additionalKeys) {
        lines.push(`${key}: ${JSON.stringify(error.debugData[key])}`);
      }
      lines.push('');
    }

    // Add synth config if present
    if (error.debugData.synthConfig) {
      lines.push('--- Synth Config ---');
      lines.push(JSON.stringify(error.debugData.synthConfig, null, 2));
      lines.push('');
    }

    // Add stack trace if present
    if (error.stack) {
      lines.push('--- Stack Trace ---');
      lines.push(error.stack);
    }

    return lines.join('\n');
  },

  copyToClipboard: async (error) => {
    const debugString = get().getDebugString(error);
    try {
      await navigator.clipboard.writeText(debugString);
      return true;
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
      return false;
    }
  },
}));

// Helper function for quick error reporting from anywhere
export const reportSynthError = (
  synthType: string,
  message: string,
  options?: {
    synthName?: string;
    errorType?: SynthError['errorType'];
    error?: Error;
    debugData?: Partial<SynthError['debugData']>;
  }
) => {
  return useSynthErrorStore.getState().reportError({
    synthType,
    message,
    synthName: options?.synthName,
    errorType: options?.errorType ?? 'init',
    stack: options?.error?.stack,
    debugData: options?.debugData,
  });
};
