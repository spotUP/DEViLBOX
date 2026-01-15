/**
 * FindReplaceDialog - Dialog for finding and replacing notes/instruments/effects
 */

import React, { useState } from 'react';
import { X, Search, Replace } from 'lucide-react';
import { useTrackerStore } from '@stores';

interface FindReplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchType = 'note' | 'instrument' | 'effect';
type SearchScope = 'selection' | 'pattern' | 'all';

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({ isOpen, onClose }) => {
  const { patterns, currentPatternIndex, selection } = useTrackerStore();
  const [searchType, setSearchType] = useState<SearchType>('note');
  const [scope, setScope] = useState<SearchScope>('pattern');
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [replaceCount, setReplaceCount] = useState<number | null>(null);

  const pattern = patterns[currentPatternIndex];

  const handleFind = () => {
    let count = 0;
    const patternsToSearch = scope === 'all' ? patterns : [pattern];

    for (const p of patternsToSearch) {
      for (const channel of p.channels) {
        for (let row = 0; row < p.length; row++) {
          // Skip if scope is selection and this row/channel is outside selection
          if (scope === 'selection' && selection) {
            const minCh = Math.min(selection.startChannel, selection.endChannel);
            const maxCh = Math.max(selection.startChannel, selection.endChannel);
            const minRow = Math.min(selection.startRow, selection.endRow);
            const maxRow = Math.max(selection.startRow, selection.endRow);
            const chIdx = p.channels.indexOf(channel);
            if (chIdx < minCh || chIdx > maxCh || row < minRow || row > maxRow) continue;
          }

          const cell = channel.rows[row];
          if (searchType === 'note' && cell.note?.toLowerCase().includes(findValue.toLowerCase())) {
            count++;
          } else if (searchType === 'instrument' && cell.instrument !== null) {
            const instHex = cell.instrument.toString(16).toUpperCase().padStart(2, '0');
            if (instHex.includes(findValue.toUpperCase())) count++;
          } else if (searchType === 'effect' && cell.effect?.toLowerCase().includes(findValue.toLowerCase())) {
            count++;
          }
        }
      }
    }

    setMatchCount(count);
    setReplaceCount(null);
  };

  const handleReplace = () => {
    if (!findValue) return;

    let count = 0;

    useTrackerStore.setState((state) => {
      const patternsToModify = scope === 'all' ? state.patterns : [state.patterns[currentPatternIndex]];

      for (const p of patternsToModify) {
        for (let chIdx = 0; chIdx < p.channels.length; chIdx++) {
          const channel = p.channels[chIdx];
          for (let row = 0; row < p.length; row++) {
            // Skip if scope is selection and this row/channel is outside selection
            if (scope === 'selection' && selection) {
              const minCh = Math.min(selection.startChannel, selection.endChannel);
              const maxCh = Math.max(selection.startChannel, selection.endChannel);
              const minRow = Math.min(selection.startRow, selection.endRow);
              const maxRow = Math.max(selection.startRow, selection.endRow);
              if (chIdx < minCh || chIdx > maxCh || row < minRow || row > maxRow) continue;
            }

            const cell = channel.rows[row];

            if (searchType === 'note' && cell.note?.toLowerCase().includes(findValue.toLowerCase())) {
              if (replaceValue === '') {
                cell.note = null;
              } else {
                cell.note = replaceValue.toUpperCase();
              }
              count++;
            } else if (searchType === 'instrument' && cell.instrument !== null) {
              const instHex = cell.instrument.toString(16).toUpperCase().padStart(2, '0');
              if (instHex.includes(findValue.toUpperCase())) {
                if (replaceValue === '') {
                  cell.instrument = null;
                } else {
                  cell.instrument = parseInt(replaceValue, 16) || 0;
                }
                count++;
              }
            } else if (searchType === 'effect' && cell.effect?.toLowerCase().includes(findValue.toLowerCase())) {
              if (replaceValue === '') {
                cell.effect = null;
              } else {
                cell.effect = replaceValue.toUpperCase();
              }
              count++;
            }
          }
        }
      }
    });

    setReplaceCount(count);
    setMatchCount(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-96">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-sm font-semibold text-text-primary">Find & Replace</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Search type */}
          <div className="flex gap-2">
            {(['note', 'instrument', 'effect'] as SearchType[]).map(type => (
              <button
                key={type}
                onClick={() => setSearchType(type)}
                className={`flex-1 px-3 py-2 text-xs rounded transition-colors ${
                  searchType === type
                    ? 'bg-accent-primary text-white'
                    : 'bg-dark-bg text-text-secondary hover:text-text-primary'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as SearchScope)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="selection" disabled={!selection}>Selection {!selection && '(none)'}</option>
              <option value="pattern">Current Pattern</option>
              <option value="all">All Patterns</option>
            </select>
          </div>

          {/* Find value */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Find</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={findValue}
                onChange={(e) => setFindValue(e.target.value)}
                placeholder={searchType === 'note' ? 'e.g., C-4' : searchType === 'instrument' ? 'e.g., 01' : 'e.g., A0F'}
                className="w-full pl-9 pr-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          {/* Replace value */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Replace with (empty to clear)</label>
            <div className="relative">
              <Replace size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                placeholder="Leave empty to clear"
                className="w-full pl-9 pr-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          {/* Results */}
          {matchCount !== null && (
            <p className="text-xs text-accent-primary">Found {matchCount} match{matchCount !== 1 ? 'es' : ''}</p>
          )}
          {replaceCount !== null && (
            <p className="text-xs text-accent-success">Replaced {replaceCount} occurrence{replaceCount !== 1 ? 's' : ''}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-dark-bgHover rounded transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleFind}
            disabled={!findValue}
            className="px-4 py-2 text-sm bg-dark-bgTertiary text-text-primary rounded hover:bg-dark-bgHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Find
          </button>
          <button
            onClick={handleReplace}
            disabled={!findValue}
            className="px-4 py-2 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
};
