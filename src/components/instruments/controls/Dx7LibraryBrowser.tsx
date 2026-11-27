/**
 * Dx7LibraryBrowser - the curated DX7 library (hundreds of banks of 32 voices) as a filter box over one flat list of
 * voices, each row voice name plus bank and author, the sounding voice highlighted.
 * Presentation only: the filter is filterDX7Library, picking calls onPick (the editor's one load path).
 * shortcut: renders the first MAX_ROWS rows (thousands of voices), the count line says when the search should be narrowed.
 */
import React, { useMemo, useState } from 'react';
import { filterDX7Library, flattenDX7Matches, type DX7LibraryManifest } from '../../../engine/dx7/dx7Library';

interface Dx7LibraryBrowserProps {
  library: DX7LibraryManifest;
  /** The library voice that is loaded now, if the voice came from the library. */
  current: { file: string; index: number } | null;
  onPick: (file: string, index: number) => void;
}

const ROW = 'w-full text-left px-2 py-1 text-[10px] font-mono rounded truncate transition-colors';
const ROW_ON = 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40';
const ROW_OFF = 'bg-dark-bgTertiary text-text-secondary border border-transparent hover:bg-dark-bgHover hover:text-text-primary';

const MAX_ROWS = 300;

export const Dx7LibraryBrowser: React.FC<Dx7LibraryBrowserProps> = ({ library, current, onPick }) => {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => flattenDX7Matches(filterDX7Library(library.banks, query)), [library, query]);
  const shown = rows.slice(0, MAX_ROWS);

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
          {rows.length} {rows.length === 1 ? 'voice' : 'voices'}
          {rows.length > MAX_ROWS && `, first ${MAX_ROWS} shown, type to narrow`}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[10px] font-mono text-text-muted py-4 text-center">No bank or voice matches this search.</div>
      ) : (
        <div role="listbox" aria-label="Voices" className="flex flex-col gap-0.5 max-h-72 overflow-y-auto scrollbar-modern pr-1">
          {shown.map(({ bank, index, name }) => {
            const on = current?.file === bank.file && current.index === index;
            const detail = [bank.name, bank.collection, bank.author].filter(Boolean).join(' / ');
            return (
              <button
                key={`${bank.file}:${index}`}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onPick(bank.file, index)}
                title={`${name} - ${detail}`}
                className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
              >
                {name}
                <span className="ml-2 text-text-muted">{detail}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
