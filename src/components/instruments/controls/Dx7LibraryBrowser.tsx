/**
 * Dx7LibraryBrowser - the curated DX7 library (hundreds of banks of 32 voices) as a two-level picker: a filter box,
 * the banks that match on the left, the voices of the browsed bank on the right, the sounding voice highlighted, and the
 * attribution of the browsed bank underneath. A select with one group per bank was unusable at this size.
 * Presentation only: the filter is filterDX7Library, picking calls onPick (the editor's one load path).
 */
import React, { useMemo, useState } from 'react';
import { filterDX7Library, type DX7LibraryManifest } from '../../../engine/dx7/dx7Library';

interface Dx7LibraryBrowserProps {
  library: DX7LibraryManifest;
  /** The library voice that is loaded now, if the voice came from the library. */
  current: { file: string; index: number } | null;
  onPick: (file: string, index: number) => void;
}

const ROW = 'w-full text-left px-2 py-1 text-[10px] font-mono rounded truncate transition-colors';
const ROW_ON = 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40';
const ROW_OFF = 'bg-dark-bgTertiary text-text-secondary border border-transparent hover:bg-dark-bgHover hover:text-text-primary';

export const Dx7LibraryBrowser: React.FC<Dx7LibraryBrowserProps> = ({ library, current, onPick }) => {
  const [query, setQuery] = useState('');
  const [browsing, setBrowsing] = useState<string | null>(current?.file ?? null);
  const matches = useMemo(() => filterDX7Library(library.banks, query), [library, query]);
  const shown = matches.find((m) => m.bank.file === browsing) ?? matches[0] ?? null;
  const voiceCount = matches.reduce((n, m) => n + m.voices.length, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search banks, authors and voice names"
          aria-label="Search the library"
          className="flex-1 min-w-0 px-2 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <span className="text-[10px] font-mono text-text-muted whitespace-nowrap">
          {matches.length} of {library.banks.length} banks, {voiceCount} {voiceCount === 1 ? 'voice' : 'voices'}
        </span>
      </div>
      {matches.length === 0 ? (
        <div className="text-[10px] font-mono text-text-muted py-4 text-center">No bank or voice matches this search.</div>
      ) : (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
          <div role="listbox" aria-label="Banks" className="flex flex-col gap-0.5 max-h-72 overflow-y-auto scrollbar-modern pr-1">
            {matches.map((m) => (
              <button
                key={m.bank.file}
                type="button"
                role="option"
                aria-selected={m.bank.file === shown?.bank.file}
                onClick={() => setBrowsing(m.bank.file)}
                title={m.bank.name}
                className={`${ROW} ${m.bank.file === shown?.bank.file ? ROW_ON : ROW_OFF}`}
              >
                {m.bank.name}
                {current?.file === m.bank.file && <span className="ml-1 text-accent-success">*</span>}
              </button>
            ))}
          </div>
          <div role="listbox" aria-label="Voices" className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] content-start gap-0.5 max-h-72 overflow-y-auto scrollbar-modern pr-1">
            {shown?.voices.map((i) => {
              const name = shown.bank.voices[i];
              const on = current?.file === shown.bank.file && current.index === i;
              return (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onPick(shown.bank.file, i)}
                  title={`${i + 1}. ${name}`}
                  className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
                >
                  <span className="text-text-muted mr-1">{i + 1}.</span>{name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {shown && (
        <div className="text-[9px] text-text-muted font-mono flex flex-col gap-0.5">
          <div className="text-text-secondary">{shown.bank.name}: {shown.bank.author}</div>
          <div>{shown.bank.licence}</div>
          <a href={shown.bank.source} target="_blank" rel="noreferrer" className="text-accent-primary underline break-all">{shown.bank.source}</a>
        </div>
      )}
    </div>
  );
};
