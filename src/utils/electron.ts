/**
 * Electron Utilities - Detect environment and platform
 */

declare global {
  interface Window {
    electron?: {
      isElectron: boolean;
      platform: string;
      onMenuAction: (callback: (action: string) => void) => void;
      fs?: {
        openDirectory: () => Promise<string | null>;
        readdir: (dirPath: string, extensions?: string[]) => Promise<Array<{
          name: string;
          path: string;
          isDirectory: boolean;
          size?: number;
          modifiedAt?: string;
        }>>;
        readFile: (filePath: string) => Promise<ArrayBuffer>;
        writeFile: (filePath: string, data: ArrayBuffer | Uint8Array) => Promise<boolean>;
        showSaveDialog: (options: {
          defaultPath?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
        }) => Promise<string | null>;
        showOpenDialog: (options: {
          properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
          filters?: Array<{ name: string; extensions: string[] }>;
        }) => Promise<string[] | null>;
      };
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

/**
 * Returns true if Electron native file system is available
 */
export const hasElectronFS = (): boolean => {
  return isElectron() && !!window.electron?.fs;
};
