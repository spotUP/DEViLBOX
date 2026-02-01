/**
 * NKS (Native Kontrol Standard) Integration
 * 
 * Complete implementation of Native Instruments' NKS specification
 */

export * from './types';
export * from './NKSFileFormat';
export * from './parameterMap';
export * from './NKSManager';
export * from './NKSHIDProtocol';
export * from './NKSHardwareController';

// Convenience exports
export { useNKSStore, getNKSManager } from './NKSManager';
export { TB303_NKS_PARAMETERS, TB303_NKS_PAGES } from './parameterMap';
export { parseNKSF, writeNKSF, loadNKSF, downloadNKSF } from './NKSFileFormat';
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
  NKS_BUTTONS 
} from './NKSHIDProtocol';
