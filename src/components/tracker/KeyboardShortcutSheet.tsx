/**
 * KeyboardShortcutSheet - Overlay showing all tracker keyboard shortcuts
 * Toggle with Shift+? or from toolbar
 *
 * Dynamically loads shortcuts from the active keyboard scheme JSON
 * (FastTracker 2, ProTracker, Impulse Tracker, OctaMED, OpenMPT, Renoise)
 * instead of showing hardcoded text.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useKeyboardStore } from '../../stores/useKeyboardStore';
import { normalizeUrl } from '@/utils/urlUtils';

interface ShortcutEntry {
  keys: string;
  action: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

/** Build shortcut sections from scheme data, grouped by command category */
function buildSectionsFromScheme(schemeData: Record<string, string>): ShortcutSection[] {
  const cats: Record<string, ShortcutEntry[]> = {};
  const addTo = (cat: string, keys: string, cmd: string) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ keys, action: cmd.replace(/_/g, ' ') });
  };

  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== 'string') continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo('Playback', key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo('Navigation', key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo('Editing', key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo('Block Operations', key, cmd);
    else if (/^transpose_/.test(cmd)) addTo('Transpose', key, cmd);
    else if (/^(set_octave|next_octave|prev_octave)/.test(cmd)) addTo('Octave', key, cmd);
    else if (/^(set_instrument|next_instrument|prev_instrument|set_sample|instrument_|swap_instrument)/.test(cmd)) addTo('Instruments', key, cmd);
    else if (/^(mute_|solo_|unmute_|set_track|set_multi|reset_channel|channel_)/.test(cmd)) addTo('Channels', key, cmd);
    else if (/^(next_pattern|prev_pattern|next_block|prev_block|clone_|next_order|prev_order|next_sequence|prev_sequence|set_position|save_position|goto_position|sequence_|set_playback)/.test(cmd)) addTo('Patterns & Position', key, cmd);
    else if (/^(increase_|decrease_|set_step|set_edit|set_quantize|double_block|halve_block)/.test(cmd)) addTo('Step & Volume', key, cmd);
    else if (/^(toggle_|show_|open_|view_|close_|help$|configure|order_list|layout_|display_|cycle_|switch_to)/.test(cmd)) addTo('View & Settings', key, cmd);
    else if (/^(undo|redo|save_|export_|load_|new_|fast_save)/.test(cmd)) addTo('File & History', key, cmd);
    else if (/^(tracker_|power_cut|dj_)/.test(cmd)) addTo('DJ & Scratch', key, cmd);
    else addTo('Other', key, cmd);
  }

  // Prepend note entry (not in schemes — handled by keyboard piano input)
  const sections: ShortcutSection[] = [{
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z,S,X,D,C...', action: 'Piano keys lower row (C-B)' },
      { keys: 'Q,2,W,3,E...', action: 'Piano keys upper row (+1 octave)' },
      { keys: '0-9, A-F', action: 'Hex digits (instrument, volume, effect)' },
    ],
  }];

  const catOrder = ['Playback', 'Navigation', 'Editing', 'Block Operations', 'Transpose',
    'Octave', 'Instruments', 'Channels', 'Patterns & Position', 'Step & Volume',
    'View & Settings', 'File & History', 'DJ & Scratch', 'Other'];
  for (const cat of catOrder) {
    if (cats[cat]?.length) {
      sections.push({ title: cat, shortcuts: cats[cat] });
    }
  }
  return sections;
}

interface KeyboardShortcutSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutSheet: React.FC<KeyboardShortcutSheetProps> = ({ isOpen, onClose }) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const activeScheme = useKeyboardStore((s) => s.activeScheme);
  const [schemeData, setSchemeData] = useState<Record<string, string> | null>(null);

  // Load the active scheme's bindings
  useEffect(() => {
    if (!isOpen) return;
    const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac');
    fetch(normalizeUrl(`/keyboard-schemes/${activeScheme}.json`))
      .then(r => r.json())
      .then(data => {
        const plat = data.platform || data;
        setSchemeData(plat[isMac ? 'mac' : 'pc'] || plat.pc || {});
      })
      .catch(() => setSchemeData(null));
  }, [isOpen, activeScheme]);

  const sections = useMemo(() => {
    if (!schemeData) return [];
    return buildSectionsFromScheme(schemeData);
  }, [schemeData]);

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
  const filteredSections = sections.map(section => ({
    ...section,
    shortcuts: section.shortcuts.filter(
      s => s.keys.toLowerCase().includes(lowerFilter) || s.action.toLowerCase().includes(lowerFilter)
    ),
  })).filter(section => section.shortcuts.length > 0);

  const schemeName = activeScheme.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-[720px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">Keyboard Shortcuts</h2>
            <span className="text-[10px] font-mono bg-accent-primary/15 text-accent-primary px-2 py-0.5 rounded">
              {schemeName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-dark-bgSecondary border border-dark-borderLight rounded px-2 py-1 text-xs text-text-primary w-32 focus:outline-none focus:border-accent-primary"
              autoFocus
              aria-label="Filter keyboard shortcuts"
            />
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5">
          {filteredSections.length === 0 ? (
            <div className="text-center text-text-muted py-8">
              {schemeData ? 'No shortcuts match your filter.' : 'Loading shortcuts…'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filteredSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <h3 className="text-xs font-bold text-accent-primary uppercase tracking-wide mb-2">
                    {section.title}
                  </h3>
                  {section.shortcuts.map((shortcut, i) => (
                    <div key={`${section.title}-${i}`} className="flex items-center justify-between gap-2 py-0.5">
                      <kbd className="text-[10px] font-mono bg-dark-bgSecondary border border-dark-borderLight rounded px-1.5 py-0.5 text-yellow-300 whitespace-nowrap">
                        {shortcut.keys}
                      </kbd>
                      <span className="text-[11px] text-text-secondary text-right">{shortcut.action}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-dark-border text-[10px] text-text-muted text-center">
          Press <kbd className="bg-dark-bgSecondary border border-dark-borderLight rounded px-1 text-yellow-400">Esc</kbd> to close
          {' '} | Scheme: {schemeName} | Ctrl/Cmd shown as Ctrl (use Cmd on macOS)
        </div>
      </div>
    </div>
  );
};
