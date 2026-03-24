/**
 * StarRating — Inline 5-star rating component (DOM).
 * Shows community average, user's own rating, and allows click-to-rate.
 * Click the same star to remove your rating.
 */

import React, { useState } from 'react';

export const StarRating: React.FC<{
  avg: number;
  count: number;
  userRating?: number;
  onRate?: (star: number) => void;
}> = ({ avg, count, userRating, onRate }) => {
  const [hovered, setHovered] = useState(0);

  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0 ml-2">
      {[1, 2, 3, 4, 5].map(star => {
        const display = hovered || userRating || Math.round(avg);
        const isFilled = star <= display;
        const isUser = userRating != null && star <= userRating;
        return (
          <span
            key={star}
            className={`text-sm leading-none select-none ${
              onRate ? 'cursor-pointer' : ''
            } ${
              hovered && star <= hovered
                ? 'text-amber-300'
                : isUser
                  ? 'text-amber-400'
                  : isFilled
                    ? 'text-amber-500'
                    : 'text-white/40'
            }`}
            onMouseEnter={() => onRate && setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={(e) => {
              e.stopPropagation();
              if (!onRate) return;
              onRate(userRating === star ? 0 : star);
            }}
          >
            {isFilled || (hovered && star <= hovered) ? '\u2605' : '\u2606'}
          </span>
        );
      })}
      {count > 0 && (
        <span className="text-[9px] text-text-muted/50 ml-0.5">({count})</span>
      )}
    </span>
  );
};
