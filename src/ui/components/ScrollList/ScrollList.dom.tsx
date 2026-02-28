import { useRef, useCallback } from 'react';
import type { ScrollListProps } from './types';

export const DOMScrollList: React.FC<ScrollListProps> = ({
  items,
  selectedId,
  onSelect,
  onDoubleClick,
  height,
  itemHeight = 28,
}) => {
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const handleClick = useCallback((id: string) => {
    const now = Date.now();
    if (lastClickRef.current.id === id && now - lastClickRef.current.time < 300) {
      onDoubleClick?.(id);
      lastClickRef.current = { id: '', time: 0 };
    } else {
      onSelect(id);
      lastClickRef.current = { id, time: now };
    }
  }, [onSelect, onDoubleClick]);

  return (
    <div
      role="listbox"
      style={{
        height,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--color-bg)',
      }}
    >
      {items.map((item, idx) => {
        const isSelected = item.id === selectedId;
        const isEven = idx % 2 === 0;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            tabIndex={0}
            onClick={() => handleClick(item.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(item.id); }}
            style={{
              height: itemHeight,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
              gap: 8,
              cursor: 'pointer',
              background: isSelected
                ? 'rgba(var(--color-accent-rgb), 0.15)'
                : isEven ? 'var(--color-bg)' : 'var(--color-bg-secondary)',
              color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              boxSizing: 'border-box',
              userSelect: 'none',
            }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            {item.sublabel && (
              <span style={{ color: 'var(--color-text-muted)', fontSize: 10, flexShrink: 0, paddingRight: 8 }}>
                {item.sublabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
