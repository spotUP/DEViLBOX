/**
 * PixiNavBar — Top navigation bar for WebGL mode.
 * Renders the actual DOM NavBar component via PixiDOMOverlay
 * for pixel-perfect parity with the DOM tracker view.
 *
 * Adds a GL-specific "DOM" mode switch button.
 */

import { useCallback, useEffect, useState } from 'react';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useThemeStore } from '@stores/useThemeStore';

/**
 * Lazy wrapper for DOM NavBar + GL-specific "DOM" mode switch button.
 * Uses dynamic import() to avoid circular deps.
 */
const NavBarOverlay: React.FC = () => {
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const themeColors = useThemeStore(s => s.getCurrentTheme().colors);

  useEffect(() => {
    import('@components/layout/NavBar').then(m => setComp(() => m.NavBar));
  }, []);

  const handleSwitchToDom = useCallback(() => {
    useSettingsStore.getState().setRenderMode('dom');
  }, []);

  if (!Comp) return null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Comp />
      {/* GL-specific: Switch to DOM rendering mode — positioned in tab bar row,
          left of the "+" new-tab button to avoid overlapping navbar controls */}
      <button
        onClick={handleSwitchToDom}
        style={{
          position: 'absolute',
          bottom: '5px',
          right: '44px',
          padding: '2px 8px',
          fontSize: '11px',
          fontFamily: 'monospace',
          background: `${themeColors.accent}22`,
          color: themeColors.accent,
          border: `1px solid ${themeColors.accent}80`,
          borderRadius: '4px',
          cursor: 'pointer',
          zIndex: 100,
          lineHeight: '18px',
        }}
        title="Switch to DOM rendering mode"
      >
        DOM
      </button>
    </div>
  );
};

export const PixiNavBar: React.FC = () => {
  // DOM NavBar: top nav (~44px) + tab bar (~32px) — always shown
  const totalHeight = 76;

  return (
    <PixiDOMOverlay
      layout={{ width: '100%', height: totalHeight }}
      style={{ overflow: 'visible', zIndex: 40 }}
    >
      <NavBarOverlay />
    </PixiDOMOverlay>
  );
};
