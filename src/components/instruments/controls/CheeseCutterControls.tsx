import React, { useMemo } from 'react';
import { UnifiedSIDEditor } from '../sid/UnifiedSIDEditor';
import { CheeseCutterAdapter } from '../sid/adapters/CheeseCutterAdapter';
import { useCheeseCutterStore } from '@stores/useCheeseCutterStore';

interface Props {
  instrumentIndex?: number;
}

export const CheeseCutterControls: React.FC<Props> = () => {
  const currentInstrument = useCheeseCutterStore(s => s.currentInstrument);

  const adapter = useMemo(() => new CheeseCutterAdapter(), []);

  return <UnifiedSIDEditor adapter={adapter} key={currentInstrument} />;
};
