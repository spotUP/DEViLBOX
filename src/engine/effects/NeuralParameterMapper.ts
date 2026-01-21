import { GUITARML_MODEL_REGISTRY } from '@constants/guitarMLRegistry';
import type { EffectParameter } from '@typedefs/pedalboard';

/**
 * NeuralParameterMapper
 *
 * Maps UI parameters to GuitarML/DSP controls for neural effects.
 * Handles dynamic parameter discovery from model schemas.
 *
 * Key Features:
 * - Discovers available parameters from model registry
 * - Maps primary control (drive/gain/tone) to GuitarML condition input
 * - Identifies implemented vs. planned parameters
 * - Provides parameter metadata for UI rendering
 */
export class NeuralParameterMapper {
  private modelIndex: number;
  private schema: Record<string, EffectParameter | undefined>;

  constructor(modelIndex: number) {
    this.modelIndex = modelIndex;
    const model = GUITARML_MODEL_REGISTRY[modelIndex];
    this.schema = model?.parameters || {};
  }

  /**
   * Get all available parameters for this model
   * Returns array of parameter info with keys for UI rendering
   */
  getAvailableParameters(): Array<EffectParameter & { key: string; implemented: boolean }> {
    return Object.entries(this.schema)
      .filter(([, param]) => param !== undefined)
      .map(([key, param]) => ({
        key,
        ...param!,
        implemented: this.isImplemented(key),
      }));
  }

  /**
   * Get parameter info by key
   */
  getParameter(key: string): (EffectParameter & { implemented: boolean }) | null {
    const param = this.schema[key];
    if (!param) return null;

    return {
      ...param,
      implemented: this.isImplemented(key),
    };
  }

  /**
   * Map UI parameter to GuitarML condition value (0-1)
   * For now, primary control goes to condition
   * Priority: drive > gain > tone
   */
  mapToCondition(params: Record<string, number>): number {
    // Priority order for condition mapping
    if (params.drive !== undefined) return params.drive / 100;
    if (params.gain !== undefined) return params.gain / 100;
    if (params.tone !== undefined) return params.tone / 100;
    return 0.5; // Default middle position
  }

  /**
   * Check if parameter is fully implemented in NeuralEffectWrapper
   * bass/mid/treble/tone/presence are implemented via EQ nodes (User Decision #1)
   */
  isImplemented(paramKey: string): boolean {
    const implemented = [
      'drive',
      'gain',
      'tone',
      'bass',
      'mid',
      'treble',
      'presence',
      'level',
      'output',
      'dryWet',
    ];
    return implemented.includes(paramKey);
  }

  /**
   * Get parameter count for this model
   */
  getParameterCount(): number {
    return Object.keys(this.schema).length;
  }

  /**
   * Get model name
   */
  getModelName(): string {
    const model = GUITARML_MODEL_REGISTRY[this.modelIndex];
    return model?.name || 'Unknown Model';
  }

  /**
   * Get model full name
   */
  getModelFullName(): string {
    const model = GUITARML_MODEL_REGISTRY[this.modelIndex];
    return model?.fullName || model?.name || 'Unknown Model';
  }

  /**
   * Get model category
   */
  getModelCategory(): string {
    const model = GUITARML_MODEL_REGISTRY[this.modelIndex];
    return model?.category || 'effect';
  }

  /**
   * Check if model has EQ parameters
   */
  hasEQ(): boolean {
    return !!(this.schema.bass || this.schema.mid || this.schema.treble);
  }

  /**
   * Get default parameter values
   */
  getDefaultParameters(): Record<string, number> {
    const defaults: Record<string, number> = {};
    Object.entries(this.schema).forEach(([key, param]) => {
      if (param) {
        defaults[key] = param.default;
      }
    });
    return defaults;
  }
}
