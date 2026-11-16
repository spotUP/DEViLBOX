/**
 * Memory Composition: where the 64 KB of SNES Audio-RAM goes (TAD driver, common data, song data, echo, free)
 * next to Furnace's own SPC/DSP memory report. Numbers come from the shared tadAudioRam budget and the
 * Furnace WASM's DivDispatch::getMemCompo; this component only presents them.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@stores';
import { useFormatStore } from '@stores/useFormatStore';
import { Button } from '@components/ui/Button';
import { FurnaceDispatchEngine } from '@engine/furnace-dispatch/FurnaceDispatchEngine';
import { FurnaceDispatchPlatform } from '@engine/furnace-dispatch/platforms';
import type { FurnaceMemCompo } from '@lib/export/dispatchRegCapture';
import {
  TAD_AUDIO_RAM_BYTES, SNES_ECHO_BYTES_PER_STEP, tadAudioRamBudget, tadAudioRamWarning,
  type TadAudioRamBudget,
} from '@lib/export/tad/tadAudioRam';

const DIV_MEMORY_SAMPLE = 3;
const DIV_MEMORY_ECHO = 9;
/** Sample area in Furnace's SPC memory is 0xF800 minus the echo buffer (snes.cpp getSampleMemCapacity). */
const SNES_SPC_TOP = 0xf800;

const ROW_COLOR: Record<string, string> = {
  driver: 'bg-dark-bgActive', common: 'bg-accent-primary', song: 'bg-accent-secondary', echo: 'bg-accent-warning', free: 'bg-dark-bgTertiary',
};

interface Report { budget: TadAudioRamBudget; compo: FurnaceMemCompo | null; truncated: string[]; message: string | null }

/** Samples Furnace cut: it drops every sample after the sample area fills and clips the one that crosses the edge. */
function truncatedSamples(compo: FurnaceMemCompo | null, names: string[]): string[] {
  if (!compo) return [];
  const echo = compo.entries.find((e) => e.type === DIV_MEMORY_ECHO);
  const capacity = echo ? echo.begin : SNES_SPC_TOP - 0;
  const samples = compo.entries.filter((e) => e.type === DIV_MEMORY_SAMPLE);
  const full = samples.length > 0 && capacity - Math.max(...samples.map((e) => e.end)) < 9;
  if (!full) return [];
  const present = new Set(samples.map((e) => e.asset));
  const cutEdge = samples.filter((e) => e.end > capacity - 9).map((e) => e.asset);
  return names.flatMap((n, i) => (!present.has(i) || cutEdge.includes(i) ? [n || `Sample ${i}`] : []));
}

async function measure(): Promise<Report> {
  const { exportTadProjectFile } = await import('@lib/export/moduleExportService');
  const names = (useFormatStore.getState().furnaceSamples ?? []).map((s) => s.name);
  const result = await exportTadProjectFile();
  const engine = FurnaceDispatchEngine.hasInstance() ? FurnaceDispatchEngine.getInstance() : null;
  const compo = engine ? await engine.getMemCompo(FurnaceDispatchPlatform.SNES) : null;
  const echoEntry = compo?.entries.find((e) => e.type === DIV_MEMORY_ECHO);
  const parts = result.audioRam ?? { commonBytes: 0, songBytes: 0, echoBytes: null };
  const budget = tadAudioRamBudget({ ...parts, echoBytes: parts.echoBytes ?? (echoEntry ? Math.round((echoEntry.end - echoEntry.begin) / SNES_ECHO_BYTES_PER_STEP) * SNES_ECHO_BYTES_PER_STEP : null) });
  const truncated = truncatedSamples(compo, names);
  const base = tadAudioRamWarning(budget);
  const message = base || truncated.length ? `${base ?? 'Furnace truncates samples.'}${truncated.length ? ` Truncated samples: ${truncated.join(', ')}.` : ''}` : null;
  return { budget, compo, truncated, message };
}

export const FurnaceMemoryComposition: React.FC = () => {
  const samples = useFormatStore((s) => s.furnaceSamples);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const wasOver = useRef(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await measure();
      setReport(r);
      // Warn on load and when an edit newly pushes the song over, never on every render.
      if (r.message && !wasOver.current) notify.warning(r.message);
      wasOver.current = r.message !== null;
    } catch (e) {
      notify.error(`Memory Composition failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void refresh(); }, 500);
    return () => clearTimeout(t);
  }, [samples, refresh]);

  const b = report?.budget;
  return (
    <div className="bg-dark-bg border-b border-dark-border px-3 py-2 text-[10px] font-mono text-text-secondary space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-text-primary">Memory Composition</span>
        <span className="text-text-muted flex-1">SNES Audio-RAM, {TAD_AUDIO_RAM_BYTES} bytes{report?.compo ? `; Furnace SPC/DSP: ${report.compo.used} of ${report.compo.capacity} bytes used` : ''}</span>
        <Button variant="ghost" size="sm" onClick={() => { void refresh(); }} disabled={busy}>{busy ? 'Measuring' : 'Measure Again'}</Button>
      </div>
      {b && (
        <>
          <div className="flex h-3 w-full overflow-hidden border border-dark-border rounded">
            {b.rows.map((r) => <div key={r.id} className={ROW_COLOR[r.id]} style={{ width: `${(r.bytes / Math.max(TAD_AUDIO_RAM_BYTES, b.usedBytes)) * 100}%` }} title={`${r.label}: ${r.bytes} bytes`} />)}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {b.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-1"><span className={`inline-block w-2 h-2 ${ROW_COLOR[r.id]}`} />{r.label}: <span className="text-text-primary">{r.bytes}</span></div>
            ))}
          </div>
        </>
      )}
      {report?.message && <div className="text-accent-error">{report.message}</div>}
    </div>
  );
};
