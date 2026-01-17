/**
 * SettingsModal - Global application settings
 */

import React from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { Toggle } from '@components/controls/Toggle';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const {
    useHexNumbers,
    setUseHexNumbers,
    tb303Collapsed,
    setTB303Collapsed,
    oscilloscopeVisible,
    setOscilloscopeVisible,
    compactToolbar,
    setCompactToolbar,
  } = useUIStore();

  const { currentThemeId, setTheme } = useThemeStore();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-ft2-bg border-2 border-ft2-border w-full max-w-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-ft2-header border-b-2 border-ft2-border">
          <h2 className="text-ft2-highlight font-bold text-sm tracking-wide">SETTINGS</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-ft2-border transition-colors text-ft2-text hover:text-ft2-highlight focus:outline-none"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-ft2">
          {/* Display Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">DISPLAY</h3>
            <div className="space-y-3">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Theme:</label>
                <select
                  value={currentThemeId}
                  onChange={(e) => setTheme(e.target.value)}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id} className="bg-ft2-bg text-ft2-text">
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Number Format */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Number Format:</label>
                <select
                  value={useHexNumbers ? 'hex' : 'dec'}
                  onChange={(e) => setUseHexNumbers(e.target.value === 'hex')}
                  className="bg-ft2-bg border border-ft2-border text-ft2-text text-xs font-mono px-2 py-1 focus:outline-none focus:border-ft2-highlight"
                >
                  <option value="hex" className="bg-ft2-bg text-ft2-text">Hexadecimal (01, 02, 0A, 0F)</option>
                  <option value="dec" className="bg-ft2-bg text-ft2-text">Decimal (01, 02, 10, 15)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Layout Section */}
          <section>
            <h3 className="text-ft2-highlight text-xs font-bold mb-3 tracking-wide">LAYOUT</h3>
            <div className="space-y-3">
              {/* TB-303 Panel */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">TB-303 Panel:</label>
                <Toggle
                  label=""
                  value={!tb303Collapsed}
                  onChange={(checked) => setTB303Collapsed(!checked)}
                  size="sm"
                />
              </div>

              {/* Oscilloscope */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Oscilloscope:</label>
                <Toggle
                  label=""
                  value={oscilloscopeVisible}
                  onChange={setOscilloscopeVisible}
                  size="sm"
                />
              </div>

              {/* Compact Toolbar */}
              <div className="flex items-center justify-between">
                <label className="text-ft2-text text-xs font-mono">Compact Toolbar:</label>
                <Toggle
                  label=""
                  value={compactToolbar}
                  onChange={setCompactToolbar}
                  size="sm"
                />
              </div>
            </div>
          </section>

          {/* Info Section */}
          <section className="pt-4 border-t border-ft2-border">
            <div className="text-ft2-textDim text-[10px] font-mono space-y-1">
              <div>DEViLBOX v1.0.0</div>
              <div>TB-303 Acid Tracker</div>
              <div className="text-ft2-highlight">Settings are saved automatically</div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-ft2-header border-t-2 border-ft2-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-ft2-cursor border border-ft2-cursor text-ft2-bg text-xs font-bold hover:bg-ft2-highlight hover:border-ft2-highlight transition-colors focus:outline-none"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
