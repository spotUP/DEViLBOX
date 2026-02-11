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

  // NKS2 extensions (optional, for gradual migration)
  pdi?: NKS2PDI;                 // NKS2 Parameter Display Info
  engineParam?: string;          // Engine routing key (MappableParameter or synth-specific path)
  route?: NKS2ParameterRoute;    // Explicit routing instructions for parameterRouter
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
 * Official 16-color palette per NKS SDK Section 12.2.4
 * Plus Default (16) and Inactive (17) special values
 */
export const NKSLightGuideColor = {
  RED: 0,            // Melodic: keyswitch | Drums: kick
  ORANGE: 1,         // Drums: toms/percussion
  LIGHT_ORANGE: 2,   // Melodic: custom
  WARM_YELLOW: 3,    // Drums: snare
  YELLOW: 4,         // Melodic: custom
  LIME: 5,           // Custom
  GREEN: 6,          // Melodic: custom
  MINT: 7,           // Drums: kick (alternate)
  CYAN: 8,           // Melodic: custom | Drums: hi-hat
  TURQUOISE: 9,      // Default for mapped keys
  BLUE: 10,          // Melodic: custom | Drums: other
  PLUM: 11,          // Custom
  VIOLET: 12,        // Melodic: custom
  PURPLE: 13,        // Custom
  MAGENTA: 14,       // Melodic: custom
  FUCHSIA: 15,       // Drums: claps
  DEFAULT: 16,       // Unassigned default color
  INACTIVE: 17,      // Unmapped keys (LED off)
} as const;

export type NKSLightGuideColor = typeof NKSLightGuideColor[keyof typeof NKSLightGuideColor];

/**
 * NKS Note Mode
 * Per SDK Section 12.1: determines how keys interact with Scale/Arp
 */
export type NKSNoteMode = 'default' | 'control';

/**
 * NKS Key Light Info
 * Light guide state for a single key
 */
export interface NKSKeyLight {
  note: number;                  // MIDI note (0-127)
  color: NKSLightGuideColor;
  brightness: number;            // 0.0 - 1.0
  mode?: NKSNoteMode;           // Default or Control note mode
  name?: string;                // Key name (max 25 chars, title case, Control notes only)
}

/**
 * Drum kit color mapping per NKS SDK Section 12.2.4
 * Maps drum types to their standard light guide colors
 */
export const NKS_DRUM_COLOR_MAP: Record<string, NKSLightGuideColor> = {
  kick: NKSLightGuideColor.RED,
  'kick-alt': NKSLightGuideColor.MINT,
  tom: NKSLightGuideColor.ORANGE,
  percussion: NKSLightGuideColor.ORANGE,
  snare: NKSLightGuideColor.WARM_YELLOW,
  'hi-hat': NKSLightGuideColor.CYAN,
  clap: NKSLightGuideColor.FUCHSIA,
  other: NKSLightGuideColor.BLUE,
};

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
  MAX_PERFORMANCE_PARAMS: 16,     // NKS2: Up to 16 params in Performance mode
  MAX_EDIT_PARAMS_PER_GROUP: 48,  // NKS2: Up to 48 params per Edit group

  VENDOR_ID: 'DEViLBOX',
  PLUGIN_UUID: 'devilbox-tracker-v1',  // Update when format changes
};

// ============================================================================
// NKS2 Type System
// ============================================================================

/**
 * NKS2 PDI (Parameter Display Info) Type
 * Defines how a parameter behaves and is displayed on NI hardware
 */
export type NKS2PDIType =
  | 'continuous'           // Unipolar 0-1 (e.g., volume, cutoff)
  | 'continuous_bipolar'   // Bipolar -1 to +1 (e.g., pan, detune)
  | 'discrete'             // Enumerated values (e.g., waveform: 0,1,2,3)
  | 'discrete_bipolar'     // Bipolar discrete (e.g., transpose: -24 to +24)
  | 'toggle';              // On/Off (e.g., enable, bypass)

/**
 * NKS2 PDI Style
 * Determines the visual control type on NI displays
 */
export type NKS2PDIStyle =
  | 'knob'         // Standard rotary (default for continuous)
  | 'value'        // Numeric value display
  | 'menu'         // Dropdown-style list for small lists (<20 items)
  | 'menuXL'       // Large list (>20 items) with expanded display
  | 'waveform'     // Waveform selector with NI icon library
  | 'filterType'   // Filter type selector with NI icon library
  | 'power'        // On/Off toggle with power icon (default for toggle)
  | 'temposync';   // Tempo sync toggle icon

/**
 * NKS2 Parameter Display Info
 * Full PDI descriptor for hardware rendering
 */
export interface NKS2PDI {
  type: NKS2PDIType;
  style?: NKS2PDIStyle;             // Defaults based on type if omitted
  value_count?: number;              // For discrete: number of possible values
  display_values?: string[];         // For discrete: labels for each value
}

/**
 * NKS2 Parameter Definition
 * Extended parameter with PDI and engine routing
 */
export interface NKS2Parameter {
  id: string;                        // Unique parameter ID (e.g., 'tb303.cutoff')
  name: string;                      // Display name (max 31 chars for NI hardware)
  pdi: NKS2PDI;                      // Parameter Display Info
  defaultValue: number;              // Default value (0-1 normalized)
  unit?: string;                     // Display unit (e.g., "Hz", "dB", "%")
  formatValue?: (value: number) => string;  // Custom value formatter
  ccNumber?: number;                 // MIDI CC number (optional)
  engineParam: string;               // Engine routing key (MappableParameter or synth-specific path)
}

/**
 * NKS2 Performance Section
 * A named group of up to 8 parameters in Performance mode
 * Performance mode shows the most important controls (max 2 sections = 16 params)
 */
export interface NKS2PerformanceSection {
  name: string;                      // Section name (e.g., "Main", "Effects")
  parameters: NKS2Parameter[];       // Up to 8 parameters
}

/**
 * NKS2 Edit Group
 * A deeper parameter group for Edit mode (detailed editing)
 * Each group can have multiple sections
 */
export interface NKS2EditSection {
  name: string;                      // Section name within group
  parameters: NKS2Parameter[];       // Parameters in this section
}

export interface NKS2EditGroup {
  name: string;                      // Group name (e.g., "Oscillator", "Filter")
  sections: NKS2EditSection[];       // Sections within the group
}

/**
 * NKS2 Navigation Structure
 * Organizes parameters into Performance and Edit modes
 */
export interface NKS2Navigation {
  performance: NKS2PerformanceSection[];  // Performance mode (1-2 sections, max 16 params)
  editGroups?: NKS2EditGroup[];           // Edit mode (optional, for deep editing)
}

/**
 * NKS2 Synth Profile
 * Complete NKS2 descriptor for a synth type
 */
export interface NKS2SynthProfile {
  synthType: string;                      // SynthType string
  parameters: NKS2Parameter[];            // All available parameters
  navigation: NKS2Navigation;             // Performance + Edit organization
  controlColor?: number;                  // NI display accent color (0xRRGGBB)
}

/**
 * NKS2 Parameter Route
 * Describes how to apply a parameter value to the synth engine.
 * Used by the parameter router to dispatch changes.
 */
export type NKS2RouteType =
  | 'config'       // Update instrument config via useInstrumentStore.updateInstrument()
  | 'vstbridge'    // Send to VSTBridge WASM via setParameter(id, value)
  | 'wam'          // Send to WAM plugin via audioNode.parameterMap
  | 'tonejs'       // Set Tone.js synth property via instrument.set()
  | 'effect';      // Update effect parameter via useInstrumentStore.updateEffect()

export interface NKS2ParameterRoute {
  type: NKS2RouteType;
  configPath?: string;        // For 'config': dot-path into instrument config (e.g., 'tb303.filter.cutoff')
  vstParamId?: number;        // For 'vstbridge': WASM parameter index
  wamParamId?: string;        // For 'wam': WAM parameter identifier
  tonePath?: string;          // For 'tonejs': Tone.js property path
  effectType?: string;        // For 'effect': effect type to find
  effectParam?: string;       // For 'effect': parameter name within effect
  transform?: (normalized: number) => number;  // Optional value transform (normalized -> engine value)
}

// ============================================================================
// NKS2 Display Value Libraries (SDK Section 11.4)
// ============================================================================

/**
 * Official NKS2 waveform display values with MK3 icon representations.
 * Use as display_values for parameters with PDI style 'waveform'.
 */
export const NKS2_WAVEFORM_DISPLAY_VALUES = [
  'default',
  'sine',
  'square', 'square2', 'square3', 'square4',
  'triangle', 'triangle2', 'triangle3', 'triangle4',
  'saw', 'saw2', 'saw3', 'saw4',
  'noise',
  'pwm',
  'wavetable', 'wavetable2', 'wavetable3', 'wavetable4',
  'complex',
] as const;

export type NKS2WaveformValue = typeof NKS2_WAVEFORM_DISPLAY_VALUES[number];

/**
 * Official NKS2 filter type display values with MK3 icon representations.
 * Use as display_values for parameters with PDI style 'filterType'.
 */
export const NKS2_FILTER_TYPE_DISPLAY_VALUES = [
  'default',
  'hi_pass',
  'resonant_hi_pass',
  'lo_pass',
  'resonant_lo_pass',
  'band_pass',
  'all_pass',
  'bell',
  'prop_q',
  'band_shelf',
  'analog_lo_shelf',
  'analog_hi_shelf',
  'baxandall_lo_shelf',
  'baxandall_hi_shelf',
  'comb',
  'band_reject',
] as const;

export type NKS2FilterTypeValue = typeof NKS2_FILTER_TYPE_DISPLAY_VALUES[number];

/**
 * Common NKS parameter name abbreviations (SDK Section 10.3)
 * Used for hardware display fitting (8 char max on S-series MK1)
 */
export const NKS_PARAM_ABBREVIATIONS: Record<string, string> = {
  'Amount': 'Amt',
  'Amplitude': 'Amp',
  'Brightness': 'Bright',
  'Chorus': 'Chrs',
  'Cutoff': 'Cut',
  'Decay': 'Dec',
  'Distortion': 'Dist',
  'Drive': 'Drv',
  'Envelope': 'Env',
  'Expression': 'Exp',
  'Feedback': 'Fdbk',
  'Filter': 'Flt',
  'Frequency': 'Freq',
  'Intensity': 'Intens',
  'Key Tracking': 'Key Tr',
  'Level': 'Lvl',
  'Master': 'Mst',
  'Modulation': 'Mod',
  'Oscillator': 'Osc',
  'Output': 'Out',
  'Portamento': 'Porta',
  'Release': 'Rel',
  'Resonance': 'Res',
  'Reverb': 'Rev',
  'Sequence': 'Seq',
  'Sustain': 'Sus',
  'Transpose': 'Transp',
  'Tuning': 'Tune',
  'Velocity': 'Vel',
  'Volume': 'Vol',
  'Waveform': 'Wave',
};

// ============================================================================
// NKS Artwork & Visual Identity Types (SDK Section 8)
// ============================================================================

/** Product visual identity assets */
export interface NKSArtworkAssets {
  /** Brand/accent color in #RRGGBB hex format */
  color: string;
  /** NKS2 control color for hardware knob tinting (0xRRGGBB) */
  controlColor?: number;
  /** Product short name (max 12 chars) */
  shortName: string;

  // Deployment artwork paths (relative to PAResources)
  VB_logo?: string;              // 227x47px, white on alpha
  OSO_logo?: string;             // 417x65px, white on alpha
  MST_logo?: string;             // 240x196px, centered
  VB_artwork?: string;           // 96x47px
  MST_artwork?: string;          // 134x66px
  MST_plugin?: string;           // Scaled GUI screenshot (max 190x100px)
  NKS2_Hardware_Banner?: string; // 1280x212px WebP (Kontrol MK3)
  NKS2_hardware_banner_alt?: string; // 1280x152px WebP
  NKS2_software_tile?: string;   // 420x316px WebP
}

/** PAResources deployment structure */
export interface NKSProductResources {
  companyName: string;
  productName: string;
  artwork: NKSArtworkAssets;
  categories?: string[];         // categories.json content
}

// ============================================================================
// NKS Preview System Types (SDK Section 7)
// ============================================================================

/** Preview audio specifications per NKS SDK */
export const NKS_PREVIEW_SPEC = {
  FORMAT: 'ogg',                 // OGG Vorbis required
  MAX_DURATION_S: 6,             // Max 6 seconds
  TARGET_LUFS: -19,              // Normalization target
  PEAK_DB: -3,                   // Peak ceiling
  FOLDER_NAME: '.previews',     // Hidden folder name
  FILE_EXTENSION: '.ogg',       // Extension for preview files
} as const;

/** Preview metadata file structure (previews.generation.json) */
export interface NKSPreviewMetadata {
  product?: string;              // Default MIDI pattern path
  bank?: Record<string, string>;
  subbank?: Record<string, string>;
  preset?: Record<string, string>;
}

/** Default MIDI patterns shipped with NKS SDK */
export const NKS_PREVIEW_MIDI_PATTERNS = {
  'C3_1bar': 'generic/C3 - 1 bar.mid',
  'Pianos': 'generic/Pianos.mid',
  'Organs': 'generic/Organs.mid',
  'SelfGenerating': 'generic/Self-Generating.mid',
} as const;

// ============================================================================
// NKS Deployment Types (SDK Section 13)
// ============================================================================

/** Service Center XML template placeholders */
export interface NKSDeploymentConfig {
  nameOfPlugin: string;          // $NameOfPlugin$
  productName: string;           // $ProductName$
  upid: string;                  // $UPID$ (UUID)
  registryKey: string;           // $RegistryKey$
  binName: string;               // $BinName$
  vstPluginId: string;           // $VSTPluginID$ (hex)
  companyName: string;           // $CompanyName$
  presetLibraryName: string;     // $NameOfPresetLibrary$
  contentDir: string;            // Path to preset files
  contentVersion: string;        // x.x.x.x format (triggers rescan)
}

/** Registry/plist key structure */
export interface NKSRegistryKeys {
  installDir?: string;           // VST plugin directory
  installVST64Dir?: string;      // 64-bit VST directory (Windows)
  contentDir: string;            // Preset file directory
  contentVersion: string;        // x.x.x.x format
}

// ============================================================================
// NKS Accessibility Types (SDK Section 5)
// ============================================================================

/** Accessibility configuration for NKS parameters */
export interface NKSAccessibilityConfig {
  /** Enable text-to-speech for parameter names/values */
  textToSpeechEnabled: boolean;
  /** Hierarchical parameter descriptions for screen readers */
  parameterDescriptions: Record<string, string>;
  /** Group structure for logical navigation */
  groups: Array<{
    name: string;
    description: string;
    parameterIds: string[];
  }>;
}
