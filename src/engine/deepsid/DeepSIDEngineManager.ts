/**
 * DeepSIDEngineManager.ts
 * 
 * Manages 5 different C64 SID emulation engines from DeepSID:
 * - jsSID: Pure JavaScript, ASID hardware support
 * - WebSID: Fast WASM reSID emulator (recommended)
 * - TinyRSID: Lightweight WASM reSID
 * - WebSIDPlay: Best quality WASM reSID
 * - JSIDPlay2: Perfect C64 emulation (largest)
 * 
 * Handles lazy loading, WASM fallback, and IndexedDB caching.
 */

export type SIDEngineType = 'jssid' | 'websid' | 'tinyrsid' | 'websidplay' | 'jsidplay2';

export interface SIDEngineInfo {
  id: SIDEngineType;
  name: string;
  description: string;
  size: string;
  sizeBytes: number;
  accuracy: 'Good' | 'Very Good' | 'Excellent' | 'Perfect';
  speed: 'Fast' | 'Very Fast' | 'Slower';
  requiresWASM: boolean;
  features: {
    fastForward: boolean;
    encoding: boolean;
    seeking: boolean;
    loopDetection: boolean;
    forceSIDModel: boolean;
    ciaTimerRead: boolean;
    asidHardware: boolean;
    oplSupport: boolean;
  };
}

export const SID_ENGINES: Record<SIDEngineType, SIDEngineInfo> = {
  jssid: {
    id: 'jssid',
    name: 'jsSID',
    description: 'Pure JavaScript SID emulator by Hermit. No WASM required. Supports ASID hardware and OPL/FM chips.',
    size: '92KB',
    sizeBytes: 92 * 1024,
    accuracy: 'Good',
    speed: 'Fast',
    requiresWASM: false,
    features: {
      fastForward: true,
      encoding: false,
      seeking: false,
      loopDetection: true,
      forceSIDModel: false,
      ciaTimerRead: true,
      asidHardware: true,
      oplSupport: true,
    },
  },
  websid: {
    id: 'websid',
    name: 'WebSID',
    description: 'Fast WASM reSID emulator. Best balance of accuracy and performance. Recommended default.',
    size: '154KB',
    sizeBytes: 154 * 1024,
    accuracy: 'Very Good',
    speed: 'Very Fast',
    requiresWASM: true,
    features: {
      fastForward: true,
      encoding: true,
      seeking: false,
      loopDetection: true,
      forceSIDModel: false,
      ciaTimerRead: true,
      asidHardware: false,
      oplSupport: false,
    },
  },
  tinyrsid: {
    id: 'tinyrsid',
    name: 'TinyRSID',
    description: 'Lightweight WASM reSID emulator. Smallest WASM option for mobile/low-bandwidth.',
    size: '100KB',
    sizeBytes: 100 * 1024,
    accuracy: 'Good',
    speed: 'Very Fast',
    requiresWASM: true,
    features: {
      fastForward: true,
      encoding: false,
      seeking: false,
      loopDetection: true,
      forceSIDModel: false,
      ciaTimerRead: true,
      asidHardware: false,
      oplSupport: false,
    },
  },
  websidplay: {
    id: 'websidplay',
    name: 'WebSIDPlay',
    description: 'Best quality WASM reSID emulator. Most accurate SID chip emulation available.',
    size: '385KB',
    sizeBytes: 385 * 1024,
    accuracy: 'Excellent',
    speed: 'Fast',
    requiresWASM: true,
    features: {
      fastForward: true,
      encoding: true,
      seeking: false,
      loopDetection: true,
      forceSIDModel: false,
      ciaTimerRead: true,
      asidHardware: false,
      oplSupport: false,
    },
  },
  jsidplay2: {
    id: 'jsidplay2',
    name: 'JSIDPlay2',
    description: 'Perfect C64 emulation. Full accuracy but slower and much larger. Best for archival/research.',
    size: '3.6MB',
    sizeBytes: 3.6 * 1024 * 1024,
    accuracy: 'Perfect',
    speed: 'Slower',
    requiresWASM: true,
    features: {
      fastForward: true,
      encoding: true,
      seeking: true,
      loopDetection: true,
      forceSIDModel: true,
      ciaTimerRead: true,
      asidHardware: false,
      oplSupport: false,
    },
  },
};

export const DEFAULT_ENGINE: SIDEngineType = 'websid';

interface LoadedEngine {
  type: SIDEngineType;
  module: any;
  loadedAt: number;
}

/**
 * DeepSIDEngineManager - Lazy loads and caches SID engines
 */
export class DeepSIDEngineManager {
  private static instance: DeepSIDEngineManager;
  private loadedEngines: Map<SIDEngineType, LoadedEngine> = new Map();
  private loadingPromises: Map<SIDEngineType, Promise<any>> = new Map();
  private wasmSupported: boolean;

  private constructor() {
    this.wasmSupported = typeof WebAssembly !== 'undefined';
    if (!this.wasmSupported) {
      console.warn('[DeepSID] WebAssembly not supported, will use jsSID fallback');
    }
  }

  static getInstance(): DeepSIDEngineManager {
    if (!DeepSIDEngineManager.instance) {
      DeepSIDEngineManager.instance = new DeepSIDEngineManager();
    }
    return DeepSIDEngineManager.instance;
  }

  /**
   * Check if WebAssembly is supported
   */
  isWASMSupported(): boolean {
    return this.wasmSupported;
  }

  /**
   * Get engine info
   */
  getEngineInfo(type: SIDEngineType): SIDEngineInfo {
    return SID_ENGINES[type];
  }

  /**
   * Get all available engines (filters out WASM engines if not supported)
   */
  getAvailableEngines(): SIDEngineInfo[] {
    return Object.values(SID_ENGINES).filter(
      (engine) => !engine.requiresWASM || this.wasmSupported
    );
  }

  /**
   * Get recommended engine for current environment
   */
  getRecommendedEngine(): SIDEngineType {
    if (!this.wasmSupported) {
      return 'jssid';
    }
    return DEFAULT_ENGINE;
  }

  /**
   * Check if engine is already loaded
   */
  isEngineLoaded(type: SIDEngineType): boolean {
    return this.loadedEngines.has(type);
  }

  /**
   * Load a SID engine (lazy loading with caching)
   */
  async loadEngine(type: SIDEngineType): Promise<any> {
    // Check if already loaded
    if (this.loadedEngines.has(type)) {
      console.log(`[DeepSID] Engine ${type} already loaded`);
      return this.loadedEngines.get(type)!.module;
    }

    // Check if currently loading
    if (this.loadingPromises.has(type)) {
      console.log(`[DeepSID] Engine ${type} is loading, waiting...`);
      return this.loadingPromises.get(type)!;
    }

    const engineInfo = SID_ENGINES[type];

    // Check WASM support
    if (engineInfo.requiresWASM && !this.wasmSupported) {
      console.warn(`[DeepSID] Engine ${type} requires WASM, falling back to jsSID`);
      return this.loadEngine('jssid');
    }

    console.log(`[DeepSID] Loading engine: ${type} (${engineInfo.size})`);

    // Create loading promise
    const loadPromise = this.loadEngineImpl(type);
    this.loadingPromises.set(type, loadPromise);

    try {
      const module = await loadPromise;
      
      // Cache the loaded engine
      this.loadedEngines.set(type, {
        type,
        module,
        loadedAt: Date.now(),
      });

      console.log(`[DeepSID] Engine ${type} loaded successfully`);
      return module;
    } catch (error) {
      console.error(`[DeepSID] Failed to load engine ${type}:`, error);
      throw error;
    } finally {
      this.loadingPromises.delete(type);
    }
  }

  /**
   * Internal engine loading implementation
   */
  private async loadEngineImpl(type: SIDEngineType): Promise<any> {
    switch (type) {
      case 'jssid':
        return this.loadJSSID();
      case 'websid':
        return this.loadWebSID();
      case 'tinyrsid':
        return this.loadTinyRSID();
      case 'websidplay':
        return this.loadWebSIDPlay();
      case 'jsidplay2':
        return this.loadJSIDPlay2();
      default:
        throw new Error(`Unknown SID engine type: ${type}`);
    }
  }

  /**
   * Load jsSID (pure JavaScript)
   */
  private async loadJSSID(): Promise<any> {
    // Load jsSID script
    await this.loadScript('/deepsid/jsSID-modified.js');
    await this.loadScript('/deepsid/scriptprocessor_player.min.js');

    // Check if jsSID is available globally
    if (typeof (window as any).jsSID === 'undefined') {
      throw new Error('jsSID not loaded');
    }

    return {
      type: 'jssid',
      jsSID: (window as any).jsSID,
      player: (window as any).SIDPlayer,
    };
  }

  /**
   * Load WebSID (WASM)
   */
  private async loadWebSID(): Promise<any> {
    await this.loadScript('/deepsid/backend_websid.js');
    
    // WebSID backend should be available as global
    if (typeof (window as any).SIDBackend === 'undefined') {
      throw new Error('WebSID backend not loaded');
    }

    return {
      type: 'websid',
      backend: (window as any).SIDBackend,
    };
  }

  /**
   * Load TinyRSID (WASM)
   */
  private async loadTinyRSID(): Promise<any> {
    await this.loadScript('/deepsid/backend_tinyrsid.js');
    
    if (typeof (window as any).reSIDBackend === 'undefined') {
      throw new Error('TinyRSID backend not loaded');
    }

    return {
      type: 'tinyrsid',
      backend: (window as any).reSIDBackend,
    };
  }

  /**
   * Load WebSIDPlay (WASM)
   */
  private async loadWebSIDPlay(): Promise<any> {
    await this.loadScript('/deepsid/backend_websidplay.js');
    
    if (typeof (window as any).reSIDBackend === 'undefined') {
      throw new Error('WebSIDPlay backend not loaded');
    }

    return {
      type: 'websidplay',
      backend: (window as any).reSIDBackend,
    };
  }

  /**
   * Load JSIDPlay2 (WASM with workers)
   */
  private async loadJSIDPlay2(): Promise<any> {
    // Load runtime and worker
    await this.loadScript('/deepsid/jsidplay2-004.wasm_gc-runtime.js');
    await this.loadScript('/deepsid/jsidplay2-004.wasm_gc-worker.js');
    
    if (typeof (window as any).JSIDPlay2 === 'undefined') {
      throw new Error('JSIDPlay2 not loaded');
    }

    return {
      type: 'jsidplay2',
      player: (window as any).JSIDPlay2,
    };
  }

  /**
   * Helper to load a script dynamically
   */
  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Unload an engine to free memory
   */
  unloadEngine(type: SIDEngineType): void {
    if (this.loadedEngines.has(type)) {
      console.log(`[DeepSID] Unloading engine: ${type}`);
      this.loadedEngines.delete(type);
    }
  }

  /**
   * Clear all loaded engines
   */
  clearAll(): void {
    console.log('[DeepSID] Clearing all loaded engines');
    this.loadedEngines.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get memory usage info
   */
  getMemoryInfo(): { loaded: SIDEngineType[]; totalSize: number } {
    const loaded = Array.from(this.loadedEngines.keys());
    const totalSize = loaded.reduce(
      (sum, type) => sum + SID_ENGINES[type].sizeBytes,
      0
    );
    return { loaded, totalSize };
  }
}

// Export singleton instance
export const deepSIDManager = DeepSIDEngineManager.getInstance();
