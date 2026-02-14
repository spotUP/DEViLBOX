/**
 * ModuleRegistry - Static registry for modular synth modules
 *
 * Central registry for all available module types (VCO, VCF, LFO, etc.).
 * Mirrors the pattern of SynthRegistry for consistency.
 *
 * Usage:
 *   ModuleRegistry.register(vcoDescriptor);
 *   const vco = ModuleRegistry.get('VCO');
 *   const allSources = ModuleRegistry.getByCategory('source');
 */

import type { ModuleDescriptor, ModuleCategory } from '../../types/modular';

class ModuleRegistryClass {
  private modules = new Map<string, ModuleDescriptor>();

  /**
   * Register a module descriptor
   */
  register(descriptor: ModuleDescriptor): void {
    if (this.modules.has(descriptor.id)) {
      console.warn(`[ModuleRegistry] Module "${descriptor.id}" already registered, overwriting`);
    }
    this.modules.set(descriptor.id, descriptor);
  }

  /**
   * Get a module descriptor by ID
   */
  get(id: string): ModuleDescriptor | undefined {
    return this.modules.get(id);
  }

  /**
   * Get all registered module descriptors
   */
  getAll(): ModuleDescriptor[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get modules by category
   */
  getByCategory(category: ModuleCategory): ModuleDescriptor[] {
    return this.getAll().filter((m) => m.category === category);
  }

  /**
   * Check if a module ID is registered
   */
  has(id: string): boolean {
    return this.modules.has(id);
  }

  /**
   * Clear all registered modules (for testing)
   */
  clear(): void {
    this.modules.clear();
  }
}

export const ModuleRegistry = new ModuleRegistryClass();
