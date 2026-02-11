/**
 * NKS (Native Kontrol Standard) Integration
 *
 * Complete implementation of Native Instruments' NKS/NKS2 specification v2.0.2
 */

// Core types and constants
export * from './types';

// File format (RIFF/NIKS with msgpack)
export * from './NKSFileFormat';
export { msgpackEncode, msgpackDecode } from './msgpack';

// Parameter maps and routing
export * from './synthParameterMaps';
export * from './parameterRouter';
export * from './autoParameterMap';

// State management
export * from './NKSManager';

// Hardware integration
export * from './NKSHIDProtocol';
export * from './NKSHardwareController';

// Preset integration and taxonomy
export * from './presetIntegration';
export * from './nksTaxonomy';

// Preview system
export * from './NKSPreviewSystem';

// Artwork and visual identity
export * from './NKSArtwork';

// Accessibility
export * from './NKSAccessibility';

// Deployment and registry
export * from './NKSDeployment';

// ============================================================================
// Convenience re-exports
// ============================================================================

export { useNKSStore, getNKSManager } from './NKSManager';
export {
  getNKSParametersForSynth,
  buildNKSPages,
  formatNKSValue,
  SYNTH_PARAMETER_MAPS,
  TB303_NKS_PARAMETERS,
  DEXED_NKS_PARAMETERS,
  OBXD_NKS_PARAMETERS,
} from './synthParameterMaps';
export { parseNKSF, writeNKSF, loadNKSF, downloadNKSF, verifyNKSF } from './NKSFileFormat';
export { getNKSHardwareController, isNKSHardwareAvailable } from './NKSHardwareController';
export {
  isHIDSupported,
  getPairedDevices,
  NI_VENDOR_ID,
  AKAI_VENDOR_ID,
  ARTURIA_VENDOR_ID,
  NEKTAR_VENDOR_ID,
  M_AUDIO_VENDOR_ID,
  STUDIOLOGIC_VENDOR_ID,
  ICON_VENDOR_ID,
  ALESIS_VENDOR_ID,
  NI_PRODUCT_IDS,
  AKAI_PRODUCT_IDS,
  ARTURIA_PRODUCT_IDS,
  NEKTAR_PRODUCT_IDS,
  M_AUDIO_PRODUCT_IDS,
  STUDIOLOGIC_PRODUCT_IDS,
  ICON_PRODUCT_IDS,
  ALESIS_PRODUCT_IDS,
  NKS_BUTTONS,
} from './NKSHIDProtocol';
export {
  generatePreview,
  generatePreviewFromBuffer,
  isPreviewGenerationSupported,
  getPreviewFilename,
  downloadPreview,
} from './NKSPreviewSystem';
export {
  NKS_ARTWORK_SPECS,
  DEVILBOX_ARTWORK,
  DEVILBOX_RESOURCES,
  getControlColor,
  getDeploymentManifest,
  validateArtworkAsset,
} from './NKSArtwork';
export {
  setAccessibilityEnabled,
  isAccessibilityEnabled,
  speak,
  announceParameter,
  announceParameterChange,
  getAriaAttributes,
} from './NKSAccessibility';
export {
  generateServiceCenterXML,
  generateWindowsRegistry,
  generateMacOSPlist,
  getDefaultDeploymentConfig,
  generateDeploymentManifest,
  incrementContentVersion,
} from './NKSDeployment';
