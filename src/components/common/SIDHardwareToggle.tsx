/**
 * SIDHardwareToggle — shared toggle button for routing SID register writes
 * to a USB-SID-Pico or ASID device. Used in GTToolbar and SF2View.
 *
 * Shows transport mode (USB/ASID), device name, write count when active.
 * Disabled when no hardware is connected.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  getSIDHardwareManager,
  type SIDHardwareStatus,
} from '@/lib/sid/SIDHardwareManager';

interface Props {
  /** Whether the bridge is currently enabled (hardware active) */
  bridgeEnabled: boolean;
  /** Called when user clicks to enable hardware output */
  onEnable: () => void;
  /** Called when user clicks to disable hardware output */
  onDisable: () => void;
  /** Optional write count for display */
  writeCount?: number;
}

const BTN = 'px-2 py-0.5 text-[10px] font-mono border cursor-pointer transition-colors';
const BTN_DEFAULT = `${BTN} bg-ft2-header text-ft2-textDim border-ft2-border hover:bg-ft2-border hover:text-ft2-text`;

export const SIDHardwareToggle: React.FC<Props> = ({
  bridgeEnabled,
  onEnable,
  onDisable,
  writeCount = 0,
}) => {
  const [hwStatus, setHwStatus] = useState<SIDHardwareStatus>(
    () => getSIDHardwareManager().getStatus(),
  );

  useEffect(() => {
    const unsub = getSIDHardwareManager().onStatusChange(setHwStatus);
    setHwStatus(getSIDHardwareManager().getStatus());
    return unsub;
  }, []);

  const connected = hwStatus.connected;
  const modeLabel = hwStatus.mode === 'webusb' ? 'USB' : hwStatus.mode === 'asid' ? 'ASID' : '';
  const deviceName = hwStatus.deviceName;

  const toggle = useCallback(() => {
    if (bridgeEnabled) onDisable();
    else onEnable();
  }, [bridgeEnabled, onEnable, onDisable]);

  const label = bridgeEnabled && connected
    ? `${modeLabel} ${writeCount > 0 ? `${(writeCount / 1000).toFixed(1)}k` : 'ON'}`
    : connected
      ? (deviceName ? deviceName.slice(0, 10) : (modeLabel || 'HW'))
      : 'No HW';

  const title = connected
    ? (bridgeEnabled
        ? `${modeLabel} active: ${deviceName ?? 'device'} — softsynth muted`
        : `Click to route to ${deviceName ?? (modeLabel || 'hardware')}`)
    : 'No SID hardware — connect via Settings → SID Hardware';

  return (
    <button
      onClick={toggle}
      title={title}
      className={`${BTN} text-[9px] min-w-[60px] ${
        bridgeEnabled && connected
          ? 'bg-emerald-600 text-text-primary border-emerald-500'
          : connected
            ? BTN_DEFAULT
            : 'opacity-40 cursor-not-allowed bg-ft2-header text-ft2-textDim border-ft2-border'
      }`}
      disabled={!connected}
    >
      {label}
    </button>
  );
};
