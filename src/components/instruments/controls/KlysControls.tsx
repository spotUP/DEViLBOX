/**
 * KlysControls - the klystrack instrument editor: glue only.
 *
 *  - The controls are the house declarative layout (constants/synthLayouts/klystrack.ts), rendered by the shared
 *    DOMSynthPanel. klysLayoutValues / applyKlysLayoutChange translate between the layout's record and the native
 *    instrument; every edit goes through klysInstrumentEdit, the one write path (store + engine + undo).
 *  - Below it, the 32-step program in the shared InstrumentTableEditor (klysProgramAdapter), the playing step
 *    marked from the engine's program status, the meaning of the step under the cursor, and the command list.
 *
 * Instrument index = InstrumentConfig.id - 1 (klysInstrumentIndex).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InstrumentConfig } from '@/types';
import { useFormatStore } from '@stores/useFormatStore';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import { KLYS_EMPTY_STEP, klysInstrumentIndex } from '@/engine/klystrack/klysInstrumentFields';
import { KLYS_PROGRAM_COMMANDS, describeKlysStep } from '@/engine/klystrack/klysProgramCommands';
import { getDevilboxAudioContext } from '@/utils/audio-context';
import { voiceMarkerFor } from '@/engine/klystrack/klysVoiceStatus';
import { buildKlystrackLayout, type KlysCurveContext } from '@/constants/synthLayouts/klystrack';
import { applyKlysLayoutChange, klysLayoutValues, type KlysLayoutValues } from '@/components/klystrack/klysLayoutAdapter';
import {
  KLYS_PROGRAM_COLUMNS, klysProgramCellChange, klysProgramToRows,
} from '@/components/klystrack/klysProgramAdapter';
import {
  deleteKlysProgramStep, insertKlysProgramStep, redoKlysInstrumentEdit, undoKlysInstrumentEdit,
} from '@/components/klystrack/klysInstrumentEdit';
import { DOMSynthPanel } from './DOMSynthPanel';
import { InstrumentTableEditor } from '@components/instruments/shared/InstrumentTableEditor';
import { SectionLabel } from '@components/instruments/shared/SectionLabel';
import { Button } from '@components/ui/Button';
import { TabStrip } from '@components/ui/TabStrip';

type KlysTab = 'main' | 'program';
const KLYS_TABS: ReadonlyArray<{ id: KlysTab; label: string }> = [
  { id: 'main', label: 'Main' },
  { id: 'program', label: 'Program and Commands' },
];

const hex4 = (v: number): string => v.toString(16).toUpperCase().padStart(4, '0');

/** The command list of the program: word (argument bits as X), name and argument range. */
const KlysProgramCommandHelp: React.FC = () => (
  <div className="flex flex-col gap-1">
    <SectionLabel color="var(--color-accent-secondary)" label="Program Commands" />
    <div className="grid grid-cols-[repeat(2,max-content)] gap-x-6 gap-y-0.5 text-[10px] font-mono">
      {KLYS_PROGRAM_COMMANDS.map((cmd) => {
        const digits = hex4(cmd.word).split('').map((d, i) => ((cmd.mask >> (12 - 4 * i)) & 0xF) === 0xF ? d : 'X').join('');
        return (
          <div key={cmd.word + ':' + cmd.mask} className="flex gap-2 text-text-secondary">
            <span className="text-accent-primary">{digits}</span>
            <span className="truncate">{cmd.name}</span>
          </div>
        );
      })}
    </div>
  </div>
);

/** The audio context's rate for the curves; the editor can open before audio is initialised, then 48 kHz stands in. */
function audioSampleRate(): number {
  try { return getDevilboxAudioContext().sampleRate; } catch { return 48000; }
}

/** The live voice playing instrument `index`, from the engine's voice status (watched only while a curve subscribes). */
function klysVoiceSource(index: number): NonNullable<KlysCurveContext['voice']> {
  return {
    subscribe: (onVoice) => {
      if (!KlysEngine.hasInstance()) return () => {};
      return KlysEngine.getInstance().subscribeVoiceStatus((channels) => onVoice(voiceMarkerFor(channels, index)));
    },
  };
}

/** The step the first channel playing instrument `index` has its program running at, or undefined. */
function usePlayingProgramStep(index: number): number | undefined {
  const [step, setStep] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!KlysEngine.hasInstance()) return undefined;
    const unsubscribe = KlysEngine.getInstance().subscribeProgramStatus((channels) => {
      const playing = channels.find((c) => c.instrument === index && c.running);
      setStep(playing?.step);
    });
    return () => { unsubscribe(); setStep(undefined); };
  }, [index]);
  return step;
}

export const KlysControls: React.FC<{ instrument: InstrumentConfig }> = ({ instrument }) => {
  const index = klysInstrumentIndex(instrument.id);
  const inst = useFormatStore((s) => s.klysNative?.instruments[index]);
  const wavetables = useFormatStore((s) => s.klysNative?.wavetables);
  const layout = useMemo(
    () => buildKlystrackLayout(wavetables ?? [], { sampleRate: audioSampleRate(), voice: klysVoiceSource(index) }),
    [wavetables, index],
  );
  const values = useMemo(() => (inst ? klysLayoutValues(inst) : null), [inst]);
  const config = useMemo(() => ({ klys: values }), [values]);

  // configRef pattern (docs/CONTROL_PATTERNS.md): the change handler reads the latest values, its identity never changes.
  const valuesRef = useRef<KlysLayoutValues | null>(values);
  useEffect(() => { valuesRef.current = values; }, [values]);
  const onChange = useCallback((updates: Record<string, unknown>) => {
    const before = valuesRef.current;
    const after = updates.klys as KlysLayoutValues | undefined;
    if (before && after) applyKlysLayoutChange(index, before, after);
  }, [index]);

  const playingRow = usePlayingProgramStep(index);
  const [cursorRow, setCursorRow] = useState(0);
  const [tab, setTab] = useState<KlysTab>('main');
  const columns = useMemo(
    // The pattern renderers draw hex cells only, so the meaning column is not drawn: its text is shown below.
    () => KLYS_PROGRAM_COLUMNS(inst?.baseNote ?? 0).filter((c) => c.key !== 'meaning'),
    [inst?.baseNote],
  );
  const rows = useMemo(() => klysProgramToRows(inst?.program ?? []), [inst?.program]);
  const onCellChange = useMemo(() => klysProgramCellChange(index), [index]);

  if (!inst) {
    return <div className="p-4 text-[10px] font-mono text-text-muted">No klystrack song is loaded for this instrument.</div>;
  }

  const word = inst.program[cursorRow] ?? KLYS_EMPTY_STEP;
  return (
    <div className="flex flex-col gap-3 p-3 flex-1 min-h-0 overflow-y-auto scrollbar-modern">
      <TabStrip tabs={KLYS_TABS} active={tab} onChange={setTab} ariaLabel="Klystrack instrument sections" />
      {tab === 'main' && <DOMSynthPanel layout={layout} config={config} onChange={onChange} />}
      {tab === 'program' && (
        <div className="flex flex-1 min-h-0 items-stretch justify-center gap-8">
          {/* The table is five hex digits wide: it keeps a table's width at the full height of the tab and the legend takes the rest of the row. */}
          <div className="flex flex-col gap-2 w-[13rem] shrink-0 min-h-0">
            <InstrumentTableEditor
              label="Program"
              columns={columns}
              rows={rows}
              playingRow={playingRow}
              onCellChange={onCellChange}
              onCursorRow={setCursorRow}
              onInsertRow={(row) => insertKlysProgramStep(index, row)}
              onDeleteRow={(row) => deleteKlysProgramStep(index, row)}
              height="fill"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={undoKlysInstrumentEdit}>Undo</Button>
              <Button size="sm" onClick={redoKlysInstrumentEdit}>Redo</Button>
            </div>
            <span className="text-[10px] font-mono text-text-secondary">
              Step {String(cursorRow).padStart(2, '0')}: {describeKlysStep(word, inst.baseNote) || 'Empty step'}
            </span>
          </div>
          <div className="shrink-0">
            <KlysProgramCommandHelp />
          </div>
        </div>
      )}
    </div>
  );
};
