/**
 * Settings > Playback Engines: every format of the nuade table with the engine it plays on and what was measured.
 * One FormatEngineSelect per row; the rows are the table's (nuadeFormats.ts), nothing is listed here by hand.
 */
import React, { useMemo, useState } from 'react';
import { FormatEngineSelect } from '@components/common/FormatEngineSelect';
import { NUADE_FORMAT_LIST } from '@/engine/nuade/nuadeFormats';

export const PlaybackEnginesPanel: React.FC = () => {
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return NUADE_FORMAT_LIST.filter((f) => !q || f.label.toLowerCase().includes(q) || f.id.includes(q))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filter]);

  return (
    <section>
      <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">PLAYBACK ENGINES</h3>
      <p className="text-ft2-textDim text-[9px] font-mono mb-2">
        Which engine plays each format: our own, UADE, or nuade (emoon/nuade, native C ports of the UADE players). The
        default of a format is what was measured against UADE; both stay selectable.
      </p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter formats"
        aria-label="Filter formats"
        className="w-full mb-2 px-2 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs"
      />
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} data-testid={`engine-row-${row.id}`} className="flex items-start justify-between gap-3 border-b border-ft2-border/40 pb-2">
            <div className="text-ft2-text text-[10px] font-mono pt-1">{row.label}</div>
            <FormatEngineSelect row={row} />
          </div>
        ))}
      </div>
    </section>
  );
};
