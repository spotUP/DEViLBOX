/**
 * Turning an assignment target into a label the controller diagram can show.
 *
 * The diagram used to print the raw target under every control, encoders with
 * no truncation at all and buttons hard-cut at eight characters. So the top
 * encoder row overlapped into an unreadable run —
 * "delayPresetQuadratdelayPresetDotted..." — and every one of the eight select
 * buttons read `channel_`, which is the same eight times and tells you
 * nothing about which channel it is (2026-09-23, from a screenshot).
 *
 * Cutting a name shorter is the wrong answer: DEViLBOX's house rule is full
 * English words in UI labels, and too little space means fix the layout. So
 * the label WRAPS to the room the control has and only elides when even that
 * is not enough, and the full target is always available on hover.
 */

/** Words worth splitting so a camelCase target can wrap at a real boundary. */
export function splitLabelWords(target: string): string[] {
  return target
    // Namespaces are noise on a diagram where every control is a dub control.
    .replace(/^(dub|dj|param)\./, '')
    // `channel_mute_4` and `delayPreset380` both become word runs.
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Break a target into at most `maxLines` lines of at most `maxChars`.
 *
 * A word longer than the budget is cut rather than allowed to overflow, and
 * the last line ends in an ellipsis when something had to be dropped — so a
 * truncated label always says that it is truncated instead of quietly reading
 * as a different control.
 */
export function wrapLabel(target: string, maxChars: number, maxLines = 2): string[] {
  if (!target) return [];
  if (maxChars <= 0 || maxLines <= 0) return [];
  const words = splitLabelWords(target);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';
  let dropped = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) { current = candidate; continue; }
    if (current) lines.push(current);
    if (lines.length >= maxLines) { dropped = true; current = ''; break; }
    // A single word too wide for the line gets cut here rather than overflowing.
    current = word.length > maxChars ? `${word.slice(0, Math.max(1, maxChars - 1))}…` : word;
  }
  if (current && lines.length < maxLines) lines.push(current);
  else if (current) dropped = true;

  if (dropped && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.endsWith('…')
      ? last
      : `${last.slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines;
}

/** How many monospace characters fit in `px` at `fontSize`. */
export function charsThatFit(px: number, fontSize: number): number {
  // Monospace advance is ~0.6em; a hair under, so a full line never touches
  // its neighbour.
  return Math.max(1, Math.floor(px / (fontSize * 0.62)));
}

/**
 * The tooltip for a control: what it does, and where it lives on the wire.
 *
 * The address is the useful half — "which knob is CC10" is exactly the
 * question the diagram exists to answer, and it was nowhere on screen.
 */
export function describeControl(opts: {
  id: string;
  target?: string;
  type: 'cc' | 'note' | 'pitchbend';
  channel: number;
  number: number;
  pushNote?: number;
  touchCc?: number;
  layer?: 'A' | 'B';
}): string {
  const addr = opts.type === 'cc' ? `CC${opts.number}` : opts.type === 'note' ? `note ${opts.number}` : 'pitch bend';
  const extra: string[] = [];
  if (opts.pushNote !== undefined) extra.push(`push note ${opts.pushNote}`);
  if (opts.touchCc !== undefined) extra.push(`touch CC${opts.touchCc}`);
  const where = [
    `${addr} on MIDI channel ${opts.channel + 1}`,
    ...extra,
    opts.layer ? `Layer ${opts.layer}` : null,
  ].filter(Boolean).join(' · ');
  return opts.target ? `${opts.target} — ${where}` : `${opts.id} — unassigned · ${where}`;
}
