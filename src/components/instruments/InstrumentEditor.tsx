import React from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { GenericSynthEditor } from './GenericSynthEditor';
import type { InstrumentConfig } from '@typedefs/instrument';

/**
 * InstrumentEditor - Modern instrument editing interface
 * This component acts as a wrapper that chooses the best specialized editor
 * based on the instrument's synth type.
 */

interface InstrumentEditorProps {
  instrumentId: number;
}

export const InstrumentEditor: React.FC<InstrumentEditorProps> = ({ instrumentId }) => {
  const { currentInstrument, updateInstrument } = useInstrumentStore();

  // If an instrumentId is passed, prioritize it to find the current instrument
  const instrumentToEdit = instrumentId !== undefined
    ? useInstrumentStore(state => state.instruments.find(inst => inst.id === instrumentId))
    : currentInstrument;

  if (!instrumentToEdit) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg text-text-muted">
        <div className="text-center">
          <p className="text-lg mb-2">No instrument selected</p>
          <p className="text-sm">Create or select an instrument to edit</p>
        </div>
      </div>
    );
  }

  // Handle changes from editor
  const handleChange = (updates: Partial<InstrumentConfig>) => {
    updateInstrument(instrumentToEdit.id, updates);
  };

  // Use the universal GenericSynthEditor which now delegates to modern visual editors
  return (
    <GenericSynthEditor
      instrument={instrumentToEdit}
      onChange={handleChange}
    />
  );
};
