/**
 * Klystrack instrument edits - ONE write path for the instrument editor, the MIDI/NKS knobs and KlysSynth.
 *
 * `useFormatStore.klysNative.instruments` is the source of truth (klys_save_song serialises the WASM song, so
 * every edit must reach the store AND the engine in the same call). Each edit clamps through KLYS_FIELDS, sends
 * the changed member to the engine at once (a knob must be heard as it moves), and writes the store once per
 * animation frame (docs/CONTROL_PATTERNS.md: rAF-batched store write; one undo entry per gesture frame).
 */
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';
import type { KlysNativeInstrument } from '@/types/tracker';
import {
  KLYS_EMPTY_STEP,
  KLYS_EXEMPT_BITS,
  KLYS_FIELDS,
  KLYS_FLAG_MEMBER,
  KLYS_MEMBERS,
  KLYS_NAME_LENGTH,
  KLYS_PARAM_IDS,
  KLYS_PROGRAM_LENGTH,
  klysInstrumentId,
  type KlysFieldKey,
  type KlysFlagWord,
  type KlysMemberKey,
} from '@/engine/klystrack/klysInstrumentFields';

type Inst = KlysNativeInstrument;

/** Edits made since the last animation frame, per instrument: the working copy the next edit builds on. */
const pending = new Map<number, Inst>();
let flushScheduled = false;

const clone = (i: Inst): Inst => ({ ...i, adsr: { ...i.adsr }, fm: { ...i.fm, adsr: { ...i.fm.adsr } }, program: [...i.program] });

/** The instrument as the editor should read it now: pending edits first, then the store. */
function current(index: number): Inst | null {
  const queued = pending.get(index);
  if (queued) return queued;
  const stored = useFormatStore.getState().klysNative?.instruments[index];
  return stored ? clone(stored) : null;
}

/** A program padded to 32 words with the empty step (the parser's stub songs carry no program). */
function paddedProgram(program: number[]): number[] {
  const out = program.slice(0, KLYS_PROGRAM_LENGTH);
  while (out.length < KLYS_PROGRAM_LENGTH) out.push(KLYS_EMPTY_STEP);
  return out;
}

/** Write every queued instrument to the store now (one undo entry each). */
export function flushKlysInstrumentEdits(): void {
  flushScheduled = false;
  const queued = [...pending];
  pending.clear();
  for (const [index, inst] of queued) useFormatStore.getState().setKlysInstrument(index, inst);
}

function queue(index: number, inst: Inst): void {
  pending.set(index, inst);
  if (flushScheduled) return;
  flushScheduled = true;
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushKlysInstrumentEdits);
  else setTimeout(flushKlysInstrumentEdits, 0);
}

function engine(): KlysEngine | null {
  return KlysEngine.hasInstance() ? KlysEngine.getInstance() : null;
}

function sendMember(index: number, member: KlysMemberKey, inst: Inst): void {
  engine()?.setInstrumentParam(index, KLYS_PARAM_IDS[member], KLYS_MEMBERS[member].get(inst));
}

/** Set one field to `value` (clamped to the original editor's range). */
export function editKlysField(index: number, key: KlysFieldKey, value: number): void {
  const inst = current(index);
  if (!inst) return;
  const field = KLYS_FIELDS[key];
  const next = { ...inst, ...field.set(inst, field.clamp(value)) };
  queue(index, next);
  sendMember(index, field.member, next);
}

/** Flip one user bit of a flag word. Bits no control shows (KLYS_EXEMPT_BITS) are never changed. */
export function toggleKlysBit(index: number, word: KlysFlagWord, bit: number): void {
  if (bit & KLYS_EXEMPT_BITS[word]) return;
  const inst = current(index);
  if (!inst) return;
  const member = KLYS_FLAG_MEMBER[word];
  const next = { ...inst, ...KLYS_MEMBERS[member].patch(inst, (KLYS_MEMBERS[member].get(inst) ^ bit) >>> 0) };
  queue(index, next);
  sendMember(index, member, next);
}

function writeProgram(index: number, inst: Inst, program: number[]): void {
  const before = paddedProgram(inst.program);
  queue(index, { ...inst, program });
  const e = engine();
  if (!e) return;
  for (let step = 0; step < KLYS_PROGRAM_LENGTH; step++) {
    if (program[step] !== before[step]) e.setInstrumentProgramStep(index, step, program[step]);
  }
}

/** Set one program word (0..0xFFFF). */
export function editKlysProgramStep(index: number, step: number, word: number): void {
  const inst = current(index);
  if (!inst || step < 0 || step >= KLYS_PROGRAM_LENGTH) return;
  const program = paddedProgram(inst.program);
  program[step] = Math.min(0xFFFF, Math.max(0, Math.round(word)));
  writeProgram(index, inst, program);
}

/** Insert an empty step at `step`; the later steps move down and the last one falls off (edit_program_event). */
export function insertKlysProgramStep(index: number, step: number): void {
  const inst = current(index);
  if (!inst || step < 0 || step >= KLYS_PROGRAM_LENGTH) return;
  const program = paddedProgram(inst.program);
  program.splice(step, 0, KLYS_EMPTY_STEP);
  program.length = KLYS_PROGRAM_LENGTH;
  writeProgram(index, inst, program);
}

/** Delete the step at `step`; the later steps move up and an empty step is added at the end. */
export function deleteKlysProgramStep(index: number, step: number): void {
  const inst = current(index);
  if (!inst || step < 0 || step >= KLYS_PROGRAM_LENGTH) return;
  const program = paddedProgram(inst.program);
  program.splice(step, 1);
  program.push(KLYS_EMPTY_STEP);
  writeProgram(index, inst, program);
}

/** Rename an instrument: the native model and the instrument list entry. */
export function renameKlysInstrument(index: number, name: string): void {
  const inst = current(index);
  if (!inst) return;
  const clipped = name.slice(0, KLYS_NAME_LENGTH);
  queue(index, { ...inst, name: clipped });
  engine()?.setInstrumentName(index, clipped);
  useInstrumentStore.getState().updateInstrument(klysInstrumentId(index), { name: clipped });
}

/** Send every difference between two states of one instrument to the engine. */
function sendDiff(index: number, from: Inst, to: Inst): void {
  const e = engine();
  if (!e) return;
  for (const member of Object.keys(KLYS_PARAM_IDS) as KlysMemberKey[]) {
    const v = KLYS_MEMBERS[member].get(to);
    if (v !== KLYS_MEMBERS[member].get(from)) e.setInstrumentParam(index, KLYS_PARAM_IDS[member], v);
  }
  const a = paddedProgram(from.program);
  const b = paddedProgram(to.program);
  for (let step = 0; step < KLYS_PROGRAM_LENGTH; step++) if (a[step] !== b[step]) e.setInstrumentProgramStep(index, step, b[step]);
  if (from.name !== to.name) e.setInstrumentName(index, to.name);
}

function applyHistory(entry: { index: number; before: Inst; after: Inst } | null, direction: 'undo' | 'redo'): void {
  if (!entry) return;
  const [from, to] = direction === 'undo' ? [entry.after, entry.before] : [entry.before, entry.after];
  sendDiff(entry.index, from, to);
  if (from.name !== to.name) useInstrumentStore.getState().updateInstrument(klysInstrumentId(entry.index), { name: to.name });
}

export function undoKlysInstrumentEdit(): void {
  flushKlysInstrumentEdits();
  applyHistory(useFormatStore.getState().undoKlysInstrument(), 'undo');
}

export function redoKlysInstrumentEdit(): void {
  flushKlysInstrumentEdits();
  applyHistory(useFormatStore.getState().redoKlysInstrument(), 'redo');
}
