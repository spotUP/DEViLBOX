/**
 * Furnace module settings of the song (author, album, system name, tuning, tick rate, virtual tempo,
 * speeds, arpeggio speed, grooves). Stored in the project metadata; the .fur export and the derived
 * Furnace playback both read them through furnaceSettingsForExport.
 */
import React, { useState } from 'react';
import { useProjectStore } from '@stores/useProjectStore';
import { parseGrooves, parseSpeedList } from '@/lib/export/furnaceSongSettings';
import type { FurnaceSongSettings } from '@typedefs/project';

const INPUT = 'bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-1 py-0.5 focus:ring-1 focus:ring-accent-primary';

/** Commits on blur, so a half-typed list never reaches the song. */
const TextField: React.FC<{ label: string; value: string; onCommit: (v: string) => void; multiline?: boolean }> = ({ label, value, onCommit, multiline }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commonProps = {
    value: shown,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => { if (draft !== null) onCommit(draft); setDraft(null); },
    'aria-label': label,
  };
  return (
    <label className="flex gap-2 py-0.5 text-[11px] items-start">
      <span className="w-24 shrink-0 text-text-secondary pt-0.5">{label}</span>
      {multiline ? <textarea rows={3} className={`${INPUT} flex-1`} {...commonProps} /> : <input className={`${INPUT} flex-1`} {...commonProps} />}
    </label>
  );
};

const NumberField: React.FC<{ label: string; value: number | undefined; min: number; max: number; step?: number; onCommit: (v: number | undefined) => void }> = ({ label, value, min, max, step = 1, onCommit }) => (
  <TextField
    label={label}
    value={value === undefined ? '' : String(value)}
    onCommit={(t) => {
      const n = Number(t);
      onCommit(t.trim() === '' || !Number.isFinite(n) ? undefined : Math.min(max, Math.max(min, step === 1 ? Math.round(n) : n)));
    }}
  />
);

export const FurnaceSongInfoEditor: React.FC = () => {
  const meta = useProjectStore((s) => s.metadata);
  const setMetadata = useProjectStore((s) => s.setMetadata);
  const f: FurnaceSongSettings = meta.furnace ?? {};
  const set = (u: Partial<FurnaceSongSettings>) => setMetadata({ furnace: { ...f, ...u } });
  return (
    <div className="flex flex-col" data-testid="furnace-song-info">
      <TextField label="Author" value={meta.author === 'Unknown' ? '' : meta.author} onCommit={(v) => setMetadata({ author: v })} />
      <TextField label="Album" value={f.album ?? ''} onCommit={(v) => set({ album: v })} />
      <TextField label="System Name" value={f.systemName ?? ''} onCommit={(v) => set({ systemName: v })} />
      <NumberField label="Tuning (Hz)" value={f.tuning} min={220} max={880} step={0.01} onCommit={(v) => set({ tuning: v })} />
      <NumberField label="Tick Rate (Hz)" value={f.hz} min={1} max={999} onCommit={(v) => set({ hz: v })} />
      <NumberField label="Virtual Tempo" value={f.virtualTempoN} min={1} max={255} onCommit={(v) => set({ virtualTempoN: v })} />
      <NumberField label="Virtual Divisor" value={f.virtualTempoD} min={1} max={255} onCommit={(v) => set({ virtualTempoD: v })} />
      <NumberField label="Arpeggio Speed" value={f.arpSpeed} min={1} max={255} onCommit={(v) => set({ arpSpeed: v })} />
      <TextField label="Speeds" value={(f.speedPattern ?? []).join(', ')} onCommit={(v) => set({ speedPattern: parseSpeedList(v) })} />
      <TextField label="Grooves" multiline value={(f.grooves ?? []).map((g) => g.join(', ')).join('\n')} onCommit={(v) => set({ grooves: parseGrooves(v) })} />
      <div className="text-[10px] text-text-muted pt-1">One groove per line. Empty fields use the song's own value or the Furnace default.</div>
    </div>
  );
};
