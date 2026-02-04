/**
 * KeyboardShortcutSheet - Overlay showing all tracker keyboard shortcuts
 * Toggle with Shift+? or from toolbar
 */

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface ShortcutEntry {
  keys: string;
  action: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Arrow Up/Down', action: 'Move cursor up/down' },
      { keys: 'Arrow Left/Right', action: 'Move cursor left/right' },
      { keys: 'Tab / Shift+Tab', action: 'Next/prev channel' },
      { keys: 'PageUp / PageDown', action: 'Jump 16 rows' },
      { keys: 'Home / End', action: 'Jump to first/last row' },
      { keys: 'F9-F12', action: 'Jump to 0%/25%/50%/75%' },
      { keys: 'Shift+Arrow L/R', action: 'Prev/next pattern' },
      { keys: 'Alt+Q-I', action: 'Jump to tracks 0-7' },
      { keys: 'Alt+A-K', action: 'Jump to tracks 8-15' },
    ],
  },
  {
    title: 'Playback',
    shortcuts: [
      { keys: 'Space', action: 'Stop / toggle edit mode' },
      { keys: 'Right Shift', action: 'Record + play pattern' },
      { keys: 'Right Ctrl', action: 'Play song' },
      { keys: 'Right Alt', action: 'Play pattern' },
      { keys: 'Ctrl+Enter', action: 'Play song' },
    ],
  },
  {
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z-M (bottom row)', action: 'Notes C-B (lower octave)' },
      { keys: 'Q-P (top row)', action: 'Notes C-E (upper octave)' },
      { keys: 'F1-F7', action: 'Select octave 1-7' },
      { keys: 'Numpad +/-', action: 'Octave up/down' },
      { keys: 'CapsLock', action: 'Note off' },
      { keys: '` / ~', action: 'Edit step +1 / -1' },
    ],
  },
  {
    title: 'Editing',
    shortcuts: [
      { keys: 'Delete', action: 'Delete at cursor' },
      { keys: 'Shift+Delete', action: 'Delete entire cell' },
      { keys: 'Backspace', action: 'Delete previous & move up' },
      { keys: 'Insert', action: 'Insert row / toggle insert mode' },
      { keys: 'Shift+Insert', action: 'Insert entire line' },
    ],
  },
  {
    title: 'Block Operations',
    shortcuts: [
      { keys: 'Alt+B / Alt+E', action: 'Mark block start/end' },
      { keys: 'Ctrl+C / Ctrl+X', action: 'Copy / Cut' },
      { keys: 'Ctrl+V', action: 'Paste' },
      { keys: 'Ctrl+Shift+V', action: 'Mix paste (fill empty)' },
      { keys: 'Ctrl+Shift+F', action: 'Flood paste (to end)' },
      { keys: 'F3 / F4 / F5', action: 'Cut / Copy / Paste (FT2)' },
      { keys: 'Alt+Arrow keys', action: 'Extend selection' },
    ],
  },
  {
    title: 'Transpose',
    shortcuts: [
      { keys: 'Ctrl+Up/Down', action: 'Transpose ±1 semitone' },
      { keys: 'Ctrl+Shift+Up/Down', action: 'Transpose ±1 octave' },
      { keys: 'Alt+T / Alt+Shift+T', action: 'Block transpose ±1' },
    ],
  },
  {
    title: 'Macros & Dialogs',
    shortcuts: [
      { keys: 'Ctrl+1-8', action: 'Recall macro slot' },
      { keys: 'Ctrl+Shift+1-8', action: 'Save macro slot' },
      { keys: 'Ctrl+I', action: 'Interpolate' },
      { keys: 'Ctrl+H', action: 'Humanize' },
      { keys: 'Ctrl+F', action: 'Find & Replace' },
      { keys: 'Ctrl+O', action: 'Import module' },
      { keys: '?', action: 'This shortcut sheet' },
    ],
  },
  {
    title: 'Effect Commands',
    shortcuts: [
      { keys: '0xy', action: 'Arpeggio' },
      { keys: '1/2xx', action: 'Pitch slide up/down' },
      { keys: '3xx', action: 'Tone portamento' },
      { keys: '4xy', action: 'Vibrato' },
      { keys: 'Axy', action: 'Volume slide' },
      { keys: 'Cxx', action: 'Set volume (00-40)' },
      { keys: 'Fxx', action: 'Speed (01-1F) / BPM (20-FF)' },
      { keys: 'Exy', action: 'Extended commands' },
    ],
  },
];

interface KeyboardShortcutSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutSheet: React.FC<KeyboardShortcutSheetProps> = ({ isOpen, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lowerFilter = filter.toLowerCase();
  const filteredSections = SHORTCUT_SECTIONS.map(section => ({
    ...section,
    shortcuts: section.shortcuts.filter(
      s => s.keys.toLowerCase().includes(lowerFilter) || s.action.toLowerCase().includes(lowerFilter)
    ),
  })).filter(section => section.shortcuts.length > 0);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[720px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-100">Keyboard Shortcuts</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-xs text-neutral-200 w-32 focus:outline-none focus:border-blue-500"
              autoFocus
              aria-label="Filter keyboard shortcuts"
            />
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-4">
            {filteredSections.map((section) => (
              <div key={section.title} className="space-y-1">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wide mb-2">
                  {section.title}
                </h3>
                {section.shortcuts.map((shortcut, i) => (
                  <div key={`${section.title}-${i}`} className="flex items-center justify-between gap-2 py-0.5">
                    <kbd className="text-[10px] font-mono bg-neutral-800 border border-neutral-600 rounded px-1.5 py-0.5 text-yellow-300 whitespace-nowrap">
                      {shortcut.keys}
                    </kbd>
                    <span className="text-[11px] text-neutral-300 text-right">{shortcut.action}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-neutral-700 text-[10px] text-neutral-500 text-center">
          Press <kbd className="bg-neutral-800 border border-neutral-600 rounded px-1 text-yellow-400">Esc</kbd> to close
          {' '} | Ctrl/Cmd shown as Ctrl (use Cmd on macOS)
        </div>
      </div>
    </div>
  );
};
