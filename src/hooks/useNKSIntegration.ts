/**
 * NKS Integration Hook
 * 
 * Connects NKS hardware control to instrument parameters
 */

import { useEffect } from 'react';
import { getNKSHardwareController } from '@/midi/nks/NKSHardwareController';

/**
 * Hook to sync NKS parameters with instrument state
 * TODO: Implement full bidirectional sync when instrument system is refactored
 */
export function useNKSInstrumentSync(instrumentId: string) {
  // Placeholder - will be implemented when instrument config structure is finalized
  // This will sync TB-303 parameters with NKS hardware knobs and displays
  useEffect(() => {
    if (!instrumentId) return;
    
    // TODO: Implement sync logic
    console.log('[NKS] Sync enabled for instrument:', instrumentId);
  }, [instrumentId]);
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
      const { NKS_BUTTONS } = require('../../midi/nks/NKSHIDProtocol');
      
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


