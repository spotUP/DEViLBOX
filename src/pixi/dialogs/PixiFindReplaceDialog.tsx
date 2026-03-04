/**
 * PixiFindReplaceDialog — GL-native find & replace for tracker patterns.
 * Searches/replaces notes, instruments, and effects across patterns.
 */

import { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { useTrackerStore, useCursorStore } from '@stores';
import { xmNoteToString, xmEffectToString, stringNoteToXM, effectStringToXM } from '@/lib/xmConversions';

interface PixiFindReplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchType = 'note' | 'instrument' | 'effect';
type SearchScope = 'selection' | 'pattern' | 'all';

const PLACEHOLDERS: Record<SearchType, string> = {
  note: 'e.g. C-4',
  instrument: 'e.g. 01',
  effect: 'e.g. A0F',
};

export const PixiFindReplaceDialog: React.FC<PixiFindReplaceDialogProps> = ({ isOpen, onClose }) => {
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const selection = useCursorStore((s) => s.selection);
  const theme = usePixiTheme();

  const [searchType, setSearchType] = useState<SearchType>('note');
  const [scope, setScope] = useState<SearchScope>('pattern');
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [replaceCount, setReplaceCount] = useState<number | null>(null);

  const pattern = patterns[currentPatternIndex];

  const handleFind = useCallback(() => {
    let count = 0;
    const patternsToSearch = scope === 'all' ? patterns : [pattern];

    for (const p of patternsToSearch) {
      for (const channel of p.channels) {
        for (let row = 0; row < p.length; row++) {
          if (scope === 'selection' && selection) {
            const minCh = Math.min(selection.startChannel, selection.endChannel);
            const maxCh = Math.max(selection.startChannel, selection.endChannel);
            const minRow = Math.min(selection.startRow, selection.endRow);
            const maxRow = Math.max(selection.startRow, selection.endRow);
            const chIdx = p.channels.indexOf(channel);
            if (chIdx < minCh || chIdx > maxCh || row < minRow || row > maxRow) continue;
          }

          const cell = channel.rows[row];
          if (searchType === 'note' && cell.note && cell.note !== 0 && cell.note !== 97) {
            const noteStr = xmNoteToString(cell.note);
            if (noteStr.toLowerCase().includes(findValue.toLowerCase())) count++;
          } else if (searchType === 'instrument' && cell.instrument !== 0) {
            const instHex = cell.instrument.toString(16).toUpperCase().padStart(2, '0');
            if (instHex.includes(findValue.toUpperCase())) count++;
          } else if (searchType === 'effect' && (cell.effTyp !== 0 || cell.eff !== 0)) {
            const effectStr = xmEffectToString(cell.effTyp, cell.eff);
            if (effectStr.toLowerCase().includes(findValue.toLowerCase())) count++;
          }
        }
      }
    }

    setMatchCount(count);
    setReplaceCount(null);
  }, [patterns, pattern, scope, selection, searchType, findValue]);

  const handleReplace = useCallback(() => {
    if (!findValue) return;

    let count = 0;

    useTrackerStore.setState((state) => {
      const patternsToModify = scope === 'all' ? state.patterns : [state.patterns[currentPatternIndex]];

      for (const p of patternsToModify) {
        for (let chIdx = 0; chIdx < p.channels.length; chIdx++) {
          const channel = p.channels[chIdx];
          for (let row = 0; row < p.length; row++) {
            if (scope === 'selection' && selection) {
              const minCh = Math.min(selection.startChannel, selection.endChannel);
              const maxCh = Math.max(selection.startChannel, selection.endChannel);
              const minRow = Math.min(selection.startRow, selection.endRow);
              const maxRow = Math.max(selection.startRow, selection.endRow);
              if (chIdx < minCh || chIdx > maxCh || row < minRow || row > maxRow) continue;
            }

            const cell = channel.rows[row];

            if (searchType === 'note' && cell.note && cell.note !== 0 && cell.note !== 97) {
              const noteStr = xmNoteToString(cell.note);
              if (noteStr.toLowerCase().includes(findValue.toLowerCase())) {
                if (replaceValue === '') {
                  cell.note = 0;
                } else {
                  cell.note = stringNoteToXM(replaceValue.toUpperCase());
                }
                count++;
              }
            } else if (searchType === 'instrument' && cell.instrument !== 0) {
              const instHex = cell.instrument.toString(16).toUpperCase().padStart(2, '0');
              if (instHex.includes(findValue.toUpperCase())) {
                if (replaceValue === '') {
                  cell.instrument = 0;
                } else {
                  cell.instrument = parseInt(replaceValue, 16) || 0;
                }
                count++;
              }
            } else if (searchType === 'effect' && (cell.effTyp !== 0 || cell.eff !== 0)) {
              const effectStr = xmEffectToString(cell.effTyp, cell.eff);
              if (effectStr.toLowerCase().includes(findValue.toLowerCase())) {
                if (replaceValue === '') {
                  cell.effTyp = 0;
                  cell.eff = 0;
                } else {
                  const [newEffTyp, newEff] = effectStringToXM(replaceValue.toUpperCase());
                  cell.effTyp = newEffTyp;
                  cell.eff = newEff;
                }
                count++;
              }
            }
          }
        }
      }
    });

    setReplaceCount(count);
    setMatchCount(null);
  }, [findValue, replaceValue, scope, currentPatternIndex, selection, searchType]);

  if (!isOpen) return null;

  const inputWidth = 348;

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={380} height={400}>
      <PixiModalHeader title="Find & Replace" onClose={onClose} />

      <layoutContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 10 }}>
        {/* Search type toggles */}
        <PixiLabel text="Search type" size="xs" color="textMuted" />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiButton label="Note" variant={searchType === 'note' ? 'primary' : 'default'} onClick={() => setSearchType('note')} />
          <PixiButton label="Instrument" variant={searchType === 'instrument' ? 'primary' : 'default'} onClick={() => setSearchType('instrument')} />
          <PixiButton label="Effect" variant={searchType === 'effect' ? 'primary' : 'default'} onClick={() => setSearchType('effect')} />
        </layoutContainer>

        {/* Scope toggles */}
        <PixiLabel text="Scope" size="xs" color="textMuted" layout={{ marginTop: 4 }} />
        <layoutContainer layout={{ flexDirection: 'row', gap: 4 }}>
          <PixiButton label={selection ? 'Selection' : 'Selection (none)'} variant={scope === 'selection' ? 'primary' : 'default'} disabled={!selection} onClick={() => setScope('selection')} />
          <PixiButton label="Pattern" variant={scope === 'pattern' ? 'primary' : 'default'} onClick={() => setScope('pattern')} />
          <PixiButton label="All Patterns" variant={scope === 'all' ? 'primary' : 'default'} onClick={() => setScope('all')} />
        </layoutContainer>

        {/* Find input */}
        <PixiLabel text="Find" size="xs" color="textMuted" layout={{ marginTop: 4 }} />
        <PixiPureTextInput
          value={findValue}
          onChange={setFindValue}
          onSubmit={handleFind}
          placeholder={PLACEHOLDERS[searchType]}
          width={inputWidth}
          height={26}
          font="mono"
        />

        {/* Replace input */}
        <PixiLabel text="Replace with" size="xs" color="textMuted" layout={{ marginTop: 4 }} />
        <PixiPureTextInput
          value={replaceValue}
          onChange={setReplaceValue}
          onSubmit={handleReplace}
          placeholder="Leave empty to clear"
          width={inputWidth}
          height={26}
          font="mono"
        />

        {/* Results */}
        {matchCount !== null && (
          <PixiLabel
            text={`Found ${matchCount} match${matchCount !== 1 ? 'es' : ''}`}
            size="xs"
            color="custom"
            customColor={theme.accent.color}
            layout={{ marginTop: 2 }}
          />
        )}
        {replaceCount !== null && (
          <PixiLabel
            text={`Replaced ${replaceCount} occurrence${replaceCount !== 1 ? 's' : ''}`}
            size="xs"
            color="custom"
            customColor={theme.success.color}
            layout={{ marginTop: 2 }}
          />
        )}
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Close" variant="ghost" onClick={onClose} />
        <PixiButton label="Find" variant="default" onClick={handleFind} disabled={!findValue} />
        <PixiButton label="Replace All" variant="primary" onClick={handleReplace} disabled={!findValue} />
      </PixiModalFooter>
    </PixiModal>
  );
};
