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
import { loadFile as loadFileHeadless } from '@/bridge/handlers/writeHandlers';
import { suppressFormatChecks, restoreFormatChecks } from '@/lib/formatCompatibility';
import { useModlandContributionModal } from '@stores/useModlandContributionModal';
import { dismissErrors, dismissModal, play as playHeadless } from '@/bridge/handlers/writeHandlers';
import { resolveCompanions } from '@/lib/import/companionResolver';
import { JUKEBOX_FAULTS, JUKEBOX_OK, reportFault, loadVerdicts } from '@/lib/jukebox/faultReports';
import { searchModland, downloadModlandFile } from '@/lib/modlandApi';

interface IndexEntry {
  id: string;
  label: string;
  formatKey: string | null;
  subformat?: string;
  files: string[];
  total: number;
  dir: string;
  /** No local song: the corpus cannot demonstrate this format, so the row
   *  fetches one from Modland on demand. 121 of the registry's formats are in
   *  this state, and a list that simply omitted them would hide the gap. */
  fromModland?: boolean;
}

interface DirListing {
  siblings: string[];
  subdirs?: Record<string, string[]>;
  parentSamples?: string[];
}

interface SongIndex {
  generated: string;
  registryTotal: number;
  covered: number;
  entries: IndexEntry[];
  /** Directory listings, so companions resolve exactly as they do elsewhere. */
  dirs: Record<string, DirListing>;
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

  // Verdicts already on the server. They were written there all along; not
  // reading them back is what made every reload throw the sweep away.
  useEffect(() => { void loadVerdicts().then((v) => setJudged((j) => ({ ...v, ...j }))); }, []);

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
      // Nothing local, so no directory to resolve companions against — the
      // Modland download brings whatever it brings.
      dir: '',
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

  /**
   * Take the keyboard back.
   *
   * Loading a song hands focus to the pattern editor, which then eats the
   * arrows and swallows typed letters as note entry — the list goes dead
   * after the first Enter. Focus returns here on mount and after every load.
   */
  const grabFocus = useCallback(() => listRef.current?.focus(), []);
  useEffect(() => { grabFocus(); }, [grabFocus]);

  /**
   * Load bytes and START them.
   *
   * NOT `UnifiedFileLoader.loadFile`: for tracker modules that returns
   * `{ success: 'pending-import' }` and waits for the import dialog, so every
   * song loaded into a dialog that is not on screen and nothing played. The
   * MCP handler is the headless entry — it runs the same pipeline and then
   * bypasses the dialog, which is a hundred lines of format routing that must
   * not be copied here.
   *
   * It does not start playback either; that is the transport's job, and the
   * MCP `play` handler is the entry that sets song mode and starts it.
   * `TrackerReplayer.play()` would no-op for native-engine songs.
   */
  const loadAndPlay = useCallback(async (
    bytes: ArrayBuffer,
    name: string,
    companionFiles?: Record<string, string>,
  ) => {
    let binary = '';
    const view = new Uint8Array(bytes);
    // Chunked: String.fromCharCode(...view) blows the argument limit on a
    // module of any size.
    for (let i = 0; i < view.length; i += 0x8000) {
      binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
    }
    // Nothing may stop to ask a question. Sweeping hundreds of formats means
    // meeting every dialog the app has — the format-compatibility warning, the
    // "rare find" Modland contribution prompt, a synth that cannot be built —
    // and each one wedges the list until it is answered by hand.
    suppressFormatChecks();
    try {
      const result = await loadFileHeadless({
        filename: name,
        data: btoa(binary),
        ...(companionFiles && Object.keys(companionFiles).length ? { companionFiles } : {}),
      });
      if (result.error) {
        setStatus(`${name}: ${String(result.error)}`);
        return false;
      }
      // SONG mode. `useTransportStore.play()` alone inherits whatever the
      // loop flag happened to be, so the browser looped one pattern instead of
      // playing the tune — and an audit that never leaves pattern 0 cannot see
      // a song fall apart later. This is the MCP `play` handler, which sets
      // the flag and then plays.
      await playHeadless({ mode: 'song' });
      return true;
    } finally {
      restoreFormatChecks();
      // The contribution prompt is raised asynchronously, after the hash
      // lookup returns, so closing it once here is not enough — it is closed
      // again on the next tick.
      const close = () => {
        try { useModlandContributionModal.getState().closeModal(); } catch { /* not open */ }
        try { dismissErrors(); } catch { /* none */ }
        try { dismissModal(); } catch { /* none */ }
      };
      close();
      window.setTimeout(close, 400);
      window.setTimeout(close, 1500);
    }
  }, []);

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
        if (await loadAndPlay(buf, name)) setStatus(`${name} (Modland)`);
        window.setTimeout(grabFocus, 0);
        window.setTimeout(grabFocus, 500);
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

      // Companions, resolved by the app's OWN logic rather than a guess.
      // A TFMX tune without its `smpl.` partner or a Sonix song without its
      // `.ss`/`.instr` is not a test of anything, so the index ships a
      // directory listing and `resolveCompanions` decides from it exactly as
      // the normal load path does.
      const listing = index?.dirs[row.dir];
      const companions: Record<string, string> = {};
      if (listing) {
        const dirUrl = row.dir;
        const res = resolveCompanions(name, listing);
        for (const registerAs of res.companions) {
          const readFrom = res.sources[registerAs] ?? registerAs;
          try {
            const cRes = await fetch(`${dirUrl}/${readFrom}`);
            if (!cRes.ok) continue;
            const cBuf = new Uint8Array(await cRes.arrayBuffer());
            let cBin = '';
            for (let i = 0; i < cBuf.length; i += 0x8000) {
              cBin += String.fromCharCode(...cBuf.subarray(i, i + 0x8000));
            }
            companions[registerAs] = btoa(cBin);
          } catch { /* a companion that will not fetch is itself a finding */ }
        }
        if (res.companions.length > 0) {
          setStatus(`${name} + ${Object.keys(companions).length}/${res.companions.length} companions`);
        }
      }

      if (await loadAndPlay(await blob.arrayBuffer(), name, companions)) {
        setStatus(Object.keys(companions).length ? `${name} (+${Object.keys(companions).length})` : name);
      }
      // The editor took the keyboard during the load; take it back.
      window.setTimeout(grabFocus, 0);
      window.setTimeout(grabFocus, 500);
    } catch (err) {
      // A load that throws is itself a finding; leave the row selected so it
      // can be reported without hunting for it again.
      setStatus(`load failed: ${(err as Error).message}`);
    }
  }, [row, file, loadAndPlay, grabFocus, index]);

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
      case 'Backspace':  e.preventDefault(); setFilter((f) => f.slice(0, -1)); setSelected(0); return;
      case 'ArrowDown':  e.preventDefault(); move(1); return;
      case 'ArrowUp':    e.preventDefault(); move(-1); return;
      case 'ArrowRight': e.preventDefault(); move(PAGE); return;
      case 'ArrowLeft':  e.preventDefault(); move(-PAGE); return;
      case 'Enter':      e.preventDefault(); void play(); return;
      case 'Escape':     e.preventDefault(); setFilter(''); return;
      default: break;
    }
    // Anything printable types into the filter. There is no input element —
    // the list is the field.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      setFilter((f) => f + e.key);
      setSelected(0);
      setTake(0);
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
      <div className="px-2 py-1 text-[10px] font-mono border-b border-dark-border flex items-center gap-2">
        <span className="text-text-muted">filter</span>
        <span className="text-accent-primary flex-1 truncate">{filter || '—'}</span>
        <span className="text-text-muted">{rows.length}</span>
      </div>

      {/* The LIST has the focus and the keyboard, with no input box in the
          way: typing filters it directly, which is what a fast audit wants —
          one less thing to click into, and no field to clear before the
          arrows work again. `tabIndex` makes a div focusable; the outline is
          suppressed because the selected row already shows where focus is. */}
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex-1 min-h-0 overflow-y-auto font-mono text-[11px] outline-none"
      >
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
