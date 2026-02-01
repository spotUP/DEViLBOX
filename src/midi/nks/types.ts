/**
 * Native Kontrol Standard (NKS) Types
 * 
 * Implements Native Instruments' NKS specification for:
 * - Hardware controller integration (Komplete Kontrol, Maschine)
 * - Preset management (.nksf format)
 * - Parameter mapping and display
 * - Browser integration
 */

/**
 * NKS Parameter Types
 * Used for categorizing parameters in the NI ecosystem
 */
export const NKSParameterType = {
  FLOAT: 0,      // Continuous value (0.0 - 1.0)
  INT: 1,        // Discrete integer
  BOOLEAN: 2,    // On/Off switch
  SELECTOR: 3,   // Enumerated list
} as const;

export type NKSParameterType = typeof NKSParameterType[keyof typeof NKSParameterType];

/**
 * NKS Parameter Sections
 * Standard NI categories for organizing parameters
 */
export const NKSSection = {
  SYNTHESIS: 'Synthesis',
  FILTER: 'Filter',
  ENVELOPE: 'Envelope',
  LFO: 'LFO',
  EFFECTS: 'Effects',
  MODULATION: 'Modulation',
  SEQUENCER: 'Sequencer',
  ARP: 'Arpeggiator',
  MACRO: 'Macro',
  MIXER: 'Mixer',
  OUTPUT: 'Output',
} as const;

export type NKSSection = typeof NKSSection[keyof typeof NKSSection];

/**
 * NKS Parameter Definition
 * Maps a DEViLBOX parameter to NKS structure
 */
export interface NKSParameter {
  id: string;                    // Unique parameter ID
  name: string;                  // Display name (max 31 chars)
  section: NKSSection;           // Parameter category
  type: NKSParameterType;        // Value type
  
  // Value range
  min: number;
  max: number;
  defaultValue: number;
  
  // Display formatting
  unit?: string;                 // e.g., "Hz", "dB", "%"
  formatString?: string;         // e.g., "%.1f Hz"
  
  // Enumerated values (for SELECTOR type)
  valueStrings?: string[];
  
  // Page assignment (8 parameters per page)
  page: number;                  // 0-based page index
  index: number;                 // 0-7 position on page
  
  // MIDI CC mapping (optional)
  ccNumber?: number;
  
  // Automation
  isAutomatable: boolean;
  isHidden?: boolean;            // Hidden from NI browser but still controllable
}

/**
 * NKS Page Definition
 * Each page contains up to 8 parameters displayed on hardware
 */
export interface NKSPage {
  id: string;
  name: string;                  // Page name (displayed on hardware)
  parameters: NKSParameter[];    // Up to 8 parameters
}

/**
 * NKS Preset Metadata
 * Information stored in .nksf files and plugin.json
 */
export interface NKSPresetMetadata {
  vendor: string;                // "DEViLBOX"
  uuid: string;                  // Unique plugin identifier
  version: string;               // Plugin version
  name: string;                  // Preset name
  author?: string;               // Preset author
  comment?: string;              // Preset description
  deviceType?: string;           // e.g., "INST", "FX"
  
  // Bank organization
  bankChain: string[];           // e.g., ["Bass", "Synth Bass", "TB-303"]
  
  // Search tags (NKS Content)
  types?: string[];              // e.g., ["Bass", "Synth"]
  modes?: string[];              // e.g., ["Monophonic", "Analog"]
  
  // Additional metadata
  tempo?: number;
  isUser?: boolean;              // User preset vs factory
  isFavorite?: boolean;
}

/**
 * NKS Preset File (.nksf)
 * Complete preset including metadata and parameter values
 */
export interface NKSPreset {
  metadata: NKSPresetMetadata;
  parameters: Record<string, number>;  // Parameter ID -> value
  blob?: ArrayBuffer;                  // Raw plugin state (optional)
}

/**
 * NKS Controller Display Info
 * Information sent to hardware displays
 */
export interface NKSDisplayInfo {
  pluginName: string;
  presetName: string;
  currentPage: number;
  totalPages: number;
  parameters: Array<{
    name: string;
    value: string;                     // Formatted value string
    isChanged: boolean;                // Highlight if changed from default
  }>;
}

/**
 * NKS Light Guide Color
 * LED colors for Komplete Kontrol keyboard light guide
 */
export const NKSLightGuideColor = {
  OFF: 0,
  WHITE: 1,
  RED: 2,
  ORANGE: 3,
  YELLOW: 4,
  GREEN: 5,
  CYAN: 6,
  BLUE: 7,
  PURPLE: 8,
  MAGENTA: 9,
} as const;

export type NKSLightGuideColor = typeof NKSLightGuideColor[keyof typeof NKSLightGuideColor];

/**
 * NKS Key Light Info
 * Light guide state for a single key
 */
export interface NKSKeyLight {
  note: number;                  // MIDI note (0-127)
  color: NKSLightGuideColor;
  brightness: number;            // 0.0 - 1.0
}

/**
 * NKS Controller Capabilities
 * Features supported by connected hardware
 */
export interface NKSControllerInfo {
  id: string;
  name: string;
  vendor: string;
  
  // Hardware features
  hasDisplay: boolean;
  displayLines: number;          // Number of text lines (2 or 4)
  displayChars: number;          // Characters per line (72 or 144)
  
  hasLightGuide: boolean;
  lightGuideKeys: number;        // Number of keys with LEDs
  
  hasKnobs: boolean;
  knobCount: number;             // Usually 8
  
  hasButtons: boolean;
  hasPads: boolean;
  
  // Transport controls
  hasTransport: boolean;
  hasJogWheel: boolean;
  
  // Browser controls
  hasBrowserControls: boolean;
  
  // Touch strip
  hasTouchStrip: boolean;
}

/**
 * NKS Host Integration
 * Communication with DAW host (when running as plugin)
 */
export interface NKSHostInfo {
  name: string;                  // Host DAW name
  version: string;
  tempo: number;
  isPlaying: boolean;
  timeSigNumerator: number;
  timeSigDenominator: number;
  
  // For VST3/AU plugin mode
  canSendToHost?: boolean;
}

/**
 * Plugin.json Structure
 * NKS metadata file for plugin identification
 */
export interface PluginJson {
  // Required fields
  author: string;
  name: string;
  vendor: string;
  version: string;
  uuid: string;                  // Must be globally unique
  
  // Optional fields
  url?: string;
  short_name?: string;
  description?: string;
  
  // NI specific
  ni_hw_integration?: {
    device_type: 'INST' | 'FX';
    num_pages: number;
  };
}

/**
 * NKS File Format Constants
 */
export const NKS_CONSTANTS = {
  MAGIC_NKSF: 0x4E4B5346,        // "NKSF" file header
  MAGIC_NISI: 0x4E495349,        // "NISI" chunk (NI Sound Info)
  MAGIC_NIKA: 0x4E494B41,        // "NIKA" chunk (NI Kontrol)
  MAGIC_PLUG: 0x504C5547,        // "PLUG" chunk (Plugin state)
  
  VERSION_MAJOR: 1,
  VERSION_MINOR: 0,
  
  MAX_PARAM_NAME_LENGTH: 31,
  MAX_PRESET_NAME_LENGTH: 127,
  MAX_PARAMETERS_PER_PAGE: 8,
  
  VENDOR_ID: 'DEViLBOX',
  PLUGIN_UUID: 'devilbox-tracker-v1',  // Update when format changes
};
