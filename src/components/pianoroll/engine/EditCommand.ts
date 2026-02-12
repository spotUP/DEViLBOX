/**
 * EditCommand - Batched undo for piano roll gestures
 *
 * Pattern:
 *   mousedown  -> cmd.begin(pattern)     // snapshot before state
 *   mousemove  -> visual feedback only   // no setCell calls
 *   mouseup    -> cmd.execute(fn)        // apply all changes
 *                 cmd.commit(pushAction)  // single undo entry
 *
 * Integrates with useHistoryStore.pushAction().
 */

import type { Pattern } from '../../../types/tracker';

export class EditCommand {
  private beforeState: Pattern | null = null;
  private description = '';
  private patternIndex = -1;
  private committed = false;

  /**
   * Begin a new edit command. Snapshots the current pattern state.
   */
  begin(pattern: Pattern, patternIndex: number, description: string): void {
    this.beforeState = JSON.parse(JSON.stringify(pattern));
    this.patternIndex = patternIndex;
    this.description = description;
    this.committed = false;
  }

  /**
   * Check if a command is in progress.
   */
  get isActive(): boolean {
    return this.beforeState !== null && !this.committed;
  }

  /**
   * Execute the edit. Call the provided function to make all setCell calls.
   * The function receives no args - it should closure over the needed context.
   */
  execute(editFn: () => void): void {
    if (!this.isActive) return;
    editFn();
  }

  /**
   * Commit the edit as a single undo entry.
   * @param afterPattern The pattern state after all edits
   * @param pushAction The history store's pushAction function
   */
  commit(
    afterPattern: Pattern,
    pushAction: (
      type: string,
      description: string,
      patternIndex: number,
      before: Pattern,
      after: Pattern,
    ) => void,
  ): void {
    if (!this.beforeState || this.committed) return;

    pushAction(
      'EDIT_CELL',
      this.description,
      this.patternIndex,
      this.beforeState,
      JSON.parse(JSON.stringify(afterPattern)),
    );

    this.committed = true;
    this.beforeState = null;
  }

  /**
   * Cancel the command without committing.
   */
  cancel(): void {
    this.beforeState = null;
    this.committed = false;
  }

  /**
   * Get the before-state for undo purposes.
   */
  getBeforeState(): Pattern | null {
    return this.beforeState;
  }
}
