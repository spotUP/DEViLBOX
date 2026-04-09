/**
 * MIDIDeviceSelector - Dropdown for selecting MIDI input/output devices
 */

import React from 'react';
import type { MIDIDeviceInfo } from '../../midi/types';
import { Usb } from 'lucide-react';
import { CustomSelect } from '@components/common/CustomSelect';

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

  const td3Devices = devices.filter((d) => d.isTD3);
  const otherDevices = devices.filter((d) => !d.isTD3);

  const options: Array<{ value: string; label: string } | { label: string; options: Array<{ value: string; label: string }> }> = [
    { value: '', label: 'No device' },
  ];

  if (td3Devices.length > 0) {
    options.push({
      label: '★ TD-3 Compatible',
      options: td3Devices.map((device) => ({
        value: device.id,
        label: `${device.name}${device.manufacturer ? ` (${device.manufacturer})` : ''}`,
      })),
    });
  }

  if (otherDevices.length > 0) {
    options.push({
      label: 'MIDI Devices',
      options: otherDevices.map((device) => ({
        value: device.id,
        label: `${device.name}${device.manufacturer ? ` (${device.manufacturer})` : ''}`,
      })),
    });
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wide">
        {label}
      </label>
      <CustomSelect
        value={selectedId || ''}
        onChange={(v) => onSelect(v || null)}
        disabled={disabled}
        className={`
          w-full px-3 py-2 rounded-md text-sm
          bg-dark-bgTertiary border border-dark-border
          text-text-primary
          hover:border-dark-borderLight focus:border-accent-primary focus:outline-none
          disabled:opacity-50 disabled:cursor-not-allowed
          ${selectedDevice?.isTD3 ? 'border-accent-success/50' : ''}
        `}
        options={options}
      />
      {selectedDevice?.isTD3 && (
        <div className="flex items-center gap-1 text-xs text-accent-success">
          <Usb size={12} />
          <span>TD-3 detected</span>
        </div>
      )}
    </div>
  );
};
