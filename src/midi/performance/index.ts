/**
 * Performance Integration
 *
 * Parameter routing, preset I/O (NKSF format), and Akai MPK Mini display control.
 */

// Core types
export * from './types';

// File format (RIFF/NIKS with msgpack)
export * from './NKSFileFormat';
export { msgpackEncode, msgpackDecode } from './msgpack';

// Parameter maps and routing
export * from './synthParameterMaps';
export * from './parameterRouter';

// Preset integration and taxonomy
export * from './presetIntegration';
export * from './nksTaxonomy';

// Hardware display control (Akai MPK Mini MK3)
export * from './AkaiMIDIProtocol';
