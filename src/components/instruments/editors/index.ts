/**
 * Instrument Editor Components
 * Type-specific editors for different synth types
 */

// Unified Editor (new architecture)
export { UnifiedInstrumentEditor } from './UnifiedInstrumentEditor';

// Legacy editors (for backward compatibility during transition)
export { VisualTB303Editor } from './VisualTB303Editor';
export { VisualSynthEditor } from './VisualSynthEditor';
export { FurnaceEditor } from './FurnaceEditor';
export { BuzzmachineEditor } from './BuzzmachineEditor';
export { getJeskolaEditor, MakkM3Editor, FSMKickEditor, FSMKickXPEditor, JeskolaTrilokEditor } from './JeskolaEditors';

// Tab content rendering (shared between editors)
export { renderGenericTabContent, renderSpecialParameters } from './VisualSynthEditorContent';
