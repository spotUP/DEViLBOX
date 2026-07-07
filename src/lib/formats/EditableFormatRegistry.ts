// src/lib/formats/EditableFormatRegistry.ts
/**
 * EditableFormatRegistry — the single source of truth for "what can DEViLBOX do
 * with this format": edit its patterns, edit its synth voices, export it natively.
 *
 * Historically these facts were scattered across SIX hand-maintained places
 * (research 2026-07-07 §4.1):
 *   - `uadePatternLayout.formatId` on the song (which codec is wired)
 *   - `SynthRegistry` (which synth voices exist)
 *   - `EDITABLE_FORMAT_LABELS` + `NATIVE_EXPORTABLE_LABELS` hand-lists in
 *     `FormatCapabilities.ts` (~90% overlapping)
 *   - the `LAYOUT_EXPORTERS` dispatch map in `nativeExportRouter.ts`
 *
 * A descriptor here co-locates all of it, keyed by the same `formatId` the
 * encoders/exporters already use. Capabilities are then DERIVED:
 *   - a registered pattern codec (or synth voice) ⇒ the format is editable
 *   - a registered exporter (or a chip-RAM pattern codec) ⇒ it is natively
 *     exportable
 *
 * `FormatCapabilities.getFormatCapabilities` consults this registry first and
 * keeps only the genuine special cases the registry cannot yet express as
 * shrunken hand-lists (see the comments there). `nativeExportRouter` reads its
 * `layoutFormatId → {module, fn, ext}` dispatch map straight from the `exporter`
 * descriptors flagged `byLayout` — one map, no duplicate literal.
 *
 * Registration is a side effect of importing `./EditableFormatRegistry.builtins`
 * (mirrors the `SynthRegistry` builtins barrel), so every consumer that imports
 * the accessors below must also import the builtins barrel to populate the map.
 */

// ── Descriptor ────────────────────────────────────────────────────────────────

export interface EditableExporterRef {
  /** Module file under `src/lib/export/` (no extension). */
  module: string;
  /** Named export in that module. */
  fn: string;
  /** Extension for exporters that return raw bytes; omit for self-naming results. */
  ext?: string;
  /** Whether this exporter writes companion/sidecar files (e.g. Cinter `.raw`). */
  companions?: boolean;
  /**
   * `true` when the export is dispatched purely on `uadePatternLayout.formatId`
   * (the former `LAYOUT_EXPORTERS` map). These feed `getLayoutExporters()` for
   * the router. Named-format branches (dispatched on `song.format`) omit this.
   */
  byLayout?: boolean;
}

export interface EditableSynthRef {
  /** SynthRegistry descriptor id (e.g. 'SonixSynth'). */
  synthType: string;
  /** Controls component name (e.g. 'SonixControls'). */
  controls: string;
}

export interface EditableFormatDescriptor {
  /** Matches the `layoutFormatId` used by exporters/encoders. */
  formatId: string;
  /**
   * The exact FormatRegistry label this format surfaces as. Used to derive
   * capabilities by label in `getFormatCapabilities`. When a format's real
   * label is intentionally NOT surfaced with a capability yet (preserving
   * historical behavior), leave `label` empty so the descriptor is inert for
   * capability derivation while still serving the router via `formatId`.
   */
  label: string;
  /** Present when a pattern codec (encoder) is registered for this formatId. */
  patternCodec?: { kind: 'fixed' | 'variable' };
  /** Present when a dedicated native exporter exists. */
  exporter?: EditableExporterRef;
  /** Present when a SynthRegistry voice backs this format's instruments. */
  synth?: EditableSynthRef;
  /** Real fixture paths under `public/data/songs/` for the round-trip harnesses. */
  fixtures?: string[];
}

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<string, EditableFormatDescriptor>();

/** Register (or overwrite) a descriptor keyed by its `formatId`. */
export function registerEditableFormat(d: EditableFormatDescriptor): void {
  registry.set(d.formatId, d);
}

/** Get the descriptor for a formatId, or undefined. */
export function getEditableFormat(formatId: string): EditableFormatDescriptor | undefined {
  return registry.get(formatId);
}

/** List every registered descriptor (insertion order). */
export function listEditableFormats(): EditableFormatDescriptor[] {
  return Array.from(registry.values());
}

// ── Derived capability views (consumed by FormatCapabilities) ──────────────────

/**
 * Set of FormatRegistry labels the registry marks EDITABLE: any descriptor with
 * a pattern codec or a synth voice. Inert (empty-label) descriptors are skipped.
 */
export function getRegistryEditableLabels(): Set<string> {
  const out = new Set<string>();
  for (const d of registry.values()) {
    if (d.label && (d.patternCodec || d.synth)) out.add(d.label);
  }
  return out;
}

/**
 * Set of FormatRegistry labels the registry marks NATIVELY EXPORTABLE: any
 * descriptor with a dedicated exporter OR a chip-RAM pattern codec (which
 * exports via chip-RAM readback). Inert (empty-label) descriptors are skipped.
 */
export function getRegistryExportableLabels(): Set<string> {
  const out = new Set<string>();
  for (const d of registry.values()) {
    if (d.label && (d.exporter || d.patternCodec)) out.add(d.label);
  }
  return out;
}

// ── Router view (consumed by nativeExportRouter) ───────────────────────────────

export interface LayoutExporterEntry {
  module: string;
  fn: string;
  ext?: string;
}

/**
 * The `layoutFormatId → {module, fn, ext}` dispatch map for the native export
 * router — every descriptor whose exporter is flagged `byLayout`. Single source;
 * replaces the former duplicated `LAYOUT_EXPORTERS` literal.
 */
export function getLayoutExporters(): Record<string, LayoutExporterEntry> {
  const out: Record<string, LayoutExporterEntry> = {};
  for (const d of registry.values()) {
    if (d.exporter?.byLayout) {
      out[d.formatId] = { module: d.exporter.module, fn: d.exporter.fn, ext: d.exporter.ext };
    }
  }
  return out;
}
