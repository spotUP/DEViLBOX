/**
 * One place that says what a SunVox module controller is: name, range, selector or continuous, group,
 * unit, default and selector value names.
 *
 * The shipped SunVox.wasm (official sv_* library) reports name/min/max/value/type/group per controller
 * but no unit, default or selector value names. The 14 module types whose sources are open have those
 * in SUNVOX_MODULE_CONTROLS (generated from psynth_register_ctl by tools/extract-sunvox-ctls.ts). The
 * runtime is the truth for range and type, because the shipped engine is newer than the open sources;
 * the static table only adds what the runtime cannot report, and only when the controller is the same
 * one (matched by name, not by index, since newer module versions insert controllers).
 */
import type { SunVoxControl } from './SunVoxEngine';
import { SUNVOX_MODULE_CONTROLS, type SunVoxStaticCtl } from './sunvoxModuleControls.generated';

export interface SunVoxCtlMeta {
  name: string;
  min: number;
  max: number;
  /** 0 = continuous, 1 = selector. */
  type: number;
  /** Controller group as SunVox reports it (0 when unknown). */
  group: number;
  /** Unit text from the sources, '' when unknown or unitless. */
  unit: string;
  /** Default value from the sources; undefined for closed modules. */
  def?: number;
  /** Selector value names (index 0 = min); undefined when not known for this exact range. */
  enumLabels?: string[];
  /** True when the open-source table described this controller. */
  fromSource: boolean;
}

export type SunVoxRuntimeCtl = Pick<SunVoxControl, 'name' | 'min' | 'max'> & Partial<Pick<SunVoxControl, 'type' | 'group'>>;

function findStatic(moduleTypeName: string, ctlIndex: number, runtime?: SunVoxRuntimeCtl): SunVoxStaticCtl | undefined {
  const table = SUNVOX_MODULE_CONTROLS[moduleTypeName];
  if (!table) return undefined;
  if (!runtime) return table[ctlIndex];
  const want = runtime.name.trim().toLowerCase();
  return table.find((c) => c.name.toLowerCase() === want);
}

/**
 * Metadata for controller `ctlIndex` of a module of type `moduleTypeName` (as sv_get_module_type reports
 * it, e.g. "Generator"). Pass the runtime controller when the engine has reported it.
 */
export function resolveSunVoxCtlMeta(moduleTypeName: string, ctlIndex: number, runtime: SunVoxRuntimeCtl): SunVoxCtlMeta;
export function resolveSunVoxCtlMeta(moduleTypeName: string, ctlIndex: number, runtime?: SunVoxRuntimeCtl): SunVoxCtlMeta | undefined;
export function resolveSunVoxCtlMeta(moduleTypeName: string, ctlIndex: number, runtime?: SunVoxRuntimeCtl): SunVoxCtlMeta | undefined {
  const known = findStatic(moduleTypeName, ctlIndex, runtime);
  if (!runtime && !known) return undefined;
  const min = runtime ? runtime.min : known!.min;
  const max = runtime ? runtime.max : known!.max;
  const type = runtime?.type ?? known?.type ?? 0;
  const labels = known?.enumLabels;
  return {
    name: runtime?.name ?? known!.name,
    min,
    max,
    type,
    group: runtime?.group ?? 0,
    unit: known?.unit ?? '',
    def: known?.def,
    enumLabels: type === 1 && labels && labels.length === max - min + 1 ? [...labels] : undefined,
    fromSource: known !== undefined,
  };
}
