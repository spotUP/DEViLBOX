import { PixiList } from '../../../pixi/components/PixiList';
import type { ScrollListProps } from './types';

/**
 * GL ScrollList — thin adapter over PixiList.
 * PixiList already handles virtualisation, scrollbar drag, and double-click.
 */
export const GLScrollList: React.FC<ScrollListProps> = ({
  items,
  selectedId,
  onSelect,
  onDoubleClick,
  height,
  itemHeight = 28,
  width = 200,
  layout,
}) => {
  return (
    <PixiList
      items={items}
      selectedId={selectedId ?? null}
      onSelect={onSelect}
      onDoubleClick={onDoubleClick}
      width={width}
      height={height}
      itemHeight={itemHeight}
      layout={layout}
    />
  );
};
