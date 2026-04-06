/**
 * HelpModal - Interactive Help System
 * Provides keyboard shortcuts, effect commands reference, and tutorials
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Keyboard, Zap, BookOpen, Cpu, Book } from 'lucide-react';
import { EFFECT_COMMANDS, TUTORIAL_STEPS, type HelpTab } from '@/data/helpContent';
import { useHelpDialog } from '@hooks/dialogs/useHelpDialog';
import { useKeyboardStore } from '../../stores/useKeyboardStore';
import { ManualTab } from './ManualTab';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HelpTab;
}

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string;
    description: string;
  }[];
}

/** Build shortcut groups dynamically from the active keyboard scheme JSON */
function buildShortcutGroups(schemeData: Record<string, string> | null): ShortcutGroup[] {
  if (!schemeData || Object.keys(schemeData).length === 0) {
    // Fallback: minimal hardcoded set
    return [{
      title: 'Note Entry',
      shortcuts: [
        { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
        { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
        { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
      ],
    }];
  }

  // Categorize by command name prefix
  const cats: Record<string, { keys: string; description: string }[]> = {};
  const addTo = (cat: string, keys: string, cmd: string) => {
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ keys, description: cmd.replace(/_/g, ' ') });
  };

  for (const [key, cmd] of Object.entries(schemeData)) {
    if (typeof cmd !== 'string') continue;
    if (/^(play_|stop|pause|continue_)/.test(cmd)) addTo('Transport', key, cmd);
    else if (/^(cursor_|jump_to_|goto_|seek_|scroll_|snap_|screen_|song_start|song_end|stay_in)/.test(cmd)) addTo('Navigation', key, cmd);
    else if (/^(insert_|delete_|clear_|roll_|advance_|backspace)/.test(cmd)) addTo('Editing', key, cmd);
    else if (/^(select_|mark_block|block_|unmark|copy_|cut_|paste_|quick_)/.test(cmd)) addTo('Selection & Clipboard', key, cmd);
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

  // Always prepend note entry (not in schemes — handled by keyboard piano input)
  const groups: ShortcutGroup[] = [{
    title: 'Note Entry',
    shortcuts: [
      { keys: 'Z,S,X,D,C...', description: 'Piano keys lower row (C-B)' },
      { keys: 'Q,2,W,3,E...', description: 'Piano keys upper row (+1 octave)' },
      { keys: '0-9, A-F', description: 'Hex digits (instrument, volume, effect)' },
    ],
  }];

  const catOrder = ['Transport', 'Navigation', 'Editing', 'Selection & Clipboard', 'Transpose',
    'Octave', 'Instruments', 'Channels', 'Patterns & Position', 'Step & Volume',
    'View & Settings', 'File & History', 'DJ & Scratch', 'Other'];
  for (const cat of catOrder) {
    if (cats[cat]?.length) {
      groups.push({ title: cat, shortcuts: cats[cat] });
    }
  }
  return groups;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, initialTab = 'shortcuts' }) => {
  const h = useHelpDialog({ isOpen, initialTab });
  const [schemeData, setSchemeData] = useState<Record<string, string> | null>(null);
  const activeScheme = useKeyboardStore((s) => s.activeScheme);

  // Load the active keyboard scheme JSON for the shortcuts tab
  useEffect(() => {
    if (!isOpen) return;
    const isMac = navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac');
    fetch(`/keyboard-schemes/${activeScheme}.json`)
      .then(r => r.json())
      .then(data => {
        const plat = data.platform || data;
        setSchemeData(plat[isMac ? 'mac' : 'pc'] || plat.pc || {});
      })
      .catch(() => setSchemeData(null));
  }, [isOpen, activeScheme]);

  const shortcutGroups = useMemo(() => buildShortcutGroups(schemeData), [schemeData]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-black bg-opacity-60"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-ft2-bg border-2 border-ft2-border shadow-2xl w-full h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-ft2-header border-b-2 border-ft2-border px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-2xl font-bold text-ft2-text">
            HELP & DOCUMENTATION
          </h2>
          <button
            onClick={onClose}
            className="text-ft2-textDim hover:text-ft2-text transition-colors"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-ft2-panel border-b border-ft2-border flex">
          <button
            onClick={() => h.setActiveTab('manual')}
            className={`
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === 'manual'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Book size={16} className="inline mr-2" />
            MANUAL
          </button>
          <button
            onClick={() => h.setActiveTab('shortcuts')}
            className={`
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === 'shortcuts'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Keyboard size={16} className="inline mr-2" />
            KEYBOARD SHORTCUTS
          </button>
          <button
            onClick={() => h.setActiveTab('effects')}
            className={`
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === 'effects'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Zap size={16} className="inline mr-2" />
            STANDARD EFFECTS
          </button>
          <button
            onClick={() => h.setActiveTab('chip-effects')}
            className={`
              flex-1 px-4 py-3 font-mono text-base transition-colors border-r border-ft2-border
              ${h.activeTab === 'chip-effects'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <Cpu size={16} className="inline mr-2" />
            CHIP EFFECTS
          </button>
          <button
            onClick={() => h.setActiveTab('tutorial')}
            className={`
              flex-1 px-4 py-3 font-mono text-base transition-colors
              ${h.activeTab === 'tutorial'
                ? 'bg-ft2-cursor text-ft2-bg font-bold'
                : 'text-ft2-text hover:bg-ft2-bg'
              }
            `}
          >
            <BookOpen size={16} className="inline mr-2" />
            TUTORIAL
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-ft2 p-8">
          {/* Manual Tab */}
          {h.activeTab === 'manual' && (
            <ManualTab
              chapters={h.filteredChapters}
              parts={h.manualParts}
              currentIndex={h.manualChapterIndex}
              onSelectChapter={h.setManualChapterIndex}
              searchQuery={h.manualSearchQuery}
              onSearchChange={h.setManualSearchQuery}
              activeSchemeData={schemeData}
              activeSchemeName={activeScheme}
            />
          )}

          {/* Keyboard Shortcuts Tab */}
          {h.activeTab === 'shortcuts' && (
            <div className="space-y-6">
              <div className="text-sm font-mono text-ft2-textDim mb-2">
                Active scheme: <span className="text-ft2-highlight">{activeScheme}</span>
              </div>
              {shortcutGroups.map((group, idx) => (
                <div key={idx} className="bg-ft2-panel border border-ft2-border p-4">
                  <h3 className="text-base font-mono font-bold text-ft2-highlight mb-3">
                    {group.title.toUpperCase()}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut, sidx) => (
                      <div
                        key={sidx}
                        className="flex items-start gap-4 text-sm font-mono"
                      >
                        <div className="flex-shrink-0 w-32 px-2 py-1 bg-ft2-bg border border-ft2-border text-ft2-highlight font-bold text-center">
                          {shortcut.keys}
                        </div>
                        <div className="flex-1 text-ft2-text py-1">
                          {shortcut.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Effect Commands Tab */}
          {h.activeTab === 'effects' && (
            <div className="space-y-4">
              <div className="bg-ft2-panel border border-ft2-border p-4 mb-4">
                <p className="text-base font-mono text-ft2-text leading-relaxed">
                  Effect commands follow the FastTracker 2 format: 3 hex characters (0xy-Fxx).
                  Enter effects in the EFFECT column. Multiple effects can be chained across rows.
                </p>
              </div>

              <div className="grid gap-3">
                {EFFECT_COMMANDS.map((effect, idx) => (
                  <div
                    key={idx}
                    className="bg-ft2-panel border border-ft2-border p-3 hover:border-ft2-highlight transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-shrink-0 w-12 px-2 py-1 bg-ft2-bg border border-ft2-cursor text-ft2-highlight font-bold text-sm font-mono text-center">
                        {effect.code}
                      </div>
                      <div className="flex-1">
                        <div className="font-mono text-base font-bold text-ft2-text mb-1">
                          {effect.name}
                        </div>
                        <div className="text-sm font-mono text-ft2-textDim mb-1">
                          {effect.description}
                        </div>
                        <div className="text-sm font-mono text-ft2-text">
                          <span className="text-ft2-highlight">Range:</span> {effect.paramRange}
                        </div>
                        {effect.example && (
                          <div className="text-sm font-mono text-ft2-text mt-1">
                            <span className="text-ft2-highlight">Example:</span> {effect.example}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chip Effects Tab */}
          {h.activeTab === 'chip-effects' && (
            <div className="space-y-4">
              <div className="bg-ft2-panel border border-ft2-border p-4 mb-4">
                <h3 className="text-base font-mono font-bold text-ft2-highlight mb-2">
                  {h.currentChip !== null ? `CHIP EFFECTS: ${h.chipName}` : 'CHIP EFFECTS'}
                </h3>
                <p className="text-base font-mono text-ft2-text leading-relaxed">
                  {h.currentChip !== null
                    ? `These effects are specific to the ${h.chipName} sound chip used by the current instrument. They use effect codes 10xx and above.`
                    : 'Select a chip-based instrument (Furnace) in the tracker to see its specific effect commands here.'
                  }
                </p>
              </div>

              {h.chipEffects.length > 0 ? (
                <div className="grid gap-3">
                  {h.chipEffects.map((effect, idx) => (
                    <div
                      key={idx}
                      className="bg-ft2-panel border border-ft2-border p-3 hover:border-ft2-highlight transition-colors"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className="flex-shrink-0 w-12 px-2 py-1 bg-ft2-bg border border-ft2-cursor text-ft2-highlight font-bold text-sm font-mono text-center">
                          {effect.command}
                        </div>
                        <div className="flex-1">
                          <div className="font-mono text-base font-bold text-ft2-text mb-1">
                            {effect.name}
                          </div>
                          <div className="text-sm font-mono text-ft2-textDim">
                            {effect.desc}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : h.currentChip !== null ? (
                <div className="text-center py-8 text-ft2-textDim font-mono text-sm">
                  No specific chip effects defined for {h.chipName} yet.
                </div>
              ) : (
                <div className="text-center py-8 text-ft2-textDim font-mono text-sm">
                  No chip-based instrument selected.
                </div>
              )}
            </div>
          )}

          {/* Tutorial Tab */}
          {h.activeTab === 'tutorial' && (
            <div className="space-y-4">
              <div className="bg-ft2-panel border-2 border-ft2-cursor p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-mono font-bold text-ft2-highlight">
                    STEP {TUTORIAL_STEPS[h.tutorialStep].step} OF {TUTORIAL_STEPS.length}
                  </h3>
                  <div className="text-sm font-mono text-ft2-textDim">
                    {h.tutorialProgress}% Complete
                  </div>
                </div>

                <h4 className="text-2xl font-mono font-bold text-ft2-text mb-4">
                  {TUTORIAL_STEPS[h.tutorialStep].title}
                </h4>

                <div className="space-y-3">
                  {TUTORIAL_STEPS[h.tutorialStep].content.map((paragraph, idx) => (
                    <p key={idx} className="text-base font-mono text-ft2-text leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Tutorial Navigation */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={h.prevTutorialStep}
                  disabled={h.tutorialStep === 0}
                  className={`
                    px-4 py-2 font-mono text-sm border transition-colors
                    ${h.tutorialStep === 0
                      ? 'bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed'
                      : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
                    }
                  `}
                >
                  ← PREVIOUS
                </button>

                <div className="flex gap-1">
                  {TUTORIAL_STEPS.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => h.setTutorialStep(idx)}
                      className={`
                        w-8 h-8 text-sm font-mono border transition-colors
                        ${idx === h.tutorialStep
                          ? 'bg-ft2-cursor text-ft2-bg border-ft2-cursor font-bold'
                          : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
                        }
                      `}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>

                <button
                  onClick={h.nextTutorialStep}
                  disabled={h.tutorialStep === TUTORIAL_STEPS.length - 1}
                  className={`
                    px-4 py-2 font-mono text-sm border transition-colors
                    ${h.tutorialStep === TUTORIAL_STEPS.length - 1
                      ? 'bg-ft2-panel text-ft2-textDim border-ft2-border cursor-not-allowed'
                      : 'bg-ft2-bg text-ft2-text border-ft2-border hover:border-ft2-highlight'
                    }
                  `}
                >
                  NEXT →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-ft2-panel border-t-2 border-ft2-border px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-mono text-ft2-textDim">
            Press <span className="text-ft2-highlight">?</span> anytime to open this help
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-ft2-cursor text-ft2-bg font-mono text-sm font-bold hover:bg-ft2-highlight transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
