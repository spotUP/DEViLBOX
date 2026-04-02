/**
 * KeyBindingEditor - Inline editor for custom keyboard bindings.
 * Shown in the Settings modal INPUT tab when scheme is 'custom'.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboardStore, type CustomBindings } from '@stores/useKeyboardStore';
import { SchemeLoader } from '@engine/keyboard/SchemeLoader';
import { KeyboardNormalizer } from '@engine/keyboard/KeyboardNormalizer';
import { KEYBOARD_SCHEMES } from '@hooks/dialogs/useSettingsDialog';

/** Human-readable labels for command names */
function formatCommandName(cmd: string): string {
  return cmd.replace(/_/g, ' ');
}

/** Format a KeyboardEvent into the combo string used by scheme JSON */
function formatKeyEvent(e: KeyboardEvent): string | null {
  // Ignore bare modifier keys
  if (['Control', 'Alt', 'Shift', 'Meta', 'CapsLock'].includes(e.key)) return null;

  const isMac = KeyboardNormalizer.isMac();
  const parts: string[] = [];

  if (isMac && e.metaKey) {
    parts.push('Cmd');
  } else if (e.ctrlKey) {
    parts.push('Ctrl');
  }
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Determine key name
  let keyName: string;
  if (e.key.length === 1) {
    keyName = e.key.toUpperCase();
  } else if (e.key === ' ') {
    keyName = 'Space';
  } else {
    keyName = e.key; // "F1", "Tab", "Escape", "ArrowUp" -> need to normalize
  }

  // Normalize arrow keys to match scheme format
  const arrowMap: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  };
  if (arrowMap[keyName]) keyName = arrowMap[keyName];

  parts.push(keyName);
  return parts.join('+');
}

// Schemes available as copy sources (everything except 'custom')
const COPY_SOURCES = KEYBOARD_SCHEMES.filter((s) => s.id !== 'custom');

interface KeyBindingEditorProps {
  platform: 'pc' | 'mac';
}

export const KeyBindingEditor: React.FC<KeyBindingEditorProps> = ({ platform }) => {
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const baseScheme = useKeyboardStore((s) => s.baseScheme);
  const setCustomBinding = useKeyboardStore((s) => s.setCustomBinding);
  const removeCustomBinding = useKeyboardStore((s) => s.removeCustomBinding);
  const initCustomFromScheme = useKeyboardStore((s) => s.initCustomFromScheme);

  const [filter, setFilter] = useState('');
  const [rebindingCommand, setRebindingCommand] = useState<string | null>(null);
  const [copyFromScheme, setCopyFromScheme] = useState(baseScheme);
  const [isCopying, setIsCopying] = useState(false);

  const rebindRef = useRef<HTMLDivElement>(null);

  // Get the current platform bindings as sorted entries
  const bindings = customBindings?.[platform] ?? {};
  const entries = Object.entries(bindings).sort((a, b) => a[1].localeCompare(b[1]));

  // Filter entries
  const filtered = filter
    ? entries.filter(
        ([combo, cmd]) =>
          cmd.toLowerCase().includes(filter.toLowerCase()) ||
          combo.toLowerCase().includes(filter.toLowerCase())
      )
    : entries;

  // Capture keydown for rebinding
  useEffect(() => {
    if (!rebindingCommand) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const combo = formatKeyEvent(e);
      if (!combo) return; // bare modifier, wait for real key

      // Check for conflict
      const existingCmd = bindings[combo];
      if (existingCmd && existingCmd !== rebindingCommand) {
        // Remove old binding for this combo
        removeCustomBinding(combo, platform);
      }

      // Remove old combo(s) for this command
      for (const [oldCombo, cmd] of Object.entries(bindings)) {
        if (cmd === rebindingCommand) {
          removeCustomBinding(oldCombo, platform);
        }
      }

      // Set new binding
      setCustomBinding(combo, rebindingCommand, platform);
      setRebindingCommand(null);
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [rebindingCommand, bindings, platform, setCustomBinding, removeCustomBinding]);

  // Cancel rebind on escape or click outside
  useEffect(() => {
    if (!rebindingCommand) return;
    const handleClick = () => setRebindingCommand(null);
    // Delay to avoid the triggering click
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick, { once: true });
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleClick);
    };
  }, [rebindingCommand]);

  // Copy from another scheme
  const handleCopyFrom = useCallback(async () => {
    setIsCopying(true);
    try {
      const loader = new SchemeLoader();
      const scheme = await loader.loadScheme(copyFromScheme);
      const newBindings: CustomBindings = {
        pc: { ...scheme.platform.pc },
        mac: { ...scheme.platform.mac },
      };
      initCustomFromScheme(newBindings, copyFromScheme);
    } catch (err) {
      console.error('[KeyBindingEditor] Failed to copy scheme:', err);
    }
    setIsCopying(false);
  }, [copyFromScheme, initCustomFromScheme]);

  if (!customBindings) {
    return (
      <div className="text-ft2-textDim text-[10px] font-mono py-2">
        Custom bindings not initialized. Switch to the Custom scheme to begin.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Copy from + Reset */}
      <div className="flex items-center gap-2">
        <label className="text-ft2-text text-[10px] font-mono shrink-0">Copy from:</label>
        <select
          value={copyFromScheme}
          onChange={(e) => setCopyFromScheme(e.target.value)}
          className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 flex-1 focus:outline-none focus:border-ft2-highlight"
        >
          {COPY_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleCopyFrom}
          disabled={isCopying}
          className="px-2 py-1 bg-ft2-border text-ft2-text text-[10px] font-mono hover:text-ft2-highlight hover:bg-ft2-header transition-colors disabled:opacity-50"
        >
          {isCopying ? 'Copying...' : 'Apply'}
        </button>
      </div>

      {/* Search filter */}
      <div className="flex items-center gap-2">
        <label className="text-ft2-text text-[10px] font-mono shrink-0">Filter:</label>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search commands or keys..."
          className="bg-ft2-bg border border-ft2-border text-ft2-text text-[10px] font-mono px-2 py-1 flex-1 focus:outline-none focus:border-ft2-highlight placeholder:text-ft2-textDim"
        />
        <span className="text-ft2-textDim text-[9px] font-mono shrink-0">
          {filtered.length}/{entries.length}
        </span>
      </div>

      {/* Binding list */}
      <div className="border border-ft2-border max-h-[280px] overflow-y-auto scrollbar-ft2" ref={rebindRef}>
        <table className="w-full text-[10px] font-mono">
          <thead className="sticky top-0 bg-ft2-header">
            <tr className="text-ft2-highlight">
              <th className="text-left px-2 py-1 border-b border-ft2-border w-1/2">Command</th>
              <th className="text-left px-2 py-1 border-b border-ft2-border w-1/3">Key</th>
              <th className="text-right px-2 py-1 border-b border-ft2-border w-[60px]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(([combo, cmd]) => (
              <tr
                key={combo}
                className={`border-b border-ft2-border/30 hover:bg-ft2-header/30 ${
                  rebindingCommand === cmd ? 'bg-ft2-cursor/20' : ''
                }`}
              >
                <td className="px-2 py-1 text-ft2-text">{formatCommandName(cmd)}</td>
                <td className="px-2 py-1">
                  {rebindingCommand === cmd ? (
                    <span className="text-ft2-cursor animate-pulse">Press a key...</span>
                  ) : (
                    <span className="text-ft2-highlight">{combo}</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    onClick={() => setRebindingCommand(rebindingCommand === cmd ? null : cmd)}
                    className="px-1.5 py-0.5 bg-ft2-border text-ft2-text hover:text-ft2-highlight hover:bg-ft2-header transition-colors text-[9px]"
                  >
                    {rebindingCommand === cmd ? 'Cancel' : 'Rebind'}
                  </button>
                  <button
                    onClick={() => removeCustomBinding(combo, platform)}
                    className="ml-1 px-1.5 py-0.5 bg-ft2-border text-ft2-text hover:text-red-400 hover:bg-ft2-header transition-colors text-[9px]"
                    title="Remove binding"
                  >
                    X
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-4 text-center text-ft2-textDim">
                  {filter ? 'No matching bindings' : 'No bindings configured'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-ft2-textDim text-[9px] font-mono">
        Based on: {COPY_SOURCES.find((s) => s.id === baseScheme)?.name ?? baseScheme}
        {' | '}Showing {platform.toUpperCase()} bindings
        {' | '}Click Rebind then press a key combo to reassign
      </div>
    </div>
  );
};
