/**
 * WasmSynthParamBridge — generic 4-layer bridge for WASM-reflected editable synths.
 *
 * A "reflected synth" format runs a native replayer in a WASM AudioWorklet and exposes
 * per-instrument synthesis parameters via C getter/setter symbols. Making such a format
 * editable used to require four hand-written layers (worklet message shapes, engine mirror,
 * `onSynthParams` callback, store merge) re-implemented per format — the Sonix bridge is the
 * gold-standard exemplar (see `src/engine/registry/builtin/sonix.ts`).
 *
 * This module factors the reusable plumbing behind a DESCRIPTOR
 * (`WasmSynthParamBridgeSpec`) so a new reflected-synth format is a spec plus its
 * format-specific WASM symbol calls in the worklet, not four bespoke layers:
 *
 *   1. Worklet ↔ engine message SHAPE — the spec names the two message types
 *      (`reportMessage` worklet→engine, `setMessage` engine→worklet) and the param schema
 *      both sides serialize. (The worklet keeps its hand-rolled WASM symbol calls: an
 *      AudioWorkletGlobalScope cannot import project modules, and its getter/setter symbols
 *      are format-specific. It just has to emit/consume the message shape this spec defines.)
 *   2. Engine mirror — `WasmSynthParamBridge` caches the last-reported param sets, exposes a
 *      `params` getter, an `onParams` callback, and a `setParams()` that posts a normalized
 *      payload back to the worklet.
 *   3. Store merge — `mergeSynthParamsIntoStore` merges each reported param set into the
 *      matching instrument config, matched by `parameters[matchKey]`.
 *
 * Serialization is schema-driven and idempotent (clamping to each field's numeric range), so
 * `deserialize(serialize(p)) === p` for in-range params.
 */

/** Numeric kind of one reflected param field (scalar or fixed-length array). */
export type WasmParamKind =
  | 'u8'
  | 'i8'
  | 'u16'
  | 'i16'
  | 'i32'
  | 'u32'
  | 'i8[]'
  | 'u8[]'
  | 'i16[]'
  | 'u16[]';

/** One field in a reflected synth's param schema. */
export interface WasmSynthParamField {
  /** Property name on the param object (e.g. 'baseVol', 'wave'). */
  name: string;
  /** Numeric kind — drives clamp range and (for arrays) element normalization. */
  kind: WasmParamKind;
  /** Element count for array kinds (fixed length; padded with 0 / truncated). */
  length?: number;
}

/** Descriptor that generates the reusable bridge plumbing for one reflected-synth format. */
export interface WasmSynthParamBridgeSpec<P = Record<string, unknown>> {
  /** Human/debug key for the engine (e.g. 'Sonix'). */
  engineKey: string;
  /** SynthType id the merged instrument is tagged with (e.g. 'SonixSynth'). */
  synthType: string;
  /** Instrument `parameters.<matchKey>` used to match a reported param set to an instrument. */
  matchKey: string;
  /** Instrument `parameters.<blobKey>` the full param object is stored under. */
  blobKey: string;
  /** Field on the param object holding the WASM instrument index used for matching. */
  indexField: Extract<keyof P, string>;
  /** Worklet→engine message type carrying `{ instruments: P[] }`. */
  reportMessage: string;
  /** Engine→worklet message type carrying `{ params: P }`. */
  setMessage: string;
  /** Ordered param schema — the single source of truth for (de)serialization. */
  paramSchema: WasmSynthParamField[];
}

const SCALAR_RANGES: Record<string, { min: number; max: number }> = {
  u8: { min: 0, max: 0xff },
  i8: { min: -0x80, max: 0x7f },
  u16: { min: 0, max: 0xffff },
  i16: { min: -0x8000, max: 0x7fff },
  u32: { min: 0, max: 0xffffffff },
  i32: { min: -0x80000000, max: 0x7fffffff },
};

const isArrayKind = (kind: WasmParamKind): boolean => kind.endsWith('[]');

/** Element scalar kind for an array kind ('i8[]' → 'i8'). */
const elementKind = (kind: WasmParamKind): string => kind.slice(0, -2);

function clampScalar(kind: string, value: unknown): number {
  const n = Math.round(Number(value) || 0);
  const range = SCALAR_RANGES[kind];
  if (!range) return n;
  return Math.max(range.min, Math.min(range.max, n));
}

function normalizeArray(field: WasmSynthParamField, value: unknown): number[] {
  const len = field.length ?? 0;
  const elem = elementKind(field.kind);
  const src = Array.isArray(value) ? value : [];
  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) out[i] = clampScalar(elem, src[i]);
  return out;
}

/**
 * Normalize a param object to the schema: every scalar clamped to its range, every array
 * clamped element-wise and forced to its fixed length. Idempotent — the shared core of both
 * `serializeSynthParams` and `deserializeSynthParams`. Returns a fresh object holding exactly
 * the schema fields (extra properties are dropped).
 */
export function normalizeSynthParams<P extends Record<string, unknown>>(
  spec: WasmSynthParamBridgeSpec<P>,
  params: Record<string, unknown>,
): P {
  const out: Record<string, unknown> = {};
  for (const field of spec.paramSchema) {
    out[field.name] = isArrayKind(field.kind)
      ? normalizeArray(field, params[field.name])
      : clampScalar(field.kind, params[field.name]);
  }
  return out as P;
}

/**
 * Serialize a param object into the canonical transferable payload posted to the worklet
 * (schema-normalized; structured-clone-safe). Symmetric with `deserializeSynthParams`.
 */
export function serializeSynthParams<P extends Record<string, unknown>>(
  spec: WasmSynthParamBridgeSpec<P>,
  params: Record<string, unknown>,
): P {
  return normalizeSynthParams(spec, params);
}

/**
 * Deserialize a payload received from the worklet back into a normalized param object.
 * Symmetric with `serializeSynthParams` — `deserialize(serialize(p))` equals `p` for
 * in-range params.
 */
export function deserializeSynthParams<P extends Record<string, unknown>>(
  spec: WasmSynthParamBridgeSpec<P>,
  payload: Record<string, unknown>,
): P {
  return normalizeSynthParams(spec, payload);
}

/** Minimal instrument-store surface the merge needs — keeps the bridge unit-testable. */
export interface InstrumentStoreLike {
  instruments: Array<{ id: number; parameters?: Record<string, unknown> }>;
  updateInstrument: (id: number, updates: unknown) => void;
}

/**
 * Merge reported param sets into their matching instrument configs.
 *
 * Each param set is matched to an instrument by `parameters[spec.matchKey] === p[indexField]`,
 * then written back as a first-class synth (`type:'synth'`, `synthType: spec.synthType`) with
 * the full param object stored under `parameters[spec.blobKey]`. Synchronous + store-injected
 * so it can be unit-tested with a fake store.
 */
export function mergeSynthParamsIntoStore<P extends Record<string, unknown>>(
  spec: WasmSynthParamBridgeSpec<P>,
  params: P[],
  store: InstrumentStoreLike,
): void {
  if (!params.length) return;
  for (const p of params) {
    const idx = p[spec.indexField];
    const inst = store.instruments.find(
      (c) => (c.parameters as Record<string, unknown> | undefined)?.[spec.matchKey] === idx,
    );
    if (!inst) continue;
    store.updateInstrument(inst.id, {
      type: 'synth',
      synthType: spec.synthType,
      parameters: { [spec.matchKey]: idx, [spec.blobKey]: p },
    });
  }
}

/**
 * Default store-merge that dynamically imports the real instrument store (avoids an eager
 * store import from the synth registry / engine, matching the original Sonix bridge).
 */
export async function mergeSynthParamsIntoDefaultStore<P extends Record<string, unknown>>(
  spec: WasmSynthParamBridgeSpec<P>,
  params: P[],
): Promise<void> {
  if (!params.length) return;
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  mergeSynthParamsIntoStore(
    spec,
    params,
    useInstrumentStore.getState() as unknown as InstrumentStoreLike,
  );
}

/**
 * Engine-side mirror for a reflected synth. Compose one per WASM engine instance, passing a
 * `post` bound to the worklet node's port. The engine's worklet `onmessage` handler routes
 * the `reportMessage` payload into `handleReport`; `setParams` posts an edited param set back.
 */
export class WasmSynthParamBridge<P extends Record<string, unknown>> {
  private _params: P[] = [];
  /** Fired after the worklet reports its parsed param sets (post-normalization). */
  onParams: ((params: P[]) => void) | null = null;
  private readonly spec: WasmSynthParamBridgeSpec<P>;
  private readonly post: (message: unknown) => void;

  constructor(spec: WasmSynthParamBridgeSpec<P>, post: (message: unknown) => void) {
    this.spec = spec;
    this.post = post;
  }

  /** Route a worklet `reportMessage` payload here. Normalizes, caches, and fires `onParams`. */
  handleReport(payload: { instruments?: P[] } | undefined): void {
    const raw = payload?.instruments ?? [];
    this._params = raw.map((p) => deserializeSynthParams(this.spec, p));
    this.onParams?.(this._params);
  }

  /** The param sets mirrored from the worklet after the current module loaded. */
  get params(): P[] {
    return this._params;
  }

  /** Push an edited param set back into the live worklet (normalized to the schema). */
  setParams(params: P): void {
    this.post({ type: this.spec.setMessage, params: serializeSynthParams(this.spec, params) });
  }
}
