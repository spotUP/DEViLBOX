/**
 * Jukebox — audit every format DEViLBOX can play, fast.
 *
 * 466 rows: one per format directory, split by machine where a format has
 * several (Furnace's chips get a row each). The list is the instrument; the
 * pattern editor beside it is what you are judging, and it never leaves the
 * screen.
 *
 * Keyboard, because reaching for a mouse 466 times is the thing that makes an
 * audit not happen:
 *
 *   type        filter the list
 *   up / down   move
 *   left/right  page
 *   Enter       play the selected row
 *   R           another take from the same format
 *   Alt+0       mark good        Alt+1..6  name a fault
 *   Escape      clear the filter
 *
 * Reports are digits with ALT held on purpose: plain digits belong to the
 * filter, because format names are full of them (669, a2600, opl3, sn76489).
 *
 * Verdicts go to the format-status server on :4444, which already holds the
 * project's format state and already has `status`, `patternQuality` and
 * `notes` meaning what these mean.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@components/ui/Button';
import { loadFile } from '@/lib/file/UnifiedFileLoader';
import { JUKEBOX_FAULTS, JUKEBOX_OK, reportFault } from '@/lib/jukebox/faultReports';
import { searchModland, downloadModlandFile } from '@/lib/modlandApi';

interface IndexEntry {
  id: string;
  label: string;
  formatKey: string | null;
  subformat?: string;
  files: string[];
  total: number;
  /** No local song: the corpus cannot demonstrate this format, so the row
   *  fetches one from Modland on demand. 121 of the registry's formats are in
   *  this state, and a list that simply omitted them would hide the gap. */
  fromModland?: boolean;
}

interface SongIndex {
  generated: string;
  registryTotal: number;
  covered: number;
  entries: IndexEntry[];
  gaps: Array<{ formatKey: string; label: string }>;
}

const ROW_HEIGHT = 20;
const PAGE = 12;

export const JukeboxPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [index, setIndex] = useState<SongIndex | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  /** Which take of the selected format, so R can move through them. */
  const [take, setTake] = useState(0);
  const [status, setStatus] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [judged, setJudged] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);
  /** Bytes already fetched, so Enter does not wait on the network. */
  const cache = useRef<Map<string, Blob>>(new Map());

  useEffect(() => {
    void fetch('/data/songs/index.json')
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setStatus('no index — run: npx tsx --tsconfig tsconfig.app.json scripts/build-song-index.ts'));
  }, []);

  /** Corpus rows, then the registry formats with nothing local to play. */
  const allEntries = useMemo<IndexEntry[]>(() => {
    if (!index) return [];
    const gapRows: IndexEntry[] = index.gaps.map((g) => ({
      id: `modland-${g.formatKey}`,
      label: `${g.label}  (Modland)`,
      formatKey: g.formatKey,
      files: [],
      total: 0,
      fromModland: true,
    }));
    return [...index.entries, ...gapRows];
  }, [index]);

  const rows = useMemo(() => {
    if (!index) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return allEntries;
    // Every term must appear somewhere in the row — "fur nes" finds the
    // Furnace NES row without caring about order.
    const terms = q.split(/\s+/);
    return allEntries.filter((e) => {
      const hay = `${e.label} ${e.formatKey ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [index, allEntries, filter]);

  const row = rows[Math.min(selected, rows.length - 1)];
  const file = row?.files[take % Math.max(1, row.files.length)];

  /** Warm the next few rows so Enter is instant. */
  useEffect(() => {
    let cancelled = false;
    const warm = async (url?: string) => {
      if (!url || cache.current.has(url)) return;
      try {
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        cache.current.set(url, await res.blob());
        // The corpus is large; keep the cache from growing without bound.
        if (cache.current.size > 24) {
          const oldest = cache.current.keys().next().value;
          if (oldest) cache.current.delete(oldest);
        }
      } catch { /* offline or missing — Enter will report it */ }
    };
    void warm(file);
    void warm(rows[selected + 1]?.files[0]);
    return () => { cancelled = true; };
  }, [file, rows, selected]);

  const play = useCallback(async () => {
    if (!row) return;

    // No local song — ask Modland for one. The index knows which formats are
    // in this state; searching by the format's own label is the best handle
    // available, and whatever comes back is named in the status line so a
    // wrong match is visible rather than silently judged.
    if (row.fromModland) {
      setStatus(`searching Modland for ${row.label.replace('  (Modland)', '')}…`);
      setPlayingId(row.id);
      try {
        const term = row.label.replace('  (Modland)', '').trim();
        const res = await searchModland({ q: term, limit: 1 });
        const hit = res.results?.[0];
        if (!hit) { setStatus(`Modland has nothing for "${term}"`); return; }
        const buf = await downloadModlandFile(hit.full_path);
        const name = hit.filename ?? 'song';
        await loadFile(new File([buf], name), { autoplay: true } as never);
        setStatus(`${name} (Modland)`);
      } catch (err) {
        setStatus(`Modland: ${(err as Error).message}`);
      }
      return;
    }

    if (!file) return;
    const name = file.split('/').pop() ?? 'song';
    setStatus(`playing ${name}`);
    setPlayingId(row.id);
    try {
      const blob = cache.current.get(file) ?? await (await fetch(file)).blob();
      cache.current.set(file, blob);
      await loadFile(new File([blob], name), { autoplay: true } as never);
      setStatus(name);
    } catch (err) {
      // A load that throws is itself a finding; leave the row selected so it
      // can be reported without hunting for it again.
      setStatus(`load failed: ${(err as Error).message}`);
    }
  }, [row, file]);

  const send = useCallback(async (fault: typeof JUKEBOX_OK | (typeof JUKEBOX_FAULTS)[number]) => {
    if (!row || !file) return;
    const ok = await reportFault(fault, {
      format: row.id,
      file: file.split('/').pop() ?? file,
    });
    setJudged((j) => ({ ...j, [row.id]: fault.id }));
    setStatus(ok ? `${row.label}: ${fault.label}` : `${fault.label} — tracker offline (:4444)`);
    setSelected((i) => Math.min(i + 1, rows.length - 1));
    setTake(0);
  }, [row, file, rows.length]);

  const move = useCallback((delta: number) => {
    setSelected((i) => Math.max(0, Math.min(rows.length - 1, i + delta)));
    setTake(0);
  }, [rows.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, rows.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey) {
      if (e.key === '0') { e.preventDefault(); void send(JUKEBOX_OK); return; }
      const fault = JUKEBOX_FAULTS.find((f) => f.key === e.key);
      if (fault) { e.preventDefault(); void send(fault); return; }
    }
    switch (e.key) {
      case 'ArrowDown':  e.preventDefault(); move(1); return;
      case 'ArrowUp':    e.preventDefault(); move(-1); return;
      case 'ArrowRight': e.preventDefault(); move(PAGE); return;
      case 'ArrowLeft':  e.preventDefault(); move(-PAGE); return;
      case 'Enter':      e.preventDefault(); void play(); return;
      case 'Escape':     e.preventDefault(); setFilter(''); return;
      default: break;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r') {
      // R only when the filter is empty, so it can still be typed in a search.
      if (filter === '') { e.preventDefault(); setTake((t) => t + 1); }
    }
  };

  if (!index) {
    return (
      <div className="w-[22rem] shrink-0 bg-dark-bgSecondary border-r border-dark-border p-2 text-[10px] font-mono text-text-muted">
        {status || 'loading index…'}
      </div>
    );
  }

  return (
    <div className="w-[22rem] shrink-0 bg-dark-bgSecondary border-r border-dark-border flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-dark-border">
        <span className="text-[10px] font-mono text-accent-primary">JUKEBOX</span>
        <span className="text-[9px] font-mono text-text-muted">
          {index.covered}/{index.registryTotal} local · {index.gaps.length} via Modland
        </span>
        <Button variant="ghost" onClick={onClose} title="Close (Ctrl+Shift+J)">Close</Button>
      </div>

      <input
        autoFocus
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setSelected(0); setTake(0); }}
        onKeyDown={onKeyDown}
        placeholder="Type to filter · Enter plays · Alt+1-6 reports"
        className="m-2 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-2 py-1 focus:ring-1 focus:ring-accent-primary outline-none"
      />

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto font-mono text-[11px]" onKeyDown={onKeyDown}>
        {rows.map((e, i) => {
          const isSel = i === Math.min(selected, rows.length - 1);
          const verdict = judged[e.id];
          return (
            <div
              key={e.id}
              data-selected={isSel}
              onClick={() => { setSelected(i); setTake(0); }}
              onDoubleClick={() => void play()}
              style={{ height: ROW_HEIGHT }}
              className={`px-2 flex items-center gap-2 cursor-pointer ${
                isSel ? 'bg-dark-bgActive text-text-primary' : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
              title={`${e.label} — ${e.total} song${e.total === 1 ? '' : 's'}`}
            >
              <span className="truncate flex-1">{e.label}</span>
              {playingId === e.id && <span className="text-accent-primary">▶</span>}
              {verdict && (
                <span className={verdict === 'ok' ? 'text-accent-success' : 'text-accent-error'}>
                  {verdict === 'ok' ? 'OK' : '!'}
                </span>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div className="px-2 py-1 text-text-muted">nothing matches</div>}
      </div>

      <div className="border-t border-dark-border p-2 flex flex-col gap-1">
        <div className="text-[9px] font-mono text-text-muted truncate" title={status}>
          {!row ? '' : row.fromModland
            ? `${row.label} · no local song`
            : `${row.label} · take ${(take % Math.max(1, row.files.length)) + 1}/${row.files.length} of ${row.total}`}
        </div>
        <div className="text-[9px] font-mono text-text-secondary truncate">{status}</div>
        <div className="flex flex-wrap gap-1">
          <Button variant="primary" onClick={() => void play()} title="Play (Enter)">Play</Button>
          <Button variant="default" onClick={() => setTake((t) => t + 1)} title="Another take (R)">Take</Button>
          <Button variant="primary" onClick={() => void send(JUKEBOX_OK)} title="Good (Alt+0)">Good</Button>
          {JUKEBOX_FAULTS.map((f) => (
            <Button key={f.id} variant="danger" onClick={() => void send(f)} title={`${f.title} (Alt+${f.key})`}>
              {f.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
