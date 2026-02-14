/**
 * SynthRegistry - Central registry for all synth descriptors
 *
 * Replaces InstrumentFactory's switch statement and ToneEngine's instanceof chains.
 * Supports eager and lazy loading of synth descriptors.
 */

import type { SynthDescriptor } from './SynthDescriptor';

export class SynthRegistry {
  private static descriptors = new Map<string, SynthDescriptor>();
  private static lazyLoaders = new Map<string, () => Promise<void>>();
  private static loadingPromises = new Map<string, Promise<void>>();

  /**
   * Register one or more synth descriptors (eager registration).
   */
  static register(desc: SynthDescriptor | SynthDescriptor[]): void {
    const descriptors = Array.isArray(desc) ? desc : [desc];
    for (const d of descriptors) {
      this.descriptors.set(d.id, d);
    }
  }

  /**
   * Register a lazy loader for a set of synth IDs.
   * The loader function is called on first `ensure(id)` and should call `register()` internally.
   */
  static registerLazy(ids: string[], loader: () => Promise<void>): void {
    for (const id of ids) {
      this.lazyLoaders.set(id, loader);
    }
  }

  /**
   * Get a descriptor if already registered (does NOT trigger lazy loading).
   */
  static get(id: string): SynthDescriptor | undefined {
    return this.descriptors.get(id);
  }

  /**
   * Ensure a descriptor is loaded — triggers lazy loading if needed.
   * Returns the descriptor or undefined if the id is unknown.
   */
  static async ensure(id: string): Promise<SynthDescriptor | undefined> {
    // Already registered
    const existing = this.descriptors.get(id);
    if (existing) return existing;

    // Check for lazy loader
    const loader = this.lazyLoaders.get(id);
    if (!loader) return undefined;

    // Deduplicate concurrent loads of the same loader
    let promise = this.loadingPromises.get(id);
    if (!promise) {
      promise = loader().then(() => {
        // Clean up all IDs that share this loader
        for (const [lid, ldr] of this.lazyLoaders.entries()) {
          if (ldr === loader) {
            this.lazyLoaders.delete(lid);
            this.loadingPromises.delete(lid);
          }
        }
      });
      // Mark all IDs that share this loader as loading
      for (const [lid, ldr] of this.lazyLoaders.entries()) {
        if (ldr === loader) {
          this.loadingPromises.set(lid, promise);
        }
      }
    }

    await promise;
    return this.descriptors.get(id);
  }

  /**
   * Get all registered descriptors (does NOT trigger lazy loading).
   */
  static getAll(): SynthDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * Check if a descriptor is registered (does NOT trigger lazy loading).
   */
  static has(id: string): boolean {
    return this.descriptors.has(id);
  }

  /**
   * Check if a descriptor is registered or has a lazy loader.
   */
  static knows(id: string): boolean {
    return this.descriptors.has(id) || this.lazyLoaders.has(id);
  }

  /**
   * Get all known synth IDs (registered + lazy).
   */
  static getAllIds(): string[] {
    const ids = new Set<string>();
    for (const id of this.descriptors.keys()) ids.add(id);
    for (const id of this.lazyLoaders.keys()) ids.add(id);
    return Array.from(ids);
  }
}
