/**
 * ArrangementEditCommand - Batched undo for arrangement gestures
 *
 * Pattern:
 *   mousedown  -> cmd.begin()     // snapshot before state
 *   mousemove  -> visual feedback // no store changes
 *   mouseup    -> cmd.execute(fn) // apply all changes
 *                 cmd.commit()    // single undo entry
 *
 * Adapted from src/components/pianoroll/engine/EditCommand.ts
 */

import type { ArrangementSnapshot } from '@/types/arrangement';

export class ArrangementEditCommand {
  private beforeState: ArrangementSnapshot | null = null;
  private description = '';
  private committed = false;

  /**
   * Begin a new edit command. Snapshots the current arrangement state.
   */
  begin(snapshot: ArrangementSnapshot, description: string): void {
    this.beforeState = JSON.parse(JSON.stringify(snapshot));
    this.description = description;
    this.committed = false;
  }

  get isActive(): boolean {
    return this.beforeState !== null && !this.committed;
  }

  /**
   * Execute the edit function (makes all store changes).
   */
  execute(editFn: () => void): void {
    if (!this.isActive) return;
    editFn();
  }

  /**
   * Commit as a single undo entry. Pushes the pre-edit snapshot onto the undo stack.
   * @param pushUndo Function to push a snapshot onto undo stack
   */
  commit(pushUndo: (snapshot: ArrangementSnapshot) => void): void {
    if (!this.beforeState || this.committed) return;
    pushUndo(this.beforeState);
    this.committed = true;
    this.beforeState = null;
  }

  cancel(): void {
    this.beforeState = null;
    this.committed = false;
  }

  getBeforeState(): ArrangementSnapshot | null {
    return this.beforeState;
  }

  getDescription(): string {
    return this.description;
  }
}
