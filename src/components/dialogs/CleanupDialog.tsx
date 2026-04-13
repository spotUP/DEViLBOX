/**
 * CleanupDialog - Analyzes the current song for cleanup opportunities
 * and lets the user selectively remove unused instruments, patterns, and loop tails.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useDialogKeyboard } from '@hooks/useDialogKeyboard';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { analyzeSongForCleanup, type CleanupReport } from '@/lib/analysis/SongCleanupAnalyzer';

interface CleanupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Format bytes as KB/MB string */
function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export const CleanupDialog: React.FC<CleanupDialogProps> = ({ isOpen, onClose }) => {
  // Pull state directly from stores
  const patterns = useTrackerStore((s) => s.patterns);
  const patternOrder = useTrackerStore((s) => s.patternOrder);
  const instruments = useInstrumentStore((s) => s.instruments);

  // Run analysis when dialog opens — pure function, no side effects
  const report: CleanupReport = useMemo(() => {
    if (!isOpen) {
      return {
        unusedInstruments: [],
        unusedPatterns: [],
        loopTails: [],
        duplicates: [],
        totalReclaimableBytes: 0,
      };
    }
    return analyzeSongForCleanup(patterns, patternOrder, instruments);
  }, [isOpen, patterns, patternOrder, instruments]);

  // Selection state — sets of indices/instrumentIds selected for removal
  const [selectedInstruments, setSelectedInstruments] = useState<Set<number>>(new Set());
  const [selectedPatterns, setSelectedPatterns] = useState<Set<number>>(new Set());
  const [selectedLoopTails, setSelectedLoopTails] = useState<Set<number>>(new Set());
  // Reset selections whenever dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedInstruments(new Set());
      setSelectedPatterns(new Set());
      setSelectedLoopTails(new Set());
    }
  }, [isOpen]);

  // Collapsed state for each section
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Instrument helpers ──────────────────────────────────────────────────────
  const toggleInstrument = (index: number) => {
    setSelectedInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllInstruments = () => {
    setSelectedInstruments(new Set(report.unusedInstruments.map((u) => u.index)));
  };
  const deselectAllInstruments = () => setSelectedInstruments(new Set());

  // ── Pattern helpers ─────────────────────────────────────────────────────────
  const togglePattern = (index: number) => {
    setSelectedPatterns((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllPatterns = () => {
    setSelectedPatterns(new Set(report.unusedPatterns.map((u) => u.index)));
  };
  const deselectAllPatterns = () => setSelectedPatterns(new Set());

  // ── Loop tail helpers ──────────────────────────────────────────────────────
  const toggleLoopTail = (instrumentIndex: number) => {
    setSelectedLoopTails((prev) => {
      const next = new Set(prev);
      if (next.has(instrumentIndex)) next.delete(instrumentIndex);
      else next.add(instrumentIndex);
      return next;
    });
  };
  const selectAllLoopTails = () => {
    setSelectedLoopTails(new Set(report.loopTails.map((t) => t.instrumentIndex)));
  };
  const deselectAllLoopTails = () => setSelectedLoopTails(new Set());

  // ── Remove selected ─────────────────────────────────────────────────────────
  const totalSelected =
    selectedInstruments.size + selectedPatterns.size + selectedLoopTails.size;

  const handleRemoveSelected = () => {
    const instrStore = useInstrumentStore.getState();
    const trackerStore = useTrackerStore.getState();

    // Remove unused instruments (highest id first to avoid index shift issues)
    const sortedInstrIds = [...selectedInstruments].sort((a, b) => b - a);
    for (const id of sortedInstrIds) {
      instrStore.deleteInstrument(id);
    }

    // Remove unused patterns — must sort descending so earlier deletions don't
    // shift the indices of patterns we haven't deleted yet.
    const sortedPatternIdxs = [...selectedPatterns].sort((a, b) => b - a);
    for (const idx of sortedPatternIdxs) {
      trackerStore.deletePattern(idx);
    }

    // Truncate loop tails — slice audioBuffer at loopEnd frame boundary
    if (selectedLoopTails.size > 0) {
      for (const instrumentId of selectedLoopTails) {
        const inst = instrStore.instruments.find((i) => i.id === instrumentId);
        if (!inst?.sample?.audioBuffer || !inst.sample.loopEnd) continue;
        const loopEndBytes = inst.sample.loopEnd * 2; // Int16 = 2 bytes per frame
        if (loopEndBytes > 0 && loopEndBytes < inst.sample.audioBuffer.byteLength) {
          instrStore.updateInstrument(instrumentId, {
            sample: {
              ...inst.sample,
              audioBuffer: inst.sample.audioBuffer.slice(0, loopEndBytes),
            },
          });
        }
      }
    }

    onClose();
  };

  const { shortcuts } = useDialogKeyboard({
    isOpen,
    onConfirm: handleRemoveSelected,
    onCancel: onClose,
    confirmDisabled: totalSelected === 0,
  });

  // ── Section renderer helper ─────────────────────────────────────────────────
  const SectionHeader: React.FC<{
    id: string;
    title: string;
    count: number;
    onSelectAll?: () => void;
    onDeselectAll?: () => void;
    allSelected?: boolean;
    informational?: boolean;
  }> = ({ id, title, count, onSelectAll, onDeselectAll, allSelected, informational }) => (
    <div
      className="flex items-center gap-2 py-2 px-3 bg-dark-bgSecondary rounded-t cursor-pointer select-none hover:bg-dark-bgHover transition-colors"
      onClick={() => toggleSection(id)}
    >
      <span className="text-text-muted text-xs">{collapsedSections.has(id) ? '▶' : '▼'}</span>
      <span className="text-xs font-semibold text-text-primary flex-1">
        {title}
        <span className="ml-2 text-text-muted font-normal">({count})</span>
      </span>
      {!informational && count > 0 && onSelectAll && onDeselectAll && (
        <span
          className="text-xs text-accent-primary hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            allSelected ? onDeselectAll() : onSelectAll();
          }}
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </span>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      theme="modern"
      backdropOpacity="medium"
      closeOnBackdropClick={true}
      closeOnEscape={true}
    >
      <ModalHeader
        title="Song Cleanup"
        icon={<Trash2 size={18} />}
        onClose={onClose}
        theme="modern"
      />

      {/* Body */}
      <div className="p-4 space-y-3 overflow-y-auto scrollbar-modern" style={{ maxHeight: '60vh' }}>
        <p className="text-xs text-text-muted">
          Analysis found the following unused or redundant data. Select items to remove, then click
          &quot;Remove Selected&quot;. This action cannot be undone.
        </p>

        {/* ── Unused Instruments ─────────────────────────────────────────── */}
        <div className="border border-dark-border rounded">
          <SectionHeader
            id="instruments"
            title="Unused Instruments"
            count={report.unusedInstruments.length}
            onSelectAll={selectAllInstruments}
            onDeselectAll={deselectAllInstruments}
            allSelected={
              report.unusedInstruments.length > 0 &&
              selectedInstruments.size === report.unusedInstruments.length
            }
          />
          {!collapsedSections.has('instruments') && (
            <div className="divide-y divide-dark-border">
              {report.unusedInstruments.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted italic">None found</p>
              ) : (
                report.unusedInstruments.map((u) => (
                  <label
                    key={u.index}
                    className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-dark-bgHover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedInstruments.has(u.index)}
                      onChange={() => toggleInstrument(u.index)}
                      className="accent-accent-primary"
                    />
                    <span className="font-mono text-xs text-text-muted w-8 flex-shrink-0">
                      {String(u.index).padStart(2, '0')}
                    </span>
                    <span className="text-xs text-text-primary truncate">{u.name || '(unnamed)'}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Unused Patterns ────────────────────────────────────────────── */}
        <div className="border border-dark-border rounded">
          <SectionHeader
            id="patterns"
            title="Unused Patterns"
            count={report.unusedPatterns.length}
            onSelectAll={selectAllPatterns}
            onDeselectAll={deselectAllPatterns}
            allSelected={
              report.unusedPatterns.length > 0 &&
              selectedPatterns.size === report.unusedPatterns.length
            }
          />
          {!collapsedSections.has('patterns') && (
            <div className="divide-y divide-dark-border">
              {report.unusedPatterns.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted italic">None found</p>
              ) : (
                report.unusedPatterns.map((u) => (
                  <label
                    key={u.index}
                    className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-dark-bgHover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPatterns.has(u.index)}
                      onChange={() => togglePattern(u.index)}
                      className="accent-accent-primary"
                    />
                    <span className="font-mono text-xs text-text-muted w-8 flex-shrink-0">
                      {String(u.index).padStart(2, '0')}
                    </span>
                    <span className="text-xs text-text-primary">
                      {u.rowCount} rows
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Loop Tail Data ─────────────────────────────────────────────── */}
        <div className="border border-dark-border rounded">
          <SectionHeader
            id="looptails"
            title="Loop Tail Data"
            count={report.loopTails.length}
          />
          {!collapsedSections.has('looptails') && (
            <div className="divide-y divide-dark-border">
              {report.loopTails.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted italic">None found</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-1">
                    <button onClick={selectAllLoopTails} className="text-[10px] text-accent-primary hover:underline">Select all</button>
                    <button onClick={deselectAllLoopTails} className="text-[10px] text-text-muted hover:underline">Deselect</button>
                    <span className="text-[10px] text-text-muted ml-auto">
                      {formatBytes(report.loopTails.reduce((s, t) => s + t.tailBytes, 0))} reclaimable
                    </span>
                  </div>
                  {report.loopTails.map((t) => (
                    <div
                      key={t.instrumentIndex}
                      className="flex items-center gap-3 px-3 py-1.5 cursor-pointer hover:bg-dark-bgHover"
                      onClick={() => toggleLoopTail(t.instrumentIndex)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLoopTails.has(t.instrumentIndex)}
                        onChange={() => toggleLoopTail(t.instrumentIndex)}
                        className="rounded border-dark-border bg-dark-surface text-accent-primary focus:ring-accent-primary"
                      />
                      <span className="font-mono text-xs text-text-muted w-8 flex-shrink-0">
                        {String(t.instrumentIndex).padStart(2, '0')}
                      </span>
                      <span className="text-xs text-text-primary truncate flex-1">
                        {t.name || '(unnamed)'}
                      </span>
                      <span className="text-xs text-text-muted flex-shrink-0">
                        {formatBytes(t.tailBytes)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Duplicate Samples (informational) ─────────────────────────── */}
        <div className="border border-dark-border rounded">
          <SectionHeader
            id="duplicates"
            title="Duplicate Samples"
            count={report.duplicates.length}
            onSelectAll={() => {}}
            onDeselectAll={() => {}}
            allSelected={false}
            informational
          />
          {!collapsedSections.has('duplicates') && (
            <div className="divide-y divide-dark-border">
              {report.duplicates.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-muted italic">None found</p>
              ) : (
                report.duplicates.map((g) => (
                  <div key={g.hash} className="px-3 py-1.5">
                    <p className="text-xs text-text-muted mb-0.5">Instruments share identical sample data:</p>
                    <p className="text-xs text-text-primary">
                      {g.instrumentIndices.map((idx, i) => (
                        <span key={idx}>
                          <span className="font-mono">{String(idx).padStart(2, '0')}</span>
                          {g.names[i] ? ` ${g.names[i]}` : ''}
                          {i < g.instrumentIndices.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ── Summary ───────────────────────────────────────────────────── */}
        {report.totalReclaimableBytes > 0 && (
          <div className="bg-dark-bgSecondary rounded p-3 text-xs text-text-secondary">
            Total reclaimable:{' '}
            <span className="text-accent-primary font-semibold">
              {formatBytes(report.totalReclaimableBytes)}
            </span>
          </div>
        )}
      </div>

      <ModalFooter theme="modern" align="right">
        {totalSelected > 0 && (
          <span className="text-xs text-text-muted mr-auto">
            {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
          </span>
        )}
        <Button variant="ghost" onClick={onClose}>
          Cancel{shortcuts.cancel && <span className="text-xs opacity-70 ml-2">{shortcuts.cancel}</span>}
        </Button>
        <Button
          variant="danger"
          onClick={handleRemoveSelected}
          disabled={totalSelected === 0}
        >
          Remove Selected
          {shortcuts.confirm && totalSelected > 0 && (
            <span className="text-xs opacity-70 ml-2">{shortcuts.confirm}</span>
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
