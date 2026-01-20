/**
 * Electron Utilities - Detect environment and platform
 */

declare global {
  interface Window {
    electron?: {
      isElectron: boolean;
      platform: string;
      onMenuAction: (callback: (action: string) => void) => void;
    };
  }
}

/**
 * Register a listener for native OS menu actions
 */
export const onMenuAction = (callback: (action: string) => void): void => {
  window.electron?.onMenuAction(callback);
};

/**
 * Returns true if the app is running inside Electron
 */
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electron?.isElectron === true;
};

/**
 * Returns the Electron platform (darwin, win32, linux)
 */
export const getPlatform = (): string | null => {
  return window.electron?.platform || null;
};
