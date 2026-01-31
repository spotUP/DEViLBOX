import React, { useState } from 'react';
import type { InstrumentConfig, MAMEConfig } from '@typedefs/instrument';
import { DEFAULT_MAME_VFX, DEFAULT_MAME_DOC, DEFAULT_MAME_RSA } from '@typedefs/instrument';
import { MAMEControls } from '../controls/MAMEControls';
import { getToneEngine } from '@engine/ToneEngine';
import { EditorHeader, type VizMode } from '../shared/EditorHeader';

interface VisualMAMEEditorProps {  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

export const VisualMAMEEditor: React.FC<VisualMAMEEditorProps> = ({
  instrument,
  onChange,
}) => {
  const [vizMode, setVizMode] = useState<VizMode>('oscilloscope');

  const mameConfig = instrument.mame || (
    instrument.synthType === 'MAMEDOC' ? DEFAULT_MAME_DOC :
    instrument.synthType === 'MAMERSA' ? DEFAULT_MAME_RSA :
    DEFAULT_MAME_VFX
  );

  const handleMAMEChange = (updates: Partial<MAMEConfig>) => {
    onChange({
      mame: { ...mameConfig, ...updates },
    });
  };

  return (
    <div className="synth-editor-container bg-gradient-to-b from-[#1e1e1e] to-[#151515]">
      <EditorHeader
        instrument={instrument}
        onChange={onChange}
        vizMode={vizMode}
        onVizModeChange={setVizMode}
        showHelpButton={false}
      />

      <div className="synth-editor-content overflow-y-auto p-4">
        <MAMEControls
          config={mameConfig}
          handle={getToneEngine().getMAMESynthHandle(instrument.id)}
          onChange={handleMAMEChange}
        />
      </div>
    </div>
  );
};
