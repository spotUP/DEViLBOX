/**
 * FurnaceEffectRouter - Maps tracker effect commands to Furnace DivCmd dispatch calls
 *
 * Effect code → DivCmd mappings derived directly from Furnace source:
 *   third-party/furnace-master/src/engine/sysDef.cpp
 *
 * Each chip has its own effectHandlerMap (pre-note-on) and postEffectHandlerMap
 * (post-note-on). Currently DEViLBOX processes all effects together.
 *
 * Effect ranges:
 * - 0x00-0x0F: Standard effects (common to all chips, handled by routeEffect)
 * - 0x10-0x6F: Chip-specific effects (meaning varies by platform)
 * - 0x80-0xFF: Global effects (handled by TrackerReplayer, not this router)
 */

import { DivCmd, FurnaceDispatchPlatform } from './FurnaceDispatchEngine';
import type { ImportMetadata } from '../../types/tracker';
import {
  FURNACE_EFFECT_POOL,
  FURNACE_EFFECT_TABLE,
  type FurnaceEffectEntry,
} from './furnaceEffectTable.gen';

/**
 * Dispatch command result from effect routing
 */
export interface DispatchCommand {
  cmd: number;
  chan: number;
  val1: number;
  val2: number;
}

/**
 * FurnaceEffectRouter class
 * Routes tracker effects to platform-specific dispatch commands
 *
 * Effect handler maps sourced from sysDef.cpp — all chip-specific
 * effect codes are mapped exactly as defined in Furnace source.
 */
export class FurnaceEffectRouter {
  private platformType: number;

  // Effect memory per channel (Furnace-style parameter persistence)
  private effectMemory: Map<number, Map<number, number>> = new Map();

  // Furnace compatibility flags for legacy behavior
  private _compatFlags: NonNullable<NonNullable<ImportMetadata['furnaceData']>['compatFlags']> = {};

  constructor(platformType: number = FurnaceDispatchPlatform.GB) {
    this.platformType = platformType;
  }

  /**
   * Set the active platform
   */
  setPlatform(platformType: number): void {
    this.platformType = platformType;
  }

  /**
   * Set compatibility flags from ImportMetadata
   */
  setCompatFlags(metadata: ImportMetadata | undefined): void {
    this._compatFlags = metadata?.furnaceData?.compatFlags || {};
  }

  /**
   * Get current compatibility flags (for external queries)
   */
  getCompatFlags(): NonNullable<NonNullable<ImportMetadata['furnaceData']>['compatFlags']> {
    return this._compatFlags;
  }

  private getMemory(chan: number, effect: number): number {
    return this.effectMemory.get(chan)?.get(effect) ?? 0;
  }

  private setMemory(chan: number, effect: number, value: number): void {
    if (!this.effectMemory.has(chan)) {
      this.effectMemory.set(chan, new Map());
    }
    this.effectMemory.get(chan)!.set(effect, value);
  }

  resetMemory(): void {
    this.effectMemory.clear();
  }

  /**
   * Route an effect to dispatch commands
   */
  routeEffect(platform: number, chan: number, effect: number, param: number): DispatchCommand[] {
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }
    const commands: DispatchCommand[] = [];

    // Use parameter memory if param is 0
    if (param === 0) {
      param = this.getMemory(chan, effect);
    } else {
      this.setMemory(chan, effect, param);
    }

    const x = (param >> 4) & 0x0F;
    const y = param & 0x0F;

    // Standard effects (0x00-0x0F, all platforms)
    switch (effect) {
      case 0x00: // Arpeggio
        if (param !== 0) {
          commands.push({ cmd: DivCmd.HINT_ARPEGGIO, chan, val1: x, val2: y });
        }
        break;

      case 0x01: // Pitch slide up
        commands.push({ cmd: DivCmd.PITCH, chan, val1: param, val2: 0 });
        break;

      case 0x02: // Pitch slide down
        commands.push({ cmd: DivCmd.PITCH, chan, val1: -param, val2: 0 });
        break;

      case 0x03: // Tone portamento
        commands.push({ cmd: DivCmd.NOTE_PORTA, chan, val1: param, val2: 1 });
        break;

      case 0x04: // Vibrato
        commands.push({ cmd: DivCmd.HINT_VIBRATO, chan, val1: x, val2: y });
        break;

      case 0x05: // Vibrato + volume slide
        commands.push({ cmd: DivCmd.HINT_VIBRATO, chan, val1: 0, val2: 0 });
        // Upstream: volSpeed = y!=0 ? -(y*64) : x*64 (playback.cpp:1120-1124)
        if (param !== 0) {
          const volSpeed = y !== 0 ? -(y * 64) : x * 64;
          commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: volSpeed, val2: 0 });
        }
        break;

      case 0x06: // Portamento + volume slide
        commands.push({ cmd: DivCmd.HINT_PORTA, chan, val1: 0, val2: 0 });
        if (param !== 0) {
          const volSpeed = y !== 0 ? -(y * 64) : x * 64;
          commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: volSpeed, val2: 0 });
        }
        break;

      case 0x07: // Tremolo
        commands.push({ cmd: DivCmd.HINT_TREMOLO, chan, val1: x, val2: y });
        break;

      case 0x08: // Panning (split 4-bit: high nibble = left, low nibble = right)
        // Upstream: panL = (val>>4)|(val&0xf0), panR = (val&15)|((val&15)<<4)
        // Maps 0-F nibble to 0x00, 0x11, 0x22, ... 0xFF
        {
          const panL = (param >> 4) | (param & 0xf0);
          const panR = (param & 15) | ((param & 15) << 4);
          commands.push({ cmd: DivCmd.PANNING, chan, val1: panL, val2: panR });
          commands.push({ cmd: DivCmd.HINT_PANNING, chan, val1: panL, val2: panR });
        }
        break;

      case 0x0A: // Volume slide
        // Upstream: volSpeed = y!=0 ? -(y*64) : x*64 (playback.cpp:1206-1211)
        if (param !== 0) {
          const volSpeed = y !== 0 ? -(y * 64) : x * 64;
          commands.push({ cmd: DivCmd.HINT_VOL_SLIDE, chan, val1: volSpeed, val2: 0 });
        }
        break;

      case 0x0B: // Position jump — handled by sequencer, no chip dispatch
        break;

      case 0x0C: // Set volume
        commands.push({ cmd: DivCmd.VOLUME, chan, val1: param, val2: 0 });
        commands.push({ cmd: DivCmd.HINT_VOLUME, chan, val1: param, val2: 0 });
        break;

      case 0x0D: // Pattern break — handled by sequencer, no chip dispatch
        break;

      // Note: 0x0E is NOT used in Furnace (no MOD-style Exy sub-effects).
      // Effects like E1y, EAy etc. don't exist in Furnace's effect space.

      // Platform-specific effects (0x10+)
      default:
        commands.push(...this.routePlatformEffect(this.platformType, chan, effect, param));
        break;
    }

    return commands;
  }

  /**
   * Route platform-specific effects (0x10+) from Furnace's own per-system maps
   * (furnaceEffectTable.gen.ts, generated from sysDef.cpp). Platform id = DivSystem id.
   * Order follows DivEngine: pre-effect always runs; then the effect map, and the
   * post map only when the effect map did not handle it.
   */
  routePlatformEffect(platform: number, chan: number, effect: number, param: number): DispatchCommand[] {
    if (platform !== this.platformType) {
      this.setPlatform(platform);
    }
    const sys = FURNACE_EFFECT_TABLE[platform];
    if (!sys) return [];
    const commands: DispatchCommand[] = [];
    const emit = (entry: FurnaceEffectEntry | undefined): boolean => {
      if (!entry) return false;
      const [cmd, valIdx, val2Idx] = entry;
      const val1 = valIdx < 0 ? param : FURNACE_EFFECT_POOL[valIdx][param];
      const val2 = val2Idx < 0 ? 0 : FURNACE_EFFECT_POOL[val2Idx][param];
      if (val1 === null || val2 === null) return false; // Furnace: DivDoNotHandleEffect
      commands.push({ cmd, chan, val1, val2 });
      return true;
    };
    emit(sys.pre[effect]);
    if (!emit(sys.effect[effect])) emit(sys.post[effect]);
    return commands;
  }

  /**
   * Clear all effect memory
   */
  clearMemory(): void {
    this.effectMemory.clear();
  }

  /**
   * Clear effect memory for a specific channel
   */
  clearChannelMemory(chan: number): void {
    this.effectMemory.delete(chan);
  }
}

// Export lazy-initialized singleton to avoid circular dependency issues
let _furnaceEffectRouterInstance: FurnaceEffectRouter | null = null;

export function getFurnaceEffectRouter(): FurnaceEffectRouter {
  if (!_furnaceEffectRouterInstance) {
    _furnaceEffectRouterInstance = new FurnaceEffectRouter();
  }
  return _furnaceEffectRouterInstance;
}

// Legacy export for backwards compatibility (lazy proxy)
export const furnaceEffectRouter = new Proxy({} as FurnaceEffectRouter, {
  get(_target, prop: string | symbol) {
    return (getFurnaceEffectRouter() as unknown as Record<string | symbol, unknown>)[prop];
  },
  set(_target, prop: string | symbol, value: unknown) {
    (getFurnaceEffectRouter() as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  }
});
