/**
 * PixiPatternOrderModal — GL-native pattern order editor.
 * Replaces HTML5 drag-drop with pointer-based reordering.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { PixiScrollView } from '../components/PixiScrollView';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useTrackerStore } from '@stores';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { notify } from '@stores/useNotificationStore';

interface PixiPatternOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODAL_W = 600;
const MODAL_H = 500;
const CELL_W = 52;
const CELL_H = 44;
const GAP = 4;
const COLS = 10;
const PADDING = 12;
const TOOLBAR_H = 36;
const HELP_H = 28;
const HEADER_H = 36;
const FOOTER_H = 0; // no footer, buttons in toolbar
const GRID_W = MODAL_W - PADDING * 2;
const GRID_H = MODAL_H - HEADER_H - TOOLBAR_H - HELP_H - PADDING * 2;

export const PixiPatternOrderModal: React.FC<PixiPatternOrderModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();

  const hasPerChannelTables = useTrackerStore((s) => !!s.channelTrackTables);
  const patternOrder = useTrackerStore((s) => s.patternOrder);
  const currentPositionIndex = useTrackerStore((s) => s.currentPositionIndex);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const addToOrder = useTrackerStore((s) => s.addToOrder);
  const removeFromOrder = useTrackerStore((s) => s.removeFromOrder);
  const duplicatePosition = useTrackerStore((s) => s.duplicatePosition);
  const clearOrder = useTrackerStore((s) => s.clearOrder);
  const reorderPositions = useTrackerStore((s) => s.reorderPositions);
  const setCurrentPosition = useTrackerStore((s) => s.setCurrentPosition);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const contentHeight = useMemo(() => {
    const rows = Math.ceil(patternOrder.length / COLS);
    return rows * (CELL_H + GAP) + GAP;
  }, [patternOrder.length]);

  const handleCellPointerDown = useCallback(
    (positionIndex: number, e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
      if (e.shiftKey) {
        duplicatePosition(positionIndex);
        notify.success('Position duplicated', 2000);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (patternOrder.length > 1) {
          removeFromOrder(positionIndex);
          notify.info('Position removed', 2000);
        } else {
          notify.warning('Cannot remove last position', 2000);
        }
        return;
      }
      setDragIndex(positionIndex);
    },
    [duplicatePosition, removeFromOrder, patternOrder.length],
  );

  const handleCellPointerUp = useCallback(
    (targetIndex: number) => {
      if (dragIndex !== null && dragIndex !== targetIndex) {
        reorderPositions(dragIndex, targetIndex);
        notify.success('Position reordered', 2000);
      } else if (dragIndex !== null && dragIndex === targetIndex) {
        // Simple click — select position
        setCurrentPosition(targetIndex);
        getTrackerReplayer().jumpToPosition(targetIndex, 0);
      }
      setDragIndex(null);
      setHoverIndex(null);
    },
    [dragIndex, reorderPositions, setCurrentPosition],
  );

  const handleCellPointerEnter = useCallback(
    (index: number) => {
      if (dragIndex !== null) setHoverIndex(index);
    },
    [dragIndex],
  );

  const handleAddCurrent = useCallback(() => {
    addToOrder(currentPatternIndex);
    notify.success(
      `Added Pattern ${currentPatternIndex.toString(16).padStart(2, '0').toUpperCase()}`,
      2000,
    );
  }, [addToOrder, currentPatternIndex]);

  const handleClearAll = useCallback(() => {
    clearOrder();
    notify.info('Pattern order cleared', 2000);
  }, [clearOrder]);

  if (!isOpen) return null;

  const title = hasPerChannelTables ? 'Track Table' : 'Pattern Order';

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title={title} width={MODAL_W} onClose={onClose} />

      {/* Toolbar */}
      {!hasPerChannelTables && (
        <layoutContainer
          layout={{
            width: MODAL_W,
            height: TOOLBAR_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingLeft: PADDING,
            paddingRight: PADDING,
            backgroundColor: theme.bgTertiary.color,
            borderBottomWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <PixiButton
            label="Add Current"
            variant="default"
            size="sm"
            width={110}
            height={24}
            onClick={handleAddCurrent}
          />
          <PixiButton
            label="Clear All"
            variant="default"
            color="red"
            size="sm"
            width={80}
            height={24}
            onClick={handleClearAll}
          />
          <layoutContainer layout={{ flex: 1 }} />
          <PixiLabel
            text={`${patternOrder.length} pos · Pat ${currentPatternIndex.toString(16).padStart(2, '0').toUpperCase()}`}
            size="xs"
            color="textMuted"
          />
        </layoutContainer>
      )}

      {/* Grid area */}
      <layoutContainer layout={{ flex: 1, width: MODAL_W, padding: PADDING }}>
        {hasPerChannelTables ? (
          <layoutContainer
            layout={{
              width: GRID_W,
              height: GRID_H,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <PixiLabel text="Per-channel track table" size="md" color="text" />
            <PixiLabel
              text="Read-only in GL view — use DOM modal for editing"
              size="xs"
              color="textMuted"
            />
          </layoutContainer>
        ) : (
          <PixiScrollView
            width={GRID_W}
            height={GRID_H}
            contentHeight={contentHeight}
          >
            <layoutContainer
              layout={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: GAP,
                width: GRID_W,
                padding: GAP,
              }}
            >
              {patternOrder.map((patternIdx, posIdx) => {
                const isCurrent = posIdx === currentPositionIndex;
                const isDragged = posIdx === dragIndex;
                const isDropTarget = posIdx === hoverIndex && dragIndex !== null && dragIndex !== posIdx;

                let bgColor = theme.bgTertiary.color;
                if (isCurrent) bgColor = theme.accent.color;
                if (isDropTarget) bgColor = theme.accentSecondary.color;

                const posHex = posIdx.toString(16).padStart(2, '0').toUpperCase();
                const patHex = patternIdx.toString(16).padStart(2, '0').toUpperCase();

                return (
                  <layoutContainer
                    key={posIdx}
                    eventMode="static"
                    cursor="pointer"
                    onPointerDown={(e: { nativeEvent?: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } }) => {
                      const ne = e.nativeEvent ?? {};
                      handleCellPointerDown(posIdx, {
                        shiftKey: ne.shiftKey,
                        ctrlKey: ne.ctrlKey,
                        metaKey: ne.metaKey,
                      });
                    }}
                    onPointerUp={() => handleCellPointerUp(posIdx)}
                    onPointerEnter={() => handleCellPointerEnter(posIdx)}
                    layout={{
                      width: CELL_W,
                      height: CELL_H,
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: bgColor,
                      borderWidth: 1,
                      borderColor: isCurrent ? theme.accent.color : theme.border.color,
                      borderRadius: 3,
                      opacity: isDragged ? 0.4 : 1,
                    }}
                  >
                    <pixiBitmapText
                      text={posHex}
                      style={{
                        fontFamily: PIXI_FONTS.MONO,
                        fontSize: 8,
                        fill: 0xffffff,
                      }}
                      tint={isCurrent ? theme.textInverse.color : theme.textMuted.color}
                      layout={{}}
                    />
                    <pixiBitmapText
                      text={patHex}
                      style={{
                        fontFamily: PIXI_FONTS.MONO_BOLD,
                        fontSize: 14,
                        fill: 0xffffff,
                      }}
                      tint={isCurrent ? theme.textInverse.color : theme.text.color}
                      layout={{ marginTop: 2 }}
                    />
                  </layoutContainer>
                );
              })}
            </layoutContainer>
          </PixiScrollView>
        )}
      </layoutContainer>

      {/* Help text */}
      <layoutContainer
        layout={{
          width: MODAL_W,
          height: HELP_H,
          paddingLeft: PADDING,
          paddingRight: PADDING,
          alignItems: 'center',
          backgroundColor: theme.bgTertiary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel
          text={
            hasPerChannelTables
              ? 'Per-channel track table (read-only)'
              : 'Click: Select · Drag: Reorder · Shift+Click: Duplicate · Ctrl+Click: Remove'
          }
          size="xs"
          color="textMuted"
        />
      </layoutContainer>
    </PixiModal>
  );
};
