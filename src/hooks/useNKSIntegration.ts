/**
 * NKS Integration Hook
 *
 * Connects NKS hardware control to instrument parameters with bidirectional sync
 */

import { useEffect, useCallback, useRef } from 'react';
import { getNKSHardwareController } from '@/midi/nks/NKSHardwareController';
import { useNKSStore } from '@/midi/nks/NKSManager';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import type { SynthType, InstrumentConfig } from '@typedefs/instrument';

/**
 * Map NKS parameter ID to instrument config path
 * e.g., 'tb303.cutoff' -> ['tb303', 'cutoff']
 */
function parseParameterPath(paramId: string): string[] {
  return paramId.split('.');
}

/**
 * Set nested value in config object (returns new object)
 */
function setConfigValue(
  config: Record<string, unknown>,
  path: string[],
  value: unknown
): Record<string, unknown> {
  if (path.length === 0) return config;

  const [first, ...rest] = path;
  const existing = config[first] as Record<string, unknown> | undefined;

  if (rest.length === 0) {
    return { ...config, [first]: value };
  }

  return {
    ...config,
    [first]: setConfigValue(existing || {}, rest, value),
  };
}

/**
 * Hook to sync NKS parameters with instrument state (bidirectional)
 */
export function useNKSInstrumentSync(instrumentId: number | null) {
  const { currentSynthType, setSynth, parameters, syncParametersFromConfig } = useNKSStore();
  const { getInstrument, updateInstrument } = useInstrumentStore();
  const lastSyncRef = useRef<string>(''); // Prevent infinite loops

  // Get the current instrument
  const instrument = instrumentId ? getInstrument(instrumentId) : undefined;

  // Sync NKS when instrument changes or synth type changes
  useEffect(() => {
    if (!instrument) return;

    const synthType = instrument.synthType as SynthType;

    // Switch NKS to match the instrument's synth type
    if (synthType !== currentSynthType) {
      console.log('[NKS] Switching to synth type:', synthType);
      setSynth(synthType);
    }

    // Sync parameter values from instrument config to NKS
    const configKey = synthType.toLowerCase();
    const synthConfig = (instrument as unknown as Record<string, unknown>)[configKey];

    if (synthConfig && typeof synthConfig === 'object') {
      const configHash = JSON.stringify(synthConfig);
      if (configHash !== lastSyncRef.current) {
        lastSyncRef.current = configHash;
        syncParametersFromConfig(synthConfig as Record<string, unknown>);
      }
    }
  }, [instrument, currentSynthType, setSynth, syncParametersFromConfig]);

  // Subscribe to NKS parameter changes and push to instrument store
  useEffect(() => {
    if (!instrumentId || !instrument) return;

    const unsubscribe = useNKSStore.subscribe((state, prevState) => {
      // Check if parameter values changed
      if (state.parameterValues !== prevState.parameterValues) {
        const synthType = instrument.synthType as SynthType;
        const configKey = synthType.toLowerCase();

        // Build updates object from changed parameters
        let updates: Partial<InstrumentConfig> = {};
        let hasChanges = false;

        for (const param of state.parameters) {
          const newValue = state.parameterValues[param.id];
          const oldValue = prevState.parameterValues[param.id];

          if (newValue !== undefined && newValue !== oldValue) {
            // Convert normalized 0-1 value back to actual parameter range
            let actualValue: number | boolean | string;

            switch (param.type) {
              case 2: // BOOLEAN
                actualValue = newValue >= 0.5;
                break;
              case 3: // SELECTOR
                if (param.valueStrings) {
                  const index = Math.round(newValue * (param.valueStrings.length - 1));
                  actualValue = param.valueStrings[index] || param.valueStrings[0];
                } else {
                  actualValue = Math.round(newValue * (param.max - param.min) + param.min);
                }
                break;
              case 1: // INT
                actualValue = Math.round(newValue * (param.max - param.min) + param.min);
                break;
              default: // FLOAT
                actualValue = newValue * (param.max - param.min) + param.min;
            }

            // Parse the parameter path (e.g., 'tb303.cutoff' -> ['tb303', 'cutoff'])
            const path = parseParameterPath(param.id);

            // Remove the synth prefix if it matches
            if (path[0] === configKey && path.length > 1) {
              const subPath = path.slice(1);
              const currentConfig = ((instrument as unknown as Record<string, unknown>)[configKey] ||
                {}) as Record<string, unknown>;
              const newConfig = setConfigValue(currentConfig, subPath, actualValue);
              updates = { ...updates, [configKey]: newConfig };
              hasChanges = true;
            }
          }
        }

        if (hasChanges) {
          // Update the config hash to prevent echo
          const newConfigHash = JSON.stringify(updates[configKey as keyof typeof updates]);
          lastSyncRef.current = newConfigHash;

          // Push changes to instrument store
          updateInstrument(instrumentId, updates);
        }
      }
    });

    return unsubscribe;
  }, [instrumentId, instrument, parameters, updateInstrument]);
}

/**
 * Hook to track current instrument and auto-sync with NKS
 */
export function useNKSCurrentInstrumentSync() {
  const currentInstrumentId = useInstrumentStore((state) => state.currentInstrumentId);
  useNKSInstrumentSync(currentInstrumentId);
}

/**
 * Hook to auto-connect NKS hardware on mount
 */
export function useNKSAutoConnect() {
  useEffect(() => {
    // Try to connect to previously paired device (no user gesture required)
    const connectPaired = async () => {
      try {
        const { connectToNKSPairedDevice } = await import('@/midi/nks/NKSHardwareController');
        await connectToNKSPairedDevice();
      } catch (error) {
        // HID not supported or no devices - silent fail
        console.debug('[NKS] Auto-connect skipped:', error);
      }
    };

    connectPaired();
  }, []);
}

/**
 * Hook to map NKS transport controls to playback
 */
export function useNKSTransportControl(
  onPlay?: () => void,
  onStop?: () => void,
  onRecord?: () => void
) {
  useEffect(() => {
    const controller = getNKSHardwareController();

    // Set up button handlers
    controller.protocol?.onButtonPressed((buttonId) => {
      const { NKS_BUTTONS } = require('../midi/nks/NKSHIDProtocol');

      switch (buttonId) {
        case NKS_BUTTONS.PLAY:
          onPlay?.();
          break;
        case NKS_BUTTONS.STOP:
          onStop?.();
          break;
        case NKS_BUTTONS.REC:
          onRecord?.();
          break;
      }
    });
  }, [onPlay, onStop, onRecord]);
}

/**
 * Hook to get current NKS page display info
 */
export function useNKSDisplay() {
  const displayInfo = useNKSStore((state) => state.displayInfo);
  const currentPage = useNKSStore((state) => state.currentPage);
  const totalPages = useNKSStore((state) => state.totalPages);
  const pages = useNKSStore((state) => state.pages);

  return {
    displayInfo,
    currentPage,
    totalPages,
    currentPageName: pages[currentPage]?.name || '',
  };
}

/**
 * Hook to control NKS page navigation
 */
export function useNKSPageControl() {
  const { nextPage, prevPage, setPage, currentPage, totalPages } = useNKSStore();

  return {
    nextPage,
    prevPage,
    setPage,
    currentPage,
    totalPages,
    canGoNext: currentPage < totalPages - 1,
    canGoPrev: currentPage > 0,
  };
}

/**
 * Hook to get/set NKS parameter values for UI controls
 */
export function useNKSParameter(paramId: string) {
  const parameterValues = useNKSStore((state) => state.parameterValues);
  const parameters = useNKSStore((state) => state.parameters);
  const setParameterValue = useNKSStore((state) => state.setParameterValue);

  const param = parameters.find((p) => p.id === paramId);
  const value = parameterValues[paramId] ?? param?.defaultValue ?? 0;

  const setValue = useCallback(
    (newValue: number) => {
      setParameterValue(paramId, newValue);
    },
    [paramId, setParameterValue]
  );

  return {
    value,
    setValue,
    param,
    min: param?.min ?? 0,
    max: param?.max ?? 1,
    name: param?.name ?? paramId,
  };
}
