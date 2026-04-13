/**
 * PixiCleanupDialog — GL equivalent of src/components/dialogs/CleanupDialog.tsx
 * Analyzes the current song for cleanup opportunities and lets the user selectively
 * remove unused instruments, patterns, and loop tails.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { PixiCheckbox } from '../components/PixiCheckbox';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore, useInstrumentStore } from '@stores';
import { analyzeSongForCleanup, type CleanupReport } from '@/lib/analysis/SongCleanupAnalyzer';

interface PixiCleanupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Format bytes as KB/MB string */
function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const EMPTY_REPORT: CleanupReport = {
  unusedInstruments: [],
  unusedPatterns: [],
  loopTails: [],
  duplicates: [],
  totalReclaimableBytes: 0,
};

// ─── Section Header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  allSelected?: boolean;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  informational?: boolean;
}

const PixiSectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  count,
  collapsed,
  onToggle,
  allSelected,
  onSelectAll,
  onDeselectAll,
  informational,
}) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerTap={onToggle}
      layout={{ flexDirection: 'row', alignItems: 'center', padding: 8, gap: 4, width: 448 }}
    >
      {/* Collapse caret */}
      <pixiBitmapText
        eventMode="none"
        text={collapsed ? '▶' : '▼'}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ width: 10 }}
      />
      {/* Title + count */}
      <pixiBitmapText
        eventMode="none"
        text={`${title} (${count})`}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{ flex: 1 }}
      />
      {/* Select All / Deselect All */}
      {!informational && count > 0 && (
        <PixiButton
          label={allSelected ? 'Deselect All' : 'Select All'}
          variant="ghost"
          size="sm"
          onClick={allSelected ? onDeselectAll : onSelectAll}
        />
      )}
    </pixiContainer>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const PixiCleanupDialog: React.FC<PixiCleanupDialogProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  const patterns = useTrackerStore((s) => s.patterns);
  const patternOrder = useTrackerStore((s) => s.patternOrder);
  const instruments = useInstrumentStore((s) => s.instruments);

  // Run analysis when dialog opens
  const report: CleanupReport = useMemo(() => {
    if (!isOpen) return EMPTY_REPORT;
    return analyzeSongForCleanup(patterns, patternOrder, instruments);
  }, [isOpen, patterns, patternOrder, instruments]);

  // Selection state
  const [selectedInstruments, setSelectedInstruments] = useState<Set<number>>(new Set());
  const [selectedPatterns, setSelectedPatterns] = useState<Set<number>>(new Set());
  // Reset selections when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedInstruments(new Set());
      setSelectedPatterns(new Set());
    }
  }, [isOpen]);

  // Collapsed state per section
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Instrument helpers ────────────────────────────────────────────────────
  const toggleInstrument = useCallback((index: number) => {
    setSelectedInstruments((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  const selectAllInstruments = useCallback(() => {
    setSelectedInstruments(new Set(report.unusedInstruments.map((u) => u.index)));
  }, [report.unusedInstruments]);

  const deselectAllInstruments = useCallback(() => setSelectedInstruments(new Set()), []);

  // ── Pattern helpers ───────────────────────────────────────────────────────
  const togglePattern = useCallback((index: number) => {
    setSelectedPatterns((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  const selectAllPatterns = useCallback(() => {
    setSelectedPatterns(new Set(report.unusedPatterns.map((u) => u.index)));
  }, [report.unusedPatterns]);

  const deselectAllPatterns = useCallback(() => setSelectedPatterns(new Set()), []);

  // ── Remove selected ───────────────────────────────────────────────────────
  const totalSelected = selectedInstruments.size + selectedPatterns.size;

  const handleRemoveSelected = useCallback(() => {
    const instrStore = useInstrumentStore.getState();
    const trackerStore = useTrackerStore.getState();

    // Remove unused instruments (highest id first to avoid index shift issues)
    const sortedInstrIds = [...selectedInstruments].sort((a, b) => b - a);
    for (const id of sortedInstrIds) {
      instrStore.deleteInstrument(id);
    }

    // Remove unused patterns in descending order
    const sortedPatternIdxs = [...selectedPatterns].sort((a, b) => b - a);
    for (const idx of sortedPatternIdxs) {
      trackerStore.deletePattern(idx);
    }

    // Loop tail truncation not yet implemented — acknowledged but not acted upon.

    onClose();
  }, [selectedInstruments, selectedPatterns, onClose]);

  if (!isOpen) return null;

  const instrAllSelected = report.unusedInstruments.length > 0 &&
    selectedInstruments.size === report.unusedInstruments.length;
  const patsAllSelected = report.unusedPatterns.length > 0 &&
    selectedPatterns.size === report.unusedPatterns.length;
  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={480} height={560}>
      <PixiModalHeader title="Song Cleanup" onClose={onClose} />

      {/* Body */}
      <layoutContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 8, overflow: 'hidden' }}>

        {/* Description */}
        <PixiLabel
          text="Analysis found the following unused or redundant data. Select items to remove, then click Remove Selected. This action cannot be undone."
          size="xs"
          color="textMuted"
          font="sans"
        />

        {/* ── Unused Instruments ───────────────────────────────────────── */}
        <layoutContainer layout={{ flexDirection: 'column', width: 448 }}>
          <PixiSectionHeader
            title="Unused Instruments"
            count={report.unusedInstruments.length}
            collapsed={collapsedSections.has('instruments')}
            onToggle={() => toggleSection('instruments')}
            allSelected={instrAllSelected}
            onSelectAll={selectAllInstruments}
            onDeselectAll={deselectAllInstruments}
          />
          {!collapsedSections.has('instruments') && (
            <layoutContainer layout={{ flexDirection: 'column', paddingLeft: 8, paddingBottom: 4 }}>
              {report.unusedInstruments.length === 0 ? (
                <PixiLabel text="None found" size="xs" color="textMuted" font="sans" />
              ) : (
                report.unusedInstruments.map((u) => (
                  <layoutContainer
                    key={u.index}
                    layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 3, paddingBottom: 3, width: 432 }}
                  >
                    <PixiCheckbox
                      checked={selectedInstruments.has(u.index)}
                      onChange={() => toggleInstrument(u.index)}
                    />
                    <pixiBitmapText
                      text={String(u.index).padStart(2, '0')}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                      tint={theme.textMuted.color}
                      layout={{ width: 24 }}
                    />
                    <pixiBitmapText
                      text={u.name || '(unnamed)'}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                      tint={theme.textSecondary.color}
                      layout={{ flex: 1 }}
                    />
                  </layoutContainer>
                ))
              )}
            </layoutContainer>
          )}
        </layoutContainer>

        {/* ── Unused Patterns ──────────────────────────────────────────── */}
        <layoutContainer layout={{ flexDirection: 'column', width: 448 }}>
          <PixiSectionHeader
            title="Unused Patterns"
            count={report.unusedPatterns.length}
            collapsed={collapsedSections.has('patterns')}
            onToggle={() => toggleSection('patterns')}
            allSelected={patsAllSelected}
            onSelectAll={selectAllPatterns}
            onDeselectAll={deselectAllPatterns}
          />
          {!collapsedSections.has('patterns') && (
            <layoutContainer layout={{ flexDirection: 'column', paddingLeft: 8, paddingBottom: 4 }}>
              {report.unusedPatterns.length === 0 ? (
                <PixiLabel text="None found" size="xs" color="textMuted" font="sans" />
              ) : (
                report.unusedPatterns.map((u) => (
                  <layoutContainer
                    key={u.index}
                    layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 3, paddingBottom: 3, width: 432 }}
                  >
                    <PixiCheckbox
                      checked={selectedPatterns.has(u.index)}
                      onChange={() => togglePattern(u.index)}
                    />
                    <pixiBitmapText
                      text={String(u.index).padStart(2, '0')}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                      tint={theme.textMuted.color}
                      layout={{ width: 24 }}
                    />
                    <pixiBitmapText
                      text={`${u.rowCount} rows`}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                      tint={theme.textSecondary.color}
                      layout={{ flex: 1 }}
                    />
                  </layoutContainer>
                ))
              )}
            </layoutContainer>
          )}
        </layoutContainer>

        {/* ── Loop Tail Data ────────────────────────────────────────────── */}
        <layoutContainer layout={{ flexDirection: 'column', width: 448 }}>
          <PixiSectionHeader
            title="Loop Tail Data"
            count={report.loopTails.length}
            collapsed={collapsedSections.has('looptails')}
            onToggle={() => toggleSection('looptails')}
          />
          {!collapsedSections.has('looptails') && (
            <layoutContainer layout={{ flexDirection: 'column', paddingLeft: 8, paddingBottom: 4 }}>
              {report.loopTails.length === 0 ? (
                <PixiLabel text="None found" size="xs" color="textMuted" font="sans" />
              ) : (
                <>
                  <PixiLabel
                    text="Detected loop tail data (informational only)."
                    size="xs"
                    color="textMuted"
                    font="sans"
                  />
                  {report.loopTails.map((t) => (
                    <layoutContainer
                      key={t.instrumentIndex}
                      layout={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 3, paddingBottom: 3, width: 432 }}
                    >
                      <pixiBitmapText
                        text={String(t.instrumentIndex).padStart(2, '0')}
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        layout={{ width: 24 }}
                      />
                      <pixiBitmapText
                        text={t.name || '(unnamed)'}
                        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                        tint={theme.textSecondary.color}
                        layout={{ flex: 1 }}
                      />
                      <pixiBitmapText
                        text={`${formatBytes(t.tailBytes)} reclaimable`}
                        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        layout={{}}
                      />
                    </layoutContainer>
                  ))}
                </>
              )}
            </layoutContainer>
          )}
        </layoutContainer>

        {/* ── Duplicate Samples (informational) ────────────────────────── */}
        <layoutContainer layout={{ flexDirection: 'column', width: 448 }}>
          <PixiSectionHeader
            title="Duplicate Samples"
            count={report.duplicates.length}
            collapsed={collapsedSections.has('duplicates')}
            onToggle={() => toggleSection('duplicates')}
            allSelected={false}
            onSelectAll={() => {}}
            onDeselectAll={() => {}}
            informational
          />
          {!collapsedSections.has('duplicates') && (
            <layoutContainer layout={{ flexDirection: 'column', paddingLeft: 8, paddingBottom: 4 }}>
              {report.duplicates.length === 0 ? (
                <PixiLabel text="None found" size="xs" color="textMuted" font="sans" />
              ) : (
                report.duplicates.map((g) => (
                  <layoutContainer
                    key={g.hash}
                    layout={{ flexDirection: 'column', gap: 2, paddingTop: 3, paddingBottom: 3, width: 432 }}
                  >
                    <PixiLabel text="Instruments share identical sample data:" size="xs" color="textMuted" font="sans" />
                    <pixiBitmapText
                      text={g.instrumentIndices.map((idx, i) => `${String(idx).padStart(2, '0')}${g.names[i] ? ` ${g.names[i]}` : ''}${i < g.instrumentIndices.length - 1 ? ', ' : ''}`).join('')}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                      tint={theme.textSecondary.color}
                      layout={{}}
                    />
                  </layoutContainer>
                ))
              )}
            </layoutContainer>
          )}
        </layoutContainer>

        {/* ── Summary ──────────────────────────────────────────────────── */}
        {report.totalReclaimableBytes > 0 && (
          <layoutContainer layout={{ padding: 8, width: 448 }}>
            <pixiBitmapText
              text={`Total reclaimable: ${formatBytes(report.totalReclaimableBytes)}`}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={theme.accent.color}
              layout={{}}
            />
          </layoutContainer>
        )}

      </layoutContainer>

      <PixiModalFooter align="right">
        {totalSelected > 0 && (
          <pixiBitmapText
            text={`${totalSelected} item${totalSelected !== 1 ? 's' : ''} selected`}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ flex: 1 }}
          />
        )}
        <PixiButton label="Cancel" variant="ghost" onClick={onClose} />
        <PixiButton
          label="Remove Selected"
          variant="danger"
          disabled={totalSelected === 0}
          onClick={handleRemoveSelected}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
