/**
 * GmTabGroup — Tab page switcher for gearmulator hardware skins.
 * Matches the RML tabgroup/tabbutton/tabpage pattern.
 */

import React, { useState, useCallback } from 'react';
import { GmButton, type GmButtonSprites } from './GmButton';

export interface GmTab {
  id: string;
  label: string;
  sprites: GmButtonSprites;
  style?: React.CSSProperties;
}

export interface GmTabPage {
  id: string;
  /** Content to render when this tab is active */
  children: React.ReactNode;
  /** Background image for this page */
  backgroundSrc?: string;
  style?: React.CSSProperties;
}

export interface GmTabGroupProps {
  tabs: GmTab[];
  pages: GmTabPage[];
  /** Initially active tab index */
  defaultTab?: number;
  /** CSS styles for the tab group container */
  style?: React.CSSProperties;
  className?: string;
}

export const GmTabGroup: React.FC<GmTabGroupProps> = ({
  tabs, pages, defaultTab = 0, style, className
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabClick = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  return (
    <div className={`gm-tabgroup ${className ?? ''}`} style={style}>
      {/* Tab buttons */}
      {tabs.map((tab, i) => (
        <GmButton
          key={tab.id}
          sprites={tab.sprites}
          checked={i === activeTab}
          isToggle={false}
          onChange={() => handleTabClick(i)}
          style={{ position: 'absolute', ...tab.style }}
        />
      ))}

      {/* Tab pages — only active page is visible */}
      {pages.map((page, i) => (
        <div
          key={page.id}
          className={`gm-tabpage ${i === activeTab ? 'active' : ''}`}
          style={{
            display: i === activeTab ? 'block' : 'none',
            position: 'absolute',
            backgroundImage: page.backgroundSrc ? `url(${page.backgroundSrc})` : undefined,
            backgroundRepeat: 'no-repeat',
            ...page.style,
          }}
        >
          {page.children}
        </div>
      ))}
    </div>
  );
};
