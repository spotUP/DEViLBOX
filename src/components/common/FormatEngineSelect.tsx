/**
 * FormatEngineSelect - the one control that chooses the engine a format plays on (Our Engine, UADE, nuade).
 * Mounted in the instrument panel for the loaded song's format and in Settings > Playback Engines for every row.
 * The choice goes through switchFormatEngine, which also reopens the loaded song when it is of that format.
 */
import React, { useState } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { notify } from '@stores/useNotificationStore';
import type { FormatEngineChoice } from '@/types/formatEngine';
import type { NuadeFormat } from '@/engine/nuade/nuadeFormats';
import { explicitFormatEngine, effectiveFormatEngine } from '@/engine/nuade/nuadeRouting';
import { engineNote, engineOptionsFor, selectedEngine } from '@/engine/nuade/nuadeSelectOptions';
import { switchFormatEngine } from '@/lib/song/switchFormatEngine';

export interface FormatEngineSelectProps {
  /** A row of the nuade table. */
  row: NuadeFormat;
  /** Show the measured note under the select. */
  showNote?: boolean;
}

export const FormatEngineSelect: React.FC<FormatEngineSelectProps> = ({ row, showNote = true }) => {
  const explicit = useSettingsStore((s) => explicitFormatEngine(s.formatEngine, row.prefKey));
  const [busy, setBusy] = useState(false);
  const effective = explicit ?? effectiveFormatEngine({}, row.prefKey) ?? row.defaultEngine;

  const onChange = async (value: string): Promise<void> => {
    setBusy(true);
    const r = await switchFormatEngine(row.prefKey, value as FormatEngineChoice | 'default');
    setBusy(false);
    if (!r.switched) notify.error(r.error);
  };

  return (
    <div className="flex flex-col gap-1">
      <CustomSelect
        value={selectedEngine(row, effective)}
        onChange={(v) => { void onChange(v); }}
        options={engineOptionsFor(row).map((o) => ({ value: o.value, label: o.label }))}
        disabled={busy}
        title={`The engine ${row.label} plays on`}
        className="bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs"
      />
      {explicit !== undefined && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void onChange('default'); }}>
          Reset to Default
        </Button>
      )}
      {showNote && <div className="text-text-muted text-[10px] font-mono">{engineNote(row)}</div>}
    </div>
  );
};
