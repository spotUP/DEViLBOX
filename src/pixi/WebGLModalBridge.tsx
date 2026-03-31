/**
 * WebGLModalBridge — Keyboard shortcut routing for WebGL mode.
 *
 * Bridges `dialogOpen` commands (fired by keyboard shortcuts) to `modalOpen`
 * state consumed by GL dialogs in PixiRoot.
 *
 * All modal rendering is now handled by PixiRoot — no DOM modals remain.
 */

import { useEffect } from 'react';
import { useUIStore } from '@stores';


export const WebGLModalBridge: React.FC = () => {
  const dialogOpen = useUIStore(s => s.dialogOpen);
  const closeDialogCommand = useUIStore(s => s.closeDialogCommand);
  const openModal = useUIStore(s => s.openModal);

  // Bridge dialogOpen commands (from keyboard shortcuts) to modalOpen state.
  // In DOM mode, TrackerView handles this. In WebGL mode, this bridge does it.
  useEffect(() => {
    if (!dialogOpen) return;
    switch (dialogOpen) {
      case 'interpolate-volume':
      case 'interpolate-effect':
        openModal('interpolate');
        break;
      case 'humanize':
        openModal('humanize');
        break;
      case 'find-replace':
        openModal('findReplace');
        break;
      case 'groove-settings':
        openModal('grooveSettings');
        break;
      case 'scale-volume-block':
        openModal('scaleVolume', { scope: 'block' });
        break;
      case 'scale-volume-track':
        openModal('scaleVolume', { scope: 'track' });
        break;
      case 'scale-volume-pattern':
        openModal('scaleVolume', { scope: 'pattern' });
        break;
      case 'keyboard-help':
        openModal('shortcutSheet');
        break;
      case 'advanced-edit':
        openModal('advancedEdit');
        break;
      case 'fade-volume':
        openModal('fadeVolume');
        break;
      case 'strum':
        openModal('strum');
        break;
      case 'effect-picker':
        openModal('effectPicker');
        break;
      case 'undo-history':
        openModal('undoHistory');
        break;
      case 'automation':
        openModal('automation');
        break;
      case 'collaboration':
        openModal('collaboration');
        break;
      case 'randomize':
        openModal('randomize');
        break;
      case 'acid-pattern':
        openModal('acidPattern');
        break;
      case 'pattern-length':
        openModal('patternLength');
        break;
      case 'tempo-tap':
        // Tap tempo is handled inline, no modal needed
        break;
    }
    closeDialogCommand();
  }, [dialogOpen, closeDialogCommand, openModal]);

  return null;
};
