/**
 * Pure decision logic for crash-recovery autosave.
 *
 * Recovery snapshots exist to cover the window where a project has NEVER been
 * explicitly saved (Ctrl+S / save button). A renderer crash in that window —
 * e.g. the sample-editor OOM freeze — otherwise loses the entire session with
 * zero persistence. Once the user saves explicitly even once, the existing
 * explicit-gated auto-save owns persistence and recovery hands off.
 *
 * No IndexedDB / React imports here on purpose: this module is the fully
 * unit-testable core, and the hook wires it to real store/IDB state.
 */

/** Should a recovery snapshot be written right now? */
export function shouldWriteRecovery(args: {
  explicitlySaved: boolean;
  isDirty: boolean;
  hasContent: boolean;
}): boolean {
  return !args.explicitlySaved && args.isDirty && args.hasContent;
}

/**
 * Does the project hold enough to be worth recovering? A single empty default
 * pattern with no instruments is a pristine boot — recovering it would only
 * produce a confusing "restore?" prompt for a blank project. Works over both
 * live-store counts and a stored SavedProject's arrays.
 */
export function hasProjectContent(args: {
  instrumentCount: number;
  patternCount: number;
}): boolean {
  return args.instrumentCount > 0 || args.patternCount > 1;
}

/** On boot: should the Restore/Discard prompt appear? */
export function shouldPromptRestore(args: {
  hasRecoveryRecord: boolean;
  everExplicitlySaved: boolean;
}): boolean {
  return args.hasRecoveryRecord && !args.everExplicitlySaved;
}
