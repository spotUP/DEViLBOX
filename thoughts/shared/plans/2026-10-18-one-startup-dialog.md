---
date: 2026-10-18
topic: One blocking dialog on app start
status: approved by owner (decisions below are the owner's, given in chat)
---

# One blocking dialog on app start

## Owner decisions
- D1. Never ask about restore. The previous session is restored silently; the user clears it if they do not want it.
- D2. Remove the "Click to Start" splash. Its place goes to the Tip of the day / What's new dialog.
- D3. That dialog opens on EVERY app start, not only when the build changed.
- D4. Goal: minimise blocking dialogs at start. Exactly one on a normal start.

## Current state (research: scratchpad startup-inventory.md, dialog-stack.md)
- Tips dialog: one component, TipOfTheDay.tsx (tips tab + changelog tab). Opened by the mount effect App.tsx:247-251, rendered App.tsx:1161. Decision: startupTipsModal (startupSequence.ts:30): new build (devilbox-seen-version != BUILD_NUMBER) opens the changelog tab, otherwise tips tab unless show-tips-at-startup === 'false'. Checkbox at TipOfTheDay.tsx:63-66, 96. Seen version written at TipOfTheDay.tsx:75.
- WhatsNewModal.tsx: no importer, dead code.
- Click to Start splash: App.tsx:1380-1388; shows when the jingle is enabled and tips is not shown. startStartupJingle is pressed from App.tsx:234-243 (effect: previous modal 'tips', none open now), MCPBridge.ts:499, writeHandlers.ts:2594.
- Recovery Modal: App.tsx:1394 ("Open your last project" / "Recover unsaved work"), useProjectPersistence.ts:660-692 decideBootRestore; added by 1e5704d72, held to jingle end by 69c8917bd. openSong (openSong.ts:375) awaits whenStartupJingleDone but never checks recoverySnapshot, so pressing Restore after a load overwrites the loaded song.
- MCPBridge.ts:803-809 sets both localStorage keys on MCP connect to suppress the tips dialog.
- Known hazard: App.tsx:237 starts the jingle only when the modal goes tips -> none. If another modal replaces tips (?collab= opens the collab modal at App.tsx:263), the gesture is lost, the stage stays awaiting-gesture and every song load waits forever.

## Design
1. Tips dialog always opens at start (D3). startupTipsModal returns the changelog tab on a new build, the tips tab otherwise; the show-tips-at-startup key and checkbox are removed. Unsupported Browser screen (App.tsx:917) still wins over everything.
2. Closing the tips dialog IS the start gesture (D2). Its close handler calls startStartupJingle directly (inside the click, so AudioContext unlock stays in the gesture), instead of the modal-transition effect at App.tsx:234-243. With the jingle disabled it still unlocks audio and ends the hold. No splash, no awaiting-gesture state without a visible dialog.
3. ?collab= link: the collab modal is the one start dialog instead of tips (owner's goal: one dialog); its close is the gesture too. The gesture never depends on which modal follows.
4. Recovery (D1): decideBootRestore applies its primary choice silently at boot (what the prompt's primary button did). The recovery Modal and its state are removed. A song load requested during boot runs after the silent restore has applied, so it is never overwritten.
5. MCP: the MCP connect no longer pre-sets localStorage keys. The agent closes the start dialog with the existing dismissModal path; MCPBridge.ts:499 and writeHandlers.ts:2594 route to "close the start dialog" instead of the splash. Responses keep naming the blocking dialog (everyResponseNamesABlockingDialog).
6. Delete WhatsNewModal.tsx only if nothing imports it (verify from the module graph, not grep alone). Not deleted if reserved; check memory rule "Don't delete reserved components" in the file header/comments.

## Tests
- Update: startupSequence.test.ts (splash test line 65 goes), clickToStartSplash.test.ts (rewrite for the dialog-close gesture), recoveryPrompt.test.ts:96, bootOffersNeverImposes.test.ts, recoveryGate.test.ts, agentAnswersRecoveryPrompt.test.ts, everyResponseNamesABlockingDialog.test.ts.
- New, one reachability test through the boot entry: a start opens exactly one blocking dialog; closing it starts the jingle / unlocks audio (sentinel: call count of jingle.unlock); whenStartupJingleDone resolves; a song load queued during boot lands after the silent restore.
- Regression: ?collab start, the gesture still ends the hold (fails before, passes after).

## Manual (owner, LOCAL http://localhost:5174)
- Fresh reload: one dialog (tips or changelog), close it, jingle plays, last project is there, no other prompt.
- Reload again: tips dialog again (every start).
