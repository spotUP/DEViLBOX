/**
 * reportLoadFailure - THE way a failed song or project load is told to the person.
 *
 * A toast that stays until closed (duration 0), whose text can be selected and
 * copied (ToastNotification). The modal "Load Failed" alert it replaces had text
 * that could not be copied (the body is user-select: none). Every opener's
 * failure path (drop, file browser, dialog, project, TD-3) calls this.
 */
import { notify } from '@/stores/useNotificationStore';

export function reportLoadFailure(message: string): void {
  notify.error(`Load failed - ${message}`, 0);
}
