import React, { useMemo, useRef, useEffect } from 'react';
import { UnifiedSIDEditor } from '../sid/UnifiedSIDEditor';
import { GTUltraAdapter } from '../sid/adapters/GTUltraAdapter';
import type { GTUltraConfig } from '@typedefs/instrument/exotic';

interface Props {
  config: GTUltraConfig;
  onChange: (updates: Partial<GTUltraConfig>) => void;
}

export const GTUltraUnifiedControls: React.FC<Props> = ({ config, onChange }) => {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const adapter = useMemo(
    () => new GTUltraAdapter(config, (u) => onChangeRef.current(u)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  adapter.updateConfig(config);

  return <UnifiedSIDEditor adapter={adapter} />;
};
