/**
 * HeightGlide — a box whose height follows its content and glides to each new
 * height instead of jumping, e.g. when a tab with taller content is opened.
 *
 * CSS cannot transition between two `height: auto` values, and the 0fr <-> 1fr
 * grid track HorizontalReveal uses only animates open/closed, not one content
 * size to another. So the inner box is measured and the outer box is given that
 * height in pixels, which the outer box's height transition then follows. The
 * first measurement replaces `auto`, which does not animate, so nothing slides
 * in on mount. Reduced motion drops the transition.
 */

import React, { useLayoutEffect, useRef, useState } from 'react';

export interface HeightGlideProps {
  children: React.ReactNode;
  /** Classes of the outer box: the one whose height glides. */
  className?: string;
  /** Classes of the inner box: the one sized by the content and measured. */
  contentClassName?: string;
  ref?: React.Ref<HTMLDivElement>;
}

export const HeightGlide: React.FC<HeightGlideProps> = ({ children, className = '', contentClassName = '', ref }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none ${className}`}
      style={{ height }}
    >
      <div ref={contentRef} className={contentClassName}>{children}</div>
    </div>
  );
};
