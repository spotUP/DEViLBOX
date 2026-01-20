/**
 * GenericSynthEditor - Universal parameter editor for all synth types
 * Uses modern visual editors (VisualTB303Editor and VisualSynthEditor)
 */

import React from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { VisualTB303Editor } from './VisualTB303Editor';
import { VisualSynthEditor } from './VisualSynthEditor';

interface GenericSynthEditorProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const GenericSynthEditor: React.FC<GenericSynthEditorProps> = ({
  instrument,
  onChange,
}) => {
  // Use specialized editor for TB-303
  if (instrument.synthType === 'TB303' && instrument.tb303) {
    return (
      <VisualTB303Editor
        config={instrument.tb303}
        onChange={(updates) => onChange({ tb303: { ...instrument.tb303!, ...updates } })}
      />
    );
  }

  // Use modern visual editor for all other synth types
  return (
    <VisualSynthEditor
      instrument={instrument}
      onChange={onChange}
    />
  );
};