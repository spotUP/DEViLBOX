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

// NKS2 metadata builder (getNksMetadata structure)
export * from './NKS2MetadataBuilder';

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

// Validation and pre-submission audit
export * from './NKSValidation';

// Leap expansion support
export * from './NKSLeapExpansion';

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
export {
  parseNKSF, writeNKSF, loadNKSF, downloadNKSF, verifyNKSF,
  buildNICAPages, buildFirstPageNICA,
} from './NKSFileFormat';
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
  getUninstallManifest,
} from './NKSDeployment';
export {
  buildNKS2Metadata,
  buildNKS2MetadataFromNKS1,
  validatePageLayout,
  validateNKS2Metadata,
  serializeNKS2Metadata,
  createGap,
  insertDisplayAlignedGaps,
  selectFirstPageParams,
  scoreFirstPageFit,
  FIRST_PAGE_PARADIGM,
  NKS_HARDWARE_DISPLAY_SPECS,
} from './NKS2MetadataBuilder';
export {
  LEAP_KIT_TYPES,
  LEAP_SAMPLE_SPEC,
  LEAP_MACRO_CONFIG,
  LEAP_BACKGROUND_SPEC,
  LEAP_ARTWORK_SPECS,
  LEAP_PREVIEW_SPEC,
  LEAP_EFFECTS_CHAIN,
  isValidLeapKitType,
  formatLeapSampleName,
  parseLeapSampleName,
  createDefaultLeapMacros,
  getLeapPackageStructure,
  validateLeapPackage,
} from './NKSLeapExpansion';
export {
  validatePresetName,
  validateBankChain,
  validateTypeTags,
  validateKeyName,
  validateShortName,
  selectPreviewPattern,
  resolvePreviewPattern,
  calculateMSTPluginDimensions,
  auditNKSProduct,
  NKS_SOURCE_ARTWORK_SPECS,
  NKS_PREVIEW_PATTERNS,
  NKS_PREVIEW_FULL_SPEC,
  NKS_SDK_VERSIONS,
} from './NKSValidation';
