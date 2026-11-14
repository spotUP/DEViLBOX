import { isShareHash } from '@lib/share/shareLink';

/**
 * The one decision: does this page load open the start dialog, and does it run
 * the startup jingle. Pure. Callers (openStartDialog, beginStartupSequence)
 * consume it; nothing else reads welcomeDialogEnabled or ?quiet.
 *
 * ?quiet is a per-page-load switch for agents and tests: no start dialog, no
 * jingle, and it never writes a setting.
 *
 * The jingle needs a user gesture to unlock audio, and the start dialog's
 * close is that gesture. With no dialog there is no such gesture, so the
 * jingle is skipped too; the app's first-interaction handler (App.tsx) then
 * unlocks audio on the first real click, key or touch.
 */
export interface StartupPolicySettings {
  welcomeDialogEnabled: boolean;
  welcomeJingleEnabled: boolean;
}

export interface StartupPolicy {
  openDialog: boolean;
  runJingle: boolean;
}

export function isQuietPage(search: string): boolean {
  return new URLSearchParams(search).has('quiet');
}

export function startupPolicy(search: string, settings: StartupPolicySettings, hash = ''): StartupPolicy {
  // A #share= link opens its song and its own Play prompt: no dialog, no jingle.
  const quiet = isQuietPage(search) || isShareHash(hash);
  const collabCode = new URLSearchParams(search).get('collab');
  const collabLink = !!collabCode && collabCode.length >= 6;
  // A ?collab= link is an explicit request to join a room, so it opens its modal
  // even when the welcome dialog is switched off; ?quiet beats everything.
  const openDialog = !quiet && (collabLink || settings.welcomeDialogEnabled);
  return { openDialog, runJingle: openDialog && settings.welcomeJingleEnabled };
}
