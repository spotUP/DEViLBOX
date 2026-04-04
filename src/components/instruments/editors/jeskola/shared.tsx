import { useRef, useEffect, useCallback } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';

export { SectionHeader } from '@components/instruments/shared';

export interface GeneratorEditorProps {
  config: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/**
 * Hook for updating buzzmachine parameters
 */
export const useBuzzmachineParam = (
  config: InstrumentConfig,
  onChange: (updates: Partial<InstrumentConfig>) => void
) => {
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  return useCallback(
    (paramIndex: number, value: number) => {
      const currentParams = configRef.current.buzzmachine?.parameters || {};
      const machineType = configRef.current.buzzmachine?.machineType || 'ArguruDistortion';
      onChange({
        buzzmachine: {
          machineType,
          ...configRef.current.buzzmachine,
          parameters: {
            ...currentParams,
            [paramIndex]: value,
          },
        },
      });
    },
    [onChange]
  );
};
