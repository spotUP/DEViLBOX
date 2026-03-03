import React from 'react';
import type { GeneratorEditorProps } from './shared';

import { FSMKickEditor, FSMKickXPEditor, OomekAggressorEditor } from './DrumEditors';
import { JeskolaTrilokEditor, JeskolaNoiseEditor, CyanPhaseDTMFEditor, ElenzilFrequencyBombEditor } from './OscillatorEditors';
import { MadBrain4FM2FEditor, MadBrainDynamite6Editor, MakkM3Editor, MakkM4Editor } from './FMEditors';
import { JeskolaDelayEditor, JeskolaCrossDelayEditor, JeskolaFreeverbEditor, JeskolaDistortionEditor } from './FXEditors';

// Re-export everything
export { FSMKickEditor, FSMKickXPEditor, OomekAggressorEditor } from './DrumEditors';
export { JeskolaTrilokEditor, JeskolaNoiseEditor, CyanPhaseDTMFEditor, ElenzilFrequencyBombEditor } from './OscillatorEditors';
export { MadBrain4FM2FEditor, MadBrainDynamite6Editor, MakkM3Editor, MakkM4Editor } from './FMEditors';
export { JeskolaDelayEditor, JeskolaCrossDelayEditor, JeskolaFreeverbEditor, JeskolaDistortionEditor } from './FXEditors';
export type { GeneratorEditorProps } from './shared';
export { SectionHeader, useBuzzmachineParam } from './shared';

type EditorComponent = React.FC<GeneratorEditorProps>;

const BUZZMACHINE_EDITORS: Record<string, EditorComponent> = {
  // Generators
  'CyanPhaseDTMF': CyanPhaseDTMFEditor,
  'ElenzilFrequencyBomb': ElenzilFrequencyBombEditor,
  'FSMKick': FSMKickEditor,
  'FSMKickXP': FSMKickXPEditor,
  'JeskolaNoise': JeskolaNoiseEditor,
  'JeskolaTrilok': JeskolaTrilokEditor,
  'MadBrain4FM2F': MadBrain4FM2FEditor,
  'MadBrainDynamite6': MadBrainDynamite6Editor,
  'MakkM3': MakkM3Editor,
  'MakkM4': MakkM4Editor,
  'OomekAggressor': OomekAggressorEditor,
  // Effects (Jeskola)
  'JeskolaDelay': JeskolaDelayEditor,
  'JeskolaCrossDelay': JeskolaCrossDelayEditor,
  'JeskolaFreeverb': JeskolaFreeverbEditor,
  'JeskolaDistortion': JeskolaDistortionEditor,
};

/**
 * Get the appropriate buzzmachine editor component for a machine type
 * @param machineType The buzzmachine type string
 * @returns The editor component or null if no dedicated editor exists
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getJeskolaEditor(machineType: string): EditorComponent | null {
  return BUZZMACHINE_EDITORS[machineType] || null;
}
