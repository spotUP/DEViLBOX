/**
 * MIDIDeviceSelector - Dropdown for selecting MIDI input/output devices
 */

import React from 'react';
import type { MIDIDeviceInfo } from '../../midi/types';
import { ChevronDown, Usb } from 'lucide-react';

interface MIDIDeviceSelectorProps {
  label: string;
  devices: MIDIDeviceInfo[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
}

export const MIDIDeviceSelector: React.FC<MIDIDeviceSelectorProps> = ({
  label,
  devices,
  selectedId,
  onSelect,
  disabled = false,
}) => {
  const selectedDevice = devices.find((d) => d.id === selectedId);

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <select
          value={selectedId || ''}
          onChange={(e) => onSelect(e.target.value || null)}
          disabled={disabled}
          className={`
            w-full px-3 py-2 pr-8 rounded-md text-sm
            bg-dark-bgTertiary border border-dark-border
            text-text-primary appearance-none cursor-pointer
            hover:border-dark-borderLight focus:border-accent-primary focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${selectedDevice?.isTD3 ? 'border-accent-success/50' : ''}
          `}
        >
          <option value="">No device</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.isTD3 ? '★ ' : ''}{device.name}
              {device.manufacturer ? ` (${device.manufacturer})` : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
      </div>
      {selectedDevice?.isTD3 && (
        <div className="flex items-center gap-1 text-xs text-accent-success">
          <Usb size={12} />
          <span>TD-3 detected</span>
        </div>
      )}
    </div>
  );
};
