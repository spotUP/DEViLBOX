import { useRef, useEffect, useCallback } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';

export interface GeneratorEditorProps {
  config: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

/**
 * Section header component for consistency with VisualSynthEditor
 */
export function SectionHeader({ color, title }: { color: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h3>
    </div>
  );
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
