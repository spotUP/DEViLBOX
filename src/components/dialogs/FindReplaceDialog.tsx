/**
 * FindReplaceDialog - Dialog for finding and replacing notes/instruments/effects
 */

import React, { useState } from 'react';
import { Search, Replace } from 'lucide-react';
import { useTrackerStore } from '@stores';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      theme="modern"
      backdropOpacity="medium"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      <ModalHeader
        title="Find & Replace"
        icon={<Search size={18} />}
        onClose={onClose}
        theme="modern"
      />

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

      <ModalFooter theme="modern" align="right">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="default"
          onClick={handleFind}
          disabled={!findValue}
        >
          Find
        </Button>
        <Button
          variant="primary"
          onClick={handleReplace}
          disabled={!findValue}
        >
          Replace All
        </Button>
      </ModalFooter>
    </Modal>
  );
};
