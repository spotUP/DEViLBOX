import React from 'react';
import { Toggle } from '@components/controls/Toggle';
import { useSettingsStore } from '@stores/useSettingsStore';

/**
 * The Quantize switch of the master FX: with it on, a click on a channel
 * button takes effect at the next beat of the playing song.
 */
export const MasterFxQuantizeSwitch: React.FC = () => {
  const quantize = useSettingsStore((s) => s.masterFxQuantize);
  const setQuantize = useSettingsStore((s) => s.setMasterFxQuantize);
  return (
    <div className="flex items-center gap-2">
      <Toggle
        label="Quantize"
        size="sm"
        value={quantize}
        onChange={setQuantize}
        title={quantize
          ? 'Quantize on: a channel button takes effect at the next beat of the playing song'
          : 'Quantize off: a channel button takes effect at once'}
      />
    </div>
  );
};
