/**
 * PixiPatternManagement — Pure Pixi pattern browser & sequencer.
 * Ports PatternManagement.tsx to PixiJS, preserving all functionality:
 * pattern list with drag-to-reorder, add/clone/delete, rename via prompt,
 * resize select, and a playback sequence footer.
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useTrackerStore } from '@stores';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import { PixiScrollView } from '../../components/PixiScrollView';
import { PixiButton } from '../../components/PixiButton';
import { PixiSelect } from '../../components/PixiSelect';
import type { SelectOption } from '../../components/PixiSelect';

// ─── Layout constants ──────────────────────────────────────────────────────

const HEADER_H      = 32;
const CONTROLS_H    = 64;
const CURRENT_INFO_H = 40;
const ROW_H         = 28;
const FOOTER_H      = 80;

const SIZE_OPTIONS: SelectOption[] = [
  { value: '16',  label: '16 rows'  },
  { value: '32',  label: '32 rows'  },
  { value: '64',  label: '64 rows'  },
  { value: '128', label: '128 rows' },
];

const RESIZE_OPTIONS: SelectOption[] = [
  { value: '16',  label: '16'  },
  { value: '32',  label: '32'  },
  { value: '64',  label: '64'  },
  { value: '128', label: '128' },
];

// ─── PatternRow ────────────────────────────────────────────────────────────

interface PatternRowProps {
  pattern: { id: string; name: string; length: number };
  index: number;
  isActive: boolean;
  isQueued: boolean;
  isPendingDelete: boolean;
  isDragging: boolean;
  dragTargetIndex: number | null;
  totalPatterns: number;
  width: number;
  onSelect: () => void;
  onRename: () => void;
  onClone: () => void;
  onDelete: () => void;
  onDragStart: (index: number) => void;
}

const PatternRow: React.FC<PatternRowProps> = ({
  pattern,
  index,
  isActive,
  isQueued,
  isPendingDelete,
  isDragging,
  dragTargetIndex,
  width,
  onSelect,
  onRename,
  onClone,
  onDelete,
  onDragStart,
}) => {
  const theme = usePixiTheme();
  const [hoveredBtn, setHoveredBtn] = useState<'rename' | 'clone' | 'delete' | null>(null);

  // Determine background color
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();

    // Row background
    if (isPendingDelete) {
      g.rect(0, 0, width, ROW_H);
      g.fill({ color: theme.error.color, alpha: 0.2 });
    } else if (isActive) {
      g.rect(0, 0, width, ROW_H);
      g.fill({ color: theme.accent.color, alpha: 0.2 });
    } else {
      g.rect(0, 0, width, ROW_H);
      g.fill({ color: theme.bg.color, alpha: 0.0 });
    }

    // Bottom separator
    g.rect(0, ROW_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.3 });

    // Queued indicator — left accent border
    if (isQueued) {
      g.rect(0, 0, 3, ROW_H);
      g.fill({ color: 0xff8800, alpha: 0.9 });
    } else if (isActive) {
      g.rect(0, 0, 3, ROW_H);
      g.fill({ color: theme.accent.color, alpha: 1 });
    }

    // Dragging — reduce opacity handled at container level
    // Show drag-target insertion line above this row
    if (dragTargetIndex === index && !isDragging) {
      g.rect(0, 0, width, 2);
      g.fill({ color: theme.accent.color, alpha: 0.8 });
    }
  }, [width, isActive, isQueued, isPendingDelete, dragTargetIndex, index, isDragging, theme]);

  // Drag handle area draw (≡ icon approximation)
  const drawHandle = useCallback((g: GraphicsType) => {
    g.clear();
    const hColor = theme.textMuted.color;
    const alpha = 0.5;
    // Three horizontal lines
    for (let i = 0; i < 3; i++) {
      g.rect(2, 6 + i * 5, 8, 2);
      g.fill({ color: hColor, alpha });
    }
  }, [theme]);

  // Small action button draw
  const makeActionBg = useCallback((btnName: 'rename' | 'clone' | 'delete') => {
    return (g: GraphicsType) => {
      g.clear();
      if (hoveredBtn !== btnName) return;
      const color = btnName === 'delete' ? theme.error.color : theme.accent.color;
      g.roundRect(0, 0, 24, 18, 3);
      g.fill({ color, alpha: 0.25 });
    };
  }, [hoveredBtn, theme]);

  const BTN_W = 24;
  const BTN_H = 18;
  const HANDLE_W = 16;
  const IDX_W = 22;
  // right area: 3 action buttons
  const ACTIONS_W = BTN_W * 3 + 4;
  const LEN_W = 28;
  const nameW = width - HANDLE_W - IDX_W - LEN_W - ACTIONS_W - 8;

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      alpha={isDragging ? 0.45 : 1}
      layout={{ width, height: ROW_H, flexDirection: 'row', alignItems: 'center' }}
    >
      {/* Background */}
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height: ROW_H }} />

      {/* Drag handle */}
      <pixiContainer
        eventMode="static"
        cursor="grab"
        onPointerDown={(e: FederatedPointerEvent) => {
          e.stopPropagation();
          onDragStart(index);
        }}
        layout={{ width: HANDLE_W, height: ROW_H, justifyContent: 'center', alignItems: 'center' }}
      >
        <pixiGraphics draw={drawHandle} layout={{ width: 12, height: ROW_H }} />
      </pixiContainer>

      {/* Index */}
      <pixiContainer
        eventMode="static"
        onPointerUp={onSelect}
        layout={{ width: IDX_W, height: ROW_H, justifyContent: 'center', alignItems: 'center' }}
      >
        <pixiBitmapText
          text={index.toString().padStart(2, '0')}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={isActive ? theme.accent.color : theme.textMuted.color}
          layout={{}}
        />
      </pixiContainer>

      {/* Pattern name */}
      <pixiContainer
        eventMode="static"
        onPointerUp={onSelect}
        layout={{ width: nameW, height: ROW_H, alignItems: 'center', overflow: 'hidden' }}
      >
        <pixiBitmapText
          text={pattern.name.toUpperCase().slice(0, 20)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={isActive ? theme.text.color : theme.textSecondary.color}
          layout={{}}
        />
      </pixiContainer>

      {/* Length */}
      <pixiContainer
        eventMode="static"
        onPointerUp={onSelect}
        layout={{ width: LEN_W, height: ROW_H, alignItems: 'center', justifyContent: 'flex-end', paddingRight: 2 }}
      >
        <pixiBitmapText
          text={String(pattern.length)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </pixiContainer>

      {/* Action buttons */}
      <pixiContainer layout={{ width: ACTIONS_W, height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {/* Rename */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerOver={() => setHoveredBtn('rename')}
          onPointerOut={() => setHoveredBtn(null)}
          onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onRename(); }}
          layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
        >
          <pixiGraphics draw={makeActionBg('rename')} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
          <pixiBitmapText
            text="RN"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
            tint={hoveredBtn === 'rename' ? theme.accent.color : theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>

        {/* Clone */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerOver={() => setHoveredBtn('clone')}
          onPointerOut={() => setHoveredBtn(null)}
          onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onClone(); }}
          layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
        >
          <pixiGraphics draw={makeActionBg('clone')} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
          <pixiBitmapText
            text="CP"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
            tint={hoveredBtn === 'clone' ? theme.accent.color : theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>

        {/* Delete */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerOver={() => setHoveredBtn('delete')}
          onPointerOut={() => setHoveredBtn(null)}
          onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); onDelete(); }}
          layout={{ width: BTN_W, height: BTN_H, justifyContent: 'center', alignItems: 'center' }}
        >
          <pixiGraphics draw={makeActionBg('delete')} layout={{ position: 'absolute', width: BTN_W, height: BTN_H }} />
          <pixiBitmapText
            text={isPendingDelete ? 'DEL' : 'X'}
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 8, fill: 0xffffff }}
            tint={isPendingDelete ? theme.error.color : hoveredBtn === 'delete' ? theme.error.color : theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      </pixiContainer>
    </pixiContainer>
  );
};

// ─── PixiPatternManagement ─────────────────────────────────────────────────

interface PixiPatternManagementProps {
  width: number;
  height: number;
}

export const PixiPatternManagement: React.FC<PixiPatternManagementProps> = ({ width, height }) => {
  const theme = usePixiTheme();

  const patterns          = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);
  const addPattern        = useTrackerStore(s => s.addPattern);
  const deletePattern     = useTrackerStore(s => s.deletePattern);
  const clonePattern      = useTrackerStore(s => s.clonePattern);
  const resizePattern     = useTrackerStore(s => s.resizePattern);
  const reorderPatterns   = useTrackerStore(s => s.reorderPatterns);
  const updatePatternName = useTrackerStore(s => s.updatePatternName);
  const { pendingPatternIndex } = useLiveModeStore();

  const [selectedSize, setSelectedSize] = useState<string>('64');
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-to-reorder state
  const [draggingIndex, setDraggingIndex]     = useState<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  // Clean up delete timer on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    addPattern(parseInt(selectedSize, 10));
  }, [addPattern, selectedSize]);

  const handleRename = useCallback((index: number) => {
    const current = patterns[index];
    if (!current) return;
    const name = window.prompt('Rename pattern:', current.name);
    if (name && name.trim()) {
      updatePatternName(index, name.trim());
    }
  }, [patterns, updatePatternName]);

  const handleClone = useCallback((index: number) => {
    clonePattern(index);
  }, [clonePattern]);

  const handleDelete = useCallback((index: number) => {
    if (patterns.length === 1) {
      window.alert('Cannot delete the last pattern.');
      return;
    }
    if (pendingDeleteIndex === index) {
      // Second click — confirm delete
      deletePattern(index);
      setPendingDeleteIndex(null);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    } else {
      setPendingDeleteIndex(index);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => setPendingDeleteIndex(null), 3000);
    }
  }, [patterns.length, pendingDeleteIndex, deletePattern]);

  const handleResize = useCallback((value: string) => {
    resizePattern(currentPatternIndex, parseInt(value, 10));
  }, [resizePattern, currentPatternIndex]);

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
    setDragTargetIndex(index);
  }, []);

  // Global pointer move / up during drag
  useEffect(() => {
    if (draggingIndex === null) return;

    const onMove = (e: PointerEvent) => {
      // The list starts at HEADER_H + CONTROLS_H + CURRENT_INFO_H pixels from top.
      // We don't have direct DOM coordinates to the Pixi canvas offset easily here,
      // so we approximate by using the clientY relative to the canvas element.
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const localY = e.clientY - rect.top - HEADER_H - CONTROLS_H - CURRENT_INFO_H;
      const rowIdx = Math.max(0, Math.min(patterns.length - 1, Math.floor(localY / ROW_H)));
      setDragTargetIndex(rowIdx);
    };

    const onUp = () => {
      if (draggingIndex !== null && dragTargetIndex !== null && draggingIndex !== dragTargetIndex) {
        reorderPatterns(draggingIndex, dragTargetIndex);
      }
      setDraggingIndex(null);
      setDragTargetIndex(null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [draggingIndex, dragTargetIndex, patterns.length, reorderPatterns]);

  // ── Drawing callbacks ─────────────────────────────────────────────────────

  const drawHeader = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, HEADER_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  const drawControls = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, CONTROLS_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, CONTROLS_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  const drawCurrentInfo = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, CURRENT_INFO_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, CURRENT_INFO_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  const drawFooter = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, FOOTER_H);
    g.fill({ color: theme.bgSecondary.color });
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [width, theme]);

  // ── Layout ────────────────────────────────────────────────────────────────

  const listHeight = height - HEADER_H - CONTROLS_H - CURRENT_INFO_H - FOOTER_H;
  const contentHeight = patterns.length * ROW_H;

  const currentPattern = patterns[currentPatternIndex];
  const currentLength  = currentPattern?.length ?? 64;

  // Pill button dimensions
  const PILL_W = 32;
  const PILL_H = 20;
  const PILL_GAP = 4;
  const makePillBg = useCallback((index: number) => {
    return (g: GraphicsType) => {
      g.clear();
      const isActive = index === currentPatternIndex;
      g.roundRect(0, 0, PILL_W, PILL_H, 4);
      if (isActive) {
        g.fill({ color: theme.accent.color, alpha: 0.85 });
        g.roundRect(0, 0, PILL_W, PILL_H, 4);
        g.stroke({ color: theme.accent.color, alpha: 1, width: 1 });
      } else {
        g.fill({ color: theme.bgTertiary.color, alpha: 1 });
        g.roundRect(0, 0, PILL_W, PILL_H, 4);
        g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });
      }
    };
  }, [currentPatternIndex, theme]);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>

      {/* ── Header ── */}
      <pixiContainer layout={{ width, height: HEADER_H, alignItems: 'center', paddingLeft: 10 }}>
        <pixiGraphics draw={drawHeader} layout={{ position: 'absolute', width, height: HEADER_H }} />
        <pixiBitmapText
          text="PATTERN MANAGER"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{}}
        />
      </pixiContainer>

      {/* ── Add controls ── */}
      <pixiContainer
        layout={{
          width,
          height: CONTROLS_H,
          flexDirection: 'column',
          justifyContent: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawControls} layout={{ position: 'absolute', width, height: CONTROLS_H }} />

        {/* Size row */}
        <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: width - 16 }}>
          <pixiBitmapText
            text="SIZE:"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
            tint={theme.textSecondary.color}
            layout={{}}
          />
          <PixiSelect
            options={SIZE_OPTIONS}
            value={selectedSize}
            onChange={setSelectedSize}
            width={width - 16 - 48}
            height={22}
          />
        </pixiContainer>

        {/* Add button */}
        <PixiButton
          label="+ ADD PATTERN"
          variant="ft2"
          color="green"
          size="sm"
          width={width - 16}
          onClick={handleAdd}
          layout={{}}
        />
      </pixiContainer>

      {/* ── Current pattern info ── */}
      <pixiContainer
        layout={{
          width,
          height: CURRENT_INFO_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 6,
        }}
      >
        <pixiGraphics draw={drawCurrentInfo} layout={{ position: 'absolute', width, height: CURRENT_INFO_H }} />

        <pixiBitmapText
          text={(currentPattern?.name ?? 'NONE').toUpperCase().slice(0, 16)}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ flexGrow: 1 }}
        />

        <pixiBitmapText
          text="RESIZE:"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />

        <PixiSelect
          options={RESIZE_OPTIONS}
          value={String(currentLength)}
          onChange={handleResize}
          width={60}
          height={22}
        />
      </pixiContainer>

      {/* ── Pattern list (scrollable) ── */}
      <PixiScrollView
        width={width}
        height={listHeight}
        contentHeight={contentHeight}
        direction="vertical"
        showScrollbar
      >
        {patterns.map((pattern, index) => (
          <PatternRow
            key={pattern.id}
            pattern={pattern}
            index={index}
            isActive={index === currentPatternIndex}
            isQueued={pendingPatternIndex === index}
            isPendingDelete={pendingDeleteIndex === index}
            isDragging={draggingIndex === index}
            dragTargetIndex={dragTargetIndex}
            totalPatterns={patterns.length}
            width={width}
            onSelect={() => setCurrentPattern(index)}
            onRename={() => handleRename(index)}
            onClone={() => handleClone(index)}
            onDelete={() => handleDelete(index)}
            onDragStart={handleDragStart}
          />
        ))}
      </PixiScrollView>

      {/* ── Playback sequence footer ── */}
      <pixiContainer
        layout={{
          width,
          height: FOOTER_H,
          flexDirection: 'column',
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 6,
          gap: 4,
        }}
      >
        <pixiGraphics draw={drawFooter} layout={{ position: 'absolute', width, height: FOOTER_H }} />

        <pixiBitmapText
          text="PLAYBACK SEQUENCE"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />

        {/* Pills grid */}
        <pixiContainer
          layout={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: PILL_GAP,
            width: width - 16,
          }}
        >
          {patterns.map((pattern, index) => {
            const isActivePill = index === currentPatternIndex;
            return (
              <pixiContainer
                key={pattern.id}
                eventMode="static"
                cursor="pointer"
                onPointerUp={() => setCurrentPattern(index)}
                layout={{ width: PILL_W, height: PILL_H, justifyContent: 'center', alignItems: 'center' }}
              >
                <pixiGraphics
                  draw={makePillBg(index)}
                  layout={{ position: 'absolute', width: PILL_W, height: PILL_H }}
                />
                <pixiBitmapText
                  text={index.toString().padStart(2, '0')}
                  style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
                  tint={isActivePill ? 0xffffff : theme.textSecondary.color}
                  layout={{}}
                />
              </pixiContainer>
            );
          })}
        </pixiContainer>

        {/* Hint row */}
        <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <pixiBitmapText
            text="DRAG ROWS TO REORDER"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      </pixiContainer>

    </pixiContainer>
  );
};
