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
  /** width is required when rendered in GL context — see ScrollListProps */
  width,
  layout,
}) => {
  if (process.env.NODE_ENV !== 'production' && width === undefined) {
    console.warn('[ScrollList] width prop is required in GL renderer. Falling back to 200px.');
  }
  const resolvedWidth = width ?? 200;

  return (
    <PixiList
      items={items}
      selectedId={selectedId ?? null}
      onSelect={onSelect}
      onDoubleClick={onDoubleClick}
      width={resolvedWidth}
      height={height}
      itemHeight={itemHeight}
      layout={layout}
    />
  );
};
