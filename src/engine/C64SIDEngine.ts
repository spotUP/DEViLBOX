/**
 * C64SIDEngine.ts
 * 
 * Unified C64 SID playback engine that uses DeepSID emulators.
 * Handles playback while SIDParser extracts patterns for the tracker.
 * 
 * Architecture:
 * - SIDParser: 6502 emulation to extract NOTE data for tracker patterns
 * - C64SIDEngine: Real SID chip emulation for audio playback
 */

import { deepSIDManager, type SIDEngineType } from './deepsid/DeepSIDEngineManager';
import { JSSIDEngine } from './deepsid/engines/JSSIDEngine';
import { WebSIDEngine } from './deepsid/engines/WebSIDEngine';
import { TinyRSIDEngine } from './deepsid/engines/TinyRSIDEngine';
import { WebSIDPlayEngine } from './deepsid/engines/WebSIDPlayEngine';
import { JSIDPlay2Engine } from './deepsid/engines/JSIDPlay2Engine';
import { useSettingsStore } from '@stores/useSettingsStore';

type EngineInstance = JSSIDEngine | WebSIDEngine | TinyRSIDEngine | WebSIDPlayEngine | JSIDPlay2Engine;

export interface C64SIDMetadata {
  title: string;
  author: string;
  copyright: string;
  subsongs: number;
  defaultSubsong: number;
  chipModel: '6581' | '8580';
  clockSpeed: number; // PAL: 985248, NTSC: 1022727
}

/**
 * C64SIDEngine - High-level wrapper for DeepSID playback
 */
export class C64SIDEngine {
  private engine: EngineInstance | null = null;
  private engineType: SIDEngineType | null = null;
  private audioContext: AudioContext | null = null;
  private metadata: C64SIDMetadata | null = null;
  private sidData: Uint8Array;

  constructor(sidData: Uint8Array) {
    this.sidData = sidData;
    this.extractMetadata();
  }

  /**
   * Extract basic metadata from SID header (PSID/RSID format)
   */
  private extractMetadata(): void {
    const view = new DataView(this.sidData.buffer, this.sidData.byteOffset);
    
    // Check magic
    const magic = String.fromCharCode(
      this.sidData[0], this.sidData[1], this.sidData[2], this.sidData[3]
    );
    
    if (magic !== 'PSID' && magic !== 'RSID') {
      throw new Error('Invalid SID file: missing PSID/RSID magic');
    }
    
    // Version (offset 4, 2 bytes BE)
    const version = view.getUint16(4, false);
    
    // Data offset (offset 6, 2 bytes BE)
    const dataOffset = view.getUint16(6, false);
    
    // Songs count (offset 14, 2 bytes BE)
    const songs = view.getUint16(14, false);
    
    // Default song (offset 16, 2 bytes BE, 1-based)
    const startSong = view.getUint16(16, false);
    
    // Title, author, copyright (offset 22, 32 bytes each)
    const title = this.readStr(22, 32);
    const author = this.readStr(54, 32);
    const copyright = this.readStr(86, 32);
    
    // Flags (offset 118, 2 bytes BE) - for PSID v2+
    let chipModel: '6581' | '8580' = '6581';
    let clockSpeed = 985248; // PAL default
    
    if (version >= 2 && dataOffset >= 0x7C) {
      const flags = view.getUint16(118, false);
      
      // Bits 4-5: SID model (00=unknown, 01=6581, 10=8580, 11=both)
      const sidModel = (flags >> 4) & 0x03;
      if (sidModel === 0x02) chipModel = '8580';
      
      // Bits 2-3: Clock speed (00=unknown, 01=PAL, 10=NTSC, 11=both)
      const clock = (flags >> 2) & 0x03;
      if (clock === 0x02) clockSpeed = 1022727; // NTSC
    }
    
    this.metadata = {
      title,
      author,
      copyright,
      subsongs: songs,
      defaultSubsong: startSong - 1, // Convert to 0-based
      chipModel,
      clockSpeed,
    };
    
    console.log('[C64SIDEngine] Metadata:', this.metadata);
  }

  /**
   * Read null-terminated string from SID header
   */
  private readStr(offset: number, maxLen: number): string {
    let str = '';
    for (let i = 0; i < maxLen && this.sidData[offset + i] !== 0; i++) {
      str += String.fromCharCode(this.sidData[offset + i]);
    }
    return str.trim();
  }

  /**
   * Initialize the SID engine
   */
  async init(audioContext: AudioContext): Promise<void> {
    this.audioContext = audioContext;
    
    // Get user's preferred engine from settings
    const engineType = useSettingsStore.getState().sidEngine || 'websid';
    
    console.log('[C64SIDEngine] Loading engine:', engineType);
    
    // Load the engine module
    const engineModule = await deepSIDManager.loadEngine(engineType);
    
    // Create engine instance
    this.engineType = engineType;
    
    switch (engineType) {
      case 'jssid':
        this.engine = new JSSIDEngine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
        });
        break;
      
      case 'websid':
        this.engine = new WebSIDEngine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
        });
        break;
      
      case 'tinyrsid':
        this.engine = new TinyRSIDEngine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
        });
        break;
      
      case 'websidplay':
        this.engine = new WebSIDPlayEngine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
          quality: 'resample', // Best quality
        });
        break;
      
      case 'jsidplay2':
        this.engine = new JSIDPlay2Engine(this.sidData, {
          chipModel: this.metadata?.chipModel,
          sampleRate: audioContext.sampleRate,
          forceSIDModel: true,
        });
        break;
    }
    
    // Initialize the engine with the loaded module
    await this.engine!.init(engineModule);
    
    console.log('[C64SIDEngine] Engine initialized:', engineType);
  }

  /**
   * Start playback
   */
  async play(): Promise<void> {
    if (!this.engine || !this.audioContext) {
      throw new Error('Engine not initialized');
    }
    
    await this.engine.play(this.audioContext);
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (this.engine) {
      this.engine.stop();
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.engine) {
      this.engine.pause();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.engine) {
      this.engine.resume();
    }
  }

  /**
   * Set subsong
   */
  setSubsong(subsong: number): void {
    if (this.engine) {
      this.engine.setSubsong(subsong);
    }
  }

  /**
   * Get current subsong
   */
  getSubsong(): number {
    return this.engine?.getSubsong() ?? 0;
  }

  /**
   * Get metadata
   */
  getMetadata(): C64SIDMetadata | null {
    return this.metadata;
  }

  /**
   * Get engine metadata (may have more details)
   */
  getEngineMetadata(): any {
    return this.engine?.getMetadata() ?? null;
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.engine?.isActive() ?? false;
  }

  /**
   * Get current engine type
   */
  getEngineType(): SIDEngineType | null {
    return this.engineType;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    this.audioContext = null;
  }
}

/**
 * Create a C64 SID engine instance
 */
export function createC64SIDEngine(sidData: Uint8Array): C64SIDEngine {
  return new C64SIDEngine(sidData);
}
