/**
 * Jukebox — walk the corpus fast and report what is wrong in one keystroke.
 *
 * 186 format directories sit in `public/data/songs/`, and on 2026-09-23/24
 * finding faults in them was done by hand, one song at a time: load, play,
 * watch, describe. Several distinct bugs turned up in an evening that way,
 * which is a good yield and a terrible rate.
 *
 * This is a PANEL over the tracker, not a view of its own, and deliberately:
 * the faults being hunted are "the grid is empty", "the grid does not
 * scroll", "the grid and the audio drift". Judging those needs the REAL
 * pattern editor and the REAL engines, so the jukebox borrows them rather
 * than drawing its own.
 *
 * Verdicts go to the format-status server on :4444, which already holds 1668
 * entries and already has `status`, `patternQuality` and `notes`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@components/ui/Button';
import { loadFile } from '@/lib/file/UnifiedFileLoader';
import { JUKEBOX_FAULTS, JUKEBOX_OK, reportFault } from '@/lib/jukebox/faultReports';

interface FormatEntry {
  format: string;
  files: string[];
  total: number;
}

interface SongIndex {
  generated: string;
  perFormat: number;
  formats: FormatEntry[];
}

interface JukeboxPanelProps {
  onClose: () => void;
}

/** One song, identified the way a report needs it. */
interface Cursor {
  formatIndex: number;
  fileIndex: number;
}

export const JukeboxPanel: React.FC<JukeboxPanelProps> = ({ onClose }) => {
  const [index, setIndex] = useState<SongIndex | null>(null);
  const [cursor, setCursor] = useState<Cursor>({ formatIndex: 0, fileIndex: 0 });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  /** Formats already given a verdict this session, so a sweep can be resumed
   *  by eye without re-listening to what was already judged. */
  const [judged, setJudged] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch('/data/songs/index.json')
      .then((r) => r.json())
      .then((data: SongIndex) => setIndex(data))
      .catch(() => setStatus('index.json missing — run: npx tsx scripts/build-song-index.ts'));
  }, []);

  const entry = index?.formats[cursor.formatIndex];
  const file = entry?.files[cursor.fileIndex];

  /** Load and play whatever the cursor points at. */
  const loadCurrent = useCallback(async () => {
    if (!entry || !file) return;
    setLoading(true);
    setStatus(`loading ${file.split('/').pop()}`);
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const name = file.split('/').pop() ?? 'song';
      await loadFile(new File([blob], name), { autoplay: true } as never);
      setStatus('');
    } catch (err) {
      // A load that throws IS a finding — the listener still wants to record
      // it, so this does not clear the cursor.
      setStatus(`load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [entry, file]);

  useEffect(() => { void loadCurrent(); }, [loadCurrent]);

  const step = useCallback((delta: number) => {
    if (!index) return;
    setNote('');
    setCursor((c) => {
      const next = c.formatIndex + delta;
      const wrapped = (next + index.formats.length) % index.formats.length;
      return { formatIndex: wrapped, fileIndex: 0 };
    });
  }, [index]);

  /** Another song from the SAME format — the first file is sometimes a bad
   *  example, which cost a detour on 2026-09-24. */
  const otherTake = useCallback(() => {
    if (!entry) return;
    setCursor((c) => ({ ...c, fileIndex: (c.fileIndex + 1) % entry.files.length }));
  }, [entry]);

  const send = useCallback(async (fault: typeof JUKEBOX_OK | (typeof JUKEBOX_FAULTS)[number]) => {
    if (!entry || !file) return;
    const ok = await reportFault(fault, {
      format: entry.format,
      file: file.split('/').pop() ?? file,
      note: note.trim() || undefined,
    });
    setJudged((j) => new Set(j).add(entry.format));
    setStatus(ok ? `${fault.label} → tracker` : `${fault.label} — tracker offline (:4444)`);
    step(1);
  }, [entry, file, note, step]);

  // Keyboard: the whole point is not reaching for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') { e.preventDefault(); step(1); return; }
      if (e.key === 'Backspace') { e.preventDefault(); step(-1); return; }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); otherTake(); return; }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); noteRef.current?.focus(); return; }
      if (e.key === '0') { e.preventDefault(); void send(JUKEBOX_OK); return; }
      const fault = JUKEBOX_FAULTS.find((f) => f.key === e.key);
      if (fault) { e.preventDefault(); void send(fault); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, otherTake, send]);

  const progress = useMemo(() => {
    if (!index) return '';
    return `${cursor.formatIndex + 1} / ${index.formats.length} formats · ${judged.size} judged`;
  }, [index, cursor.formatIndex, judged.size]);

  if (!index) {
    return (
      <div className="bg-dark-bgSecondary border-t border-dark-border px-3 py-2 text-[10px] font-mono text-text-muted">
        {status || 'loading song index…'}
      </div>
    );
  }

  return (
    <div className="bg-dark-bgSecondary border-t border-dark-border px-3 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-text-muted">JUKEBOX</span>
        <span className="text-[10px] font-mono text-accent-primary">{entry?.format}</span>
        <span className="text-[10px] font-mono text-text-secondary">
          {file?.split('/').pop()}
          {entry && entry.total > entry.files.length && ` (${cursor.fileIndex + 1}/${entry.files.length} of ${entry.total})`}
        </span>
        <span className="text-[10px] font-mono text-text-muted ml-auto">{progress}</span>
        <Button variant="ghost" onClick={onClose} title="Close the jukebox">Close</Button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Button variant="default" onClick={() => step(-1)} title="Previous format (Backspace)">Previous</Button>
        <Button variant="default" onClick={() => step(1)} title="Next format (Space)">Next</Button>
        <Button variant="default" onClick={otherTake} title="Another song from this format (R)">Another Take</Button>
        <Button variant="primary" onClick={() => void send(JUKEBOX_OK)} title="Plays and displays correctly (0)">Good</Button>
        {JUKEBOX_FAULTS.map((f) => (
          <Button key={f.id} variant="danger" onClick={() => void send(f)} title={`${f.title} (${f.key})`}>
            {f.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the next report (N)"
          className="bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs px-2 py-1 flex-1 focus:ring-1 focus:ring-accent-primary outline-none"
        />
        <span className="text-[10px] font-mono text-text-muted min-w-[16rem]">
          {loading ? 'loading…' : status}
        </span>
      </div>
    </div>
  );
};
