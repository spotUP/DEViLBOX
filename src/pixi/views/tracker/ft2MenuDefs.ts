/**
 * ft2MenuDefs — Menu definitions for PixiFT2Toolbar.
 * Builds the File / Module / Help menu structures for PixiMenuBar.
 */

import type { Menu } from '../../components/PixiMenuBar';

export interface FT2MenuActions {
  onShowExport: () => void;
  onShowHelp: (tab?: string) => void;
  onShowMasterFX: () => void;
  onShowInstrumentFX: () => void;
  onShowInstruments: () => void;
  onShowPatternOrder: () => void;
  onShowDrumpads: () => void;
  showMasterFX: boolean;
  showInstrumentFX: boolean;
}

export function buildFT2Menus(actions: FT2MenuActions): Menu[] {
  return [
    {
      label: 'File',
      items: [
        { type: 'action', label: 'Export...', shortcut: '⌘E', onClick: actions.onShowExport },
        { type: 'separator' },
        { type: 'action', label: 'Open Module...', onClick: () => {} },
      ],
    },
    {
      label: 'Module',
      items: [
        { type: 'action', label: 'Pattern Order', shortcut: '⌘O', onClick: actions.onShowPatternOrder },
        { type: 'action', label: 'Instruments', shortcut: '⌘I', onClick: actions.onShowInstruments },
        { type: 'action', label: 'Drum Pads', shortcut: '⌘D', onClick: actions.onShowDrumpads },
        { type: 'separator' },
        { type: 'checkbox', label: 'Master FX', checked: actions.showMasterFX, onChange: () => actions.onShowMasterFX() },
        { type: 'checkbox', label: 'Instrument FX', checked: actions.showInstrumentFX, onChange: () => actions.onShowInstrumentFX() },
      ],
    },
    {
      label: 'Help',
      items: [
        { type: 'action', label: 'Chip Reference', onClick: () => actions.onShowHelp('chip-effects') },
        { type: 'action', label: 'Keyboard Shortcuts', shortcut: '?', onClick: () => actions.onShowHelp('shortcuts') },
      ],
    },
  ];
}
