import { GUITARML_MODEL_REGISTRY } from "./guitarMLRegistry-CdfjBfrw.js";
class NeuralParameterMapper {
  modelIndex;
  schema;
  constructor(modelIndex) {
    this.modelIndex = modelIndex;
    const model = GUITARML_MODEL_REGISTRY[modelIndex];
    this.schema = (model == null ? void 0 : model.parameters) || {};
  }
  /**
   * Get all available parameters for this model
   * Returns array of parameter info with keys for UI rendering
   */
  getAvailableParameters() {
    return Object.entries(this.schema).filter(([, param]) => param !== void 0).map(([key, param]) => ({
      key,
      ...param,
      implemented: this.isImplemented(key)
    }));
  }
  /**
   * Get parameter info by key
   */
  getParameter(key) {
    const param = this.schema[key];
    if (!param) return null;
    return {
      ...param,
      implemented: this.isImplemented(key)
    };
  }
  /**
   * Map UI parameter to GuitarML condition value (0-1)
   * For now, primary control goes to condition
   * Priority: drive > gain > tone
   */
  mapToCondition(params) {
    if (params.drive !== void 0) return params.drive / 100;
    if (params.gain !== void 0) return params.gain / 100;
    if (params.tone !== void 0) return params.tone / 100;
    return 0.5;
  }
  /**
   * Check if parameter is fully implemented in NeuralEffectWrapper
   * bass/mid/treble/tone/presence are implemented via EQ nodes (User Decision #1)
   */
  isImplemented(paramKey) {
    const implemented = [
      "drive",
      "gain",
      "tone",
      "bass",
      "mid",
      "treble",
      "presence",
      "level",
      "output",
      "dryWet"
    ];
    return implemented.includes(paramKey);
  }
  /**
   * Get parameter count for this model
   */
  getParameterCount() {
    return Object.keys(this.schema).length;
  }
  /**
   * Get model name
   */
  getModelName() {
    const model = GUITARML_MODEL_REGISTRY[this.modelIndex];
    return (model == null ? void 0 : model.name) || "Unknown Model";
  }
  /**
   * Get model full name
   */
  getModelFullName() {
    const model = GUITARML_MODEL_REGISTRY[this.modelIndex];
    return (model == null ? void 0 : model.fullName) || (model == null ? void 0 : model.name) || "Unknown Model";
  }
  /**
   * Get model category
   */
  getModelCategory() {
    const model = GUITARML_MODEL_REGISTRY[this.modelIndex];
    return (model == null ? void 0 : model.category) || "effect";
  }
  /**
   * Check if model has EQ parameters
   */
  hasEQ() {
    return !!(this.schema.bass || this.schema.mid || this.schema.treble);
  }
  /**
   * Get default parameter values
   */
  getDefaultParameters() {
    const defaults = {};
    Object.entries(this.schema).forEach(([key, param]) => {
      if (param) {
        defaults[key] = param.default;
      }
    });
    return defaults;
  }
}
export {
  NeuralParameterMapper as N
};
