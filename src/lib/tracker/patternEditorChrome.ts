/**
 * Pattern-editor chrome — the single source of truth for the record-mode visual
 * signal on the grid container.
 *
 * FT2 frames the pattern view in red while edit (record) mode is active, so it
 * is obvious that keystrokes will be written into the pattern. DEViLBOX only
 * showed a toolbar dot; this adds the framing.
 *
 * Pure so the class choice can be unit-tested without mounting the canvas.
 */

/**
 * Tailwind classes for the record-mode border, or '' when not recording.
 * Uses the error/destructive accent token (red) with an inset ring so it frames
 * the grid without shifting layout.
 */
export function recordModeBorderClass(recordMode: boolean): string {
  return recordMode ? 'ring-1 ring-inset ring-accent-error' : '';
}
