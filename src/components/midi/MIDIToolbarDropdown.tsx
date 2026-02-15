/**
 * MIDIToolbarDropdown - MIDI status indicator and settings dropdown for toolbar
 */

import React, { useState, useEffect, useRef } from 'react';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { MIDIDeviceSelector } from './MIDIDeviceSelector';
import { MIDILearnModal } from './MIDILearnModal';
import { PerformancePanel } from './PerformancePanel';
import { Cable, CircleDot, AlertCircle, Loader2, ArrowUpDown, Settings2, Smartphone } from 'lucide-react';
import { getBluetoothMIDIInfo } from '../../midi/BluetoothMIDIManager';

interface MIDIToolbarDropdownProps {
  inline?: boolean; // If true, always shows expanded without button (for mobile menu)
}

const MIDIToolbarDropdownComponent: React.FC<MIDIToolbarDropdownProps> = ({ inline = false }) => {
  const [isOpen, setIsOpen] = useState(inline); // Start open if inline mode
  const [isInitializing, setIsInitializing] = useState(false);
  const [showLearnModal, setShowLearnModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // PERFORMANCE OPTIMIZATION: Use individual selectors
  const isSupported = useMIDIStore((state) => state.isSupported);
  const isInitialized = useMIDIStore((state) => state.isInitialized);
  const lastError = useMIDIStore((state) => state.lastError);
  const inputDevices = useMIDIStore((state) => state.inputDevices);
  const outputDevices = useMIDIStore((state) => state.outputDevices);
  const selectedInputId = useMIDIStore((state) => state.selectedInputId);
  const selectedOutputId = useMIDIStore((state) => state.selectedOutputId);
  const isLearning = useMIDIStore((state) => state.isLearning);
  const lastActivityTimestamp = useMIDIStore((state) => state.lastActivityTimestamp);
  const init = useMIDIStore((state) => state.init);
  const selectInput = useMIDIStore((state) => state.selectInput);
  const selectOutput = useMIDIStore((state) => state.selectOutput);
  const cancelLearn = useMIDIStore((state) => state.cancelLearn);
  const openPatternDialog = useMIDIStore((state) => state.openPatternDialog);

  // Initialize MIDI on mount (when isSupported is null, we haven't checked yet)
  useEffect(() => {
    if (!isInitialized && isSupported === null) {
      requestAnimationFrame(() => setIsInitializing(true));
      init().finally(() => requestAnimationFrame(() => setIsInitializing(false)));
    }
  }, [isInitialized, isSupported, init]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (isLearning) cancelLearn();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isLearning, cancelLearn]);

  // Activity flash effect
  const [showActivity, setShowActivity] = useState(false);
  useEffect(() => {
    if (lastActivityTimestamp > 0) {
      requestAnimationFrame(() => setShowActivity(true));
      const timer = setTimeout(() => setShowActivity(false), 100);
      return () => clearTimeout(timer);
    }
  }, [lastActivityTimestamp]);

  // Get mobile MIDI info
  const midiInfo = getBluetoothMIDIInfo();

  // Determine status color
  const getStatusColor = () => {
    if (isSupported === null) return 'text-text-muted'; // Not yet checked
    if (isSupported === false) return 'text-text-muted'; // Not supported
    if (lastError) return 'text-accent-error';
    if (!isInitialized) return 'text-text-muted';
    if (selectedInputId || selectedOutputId) return 'text-accent-success';
    return 'text-accent-warning';
  };

  return (
    <>
    <div className={inline ? "w-full" : "relative"} ref={inline ? undefined : dropdownRef}>
      {/* Toolbar Button (hidden in inline mode) */}
      {!inline && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center gap-2 px-2 py-1 rounded text-sm font-medium
            transition-all duration-150
            ${isOpen ? 'bg-dark-bgActive text-text-primary' : 'hover:bg-dark-bgHover'}
            ${getStatusColor()}
          `}
          title={
            !isSupported
              ? 'MIDI not supported'
              : !isInitialized
              ? 'MIDI not initialized'
              : selectedInputId || selectedOutputId
              ? 'MIDI connected'
              : 'No MIDI device'
          }
        >
          <div className="relative">
            <Cable size={16} />
            {showActivity && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent-primary rounded-full animate-ping" />
            )}
          </div>
          <span className="hidden sm:inline">MIDI</span>
        </button>
      )}

      {/* Dropdown / Inline Content */}
      {isOpen && (
        <div className={inline ? "w-full" : "absolute right-0 top-full mt-1 w-80 max-h-[80vh] bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 overflow-y-auto"}>
          {/* Header (only in dropdown mode) */}
          {!inline && (
            <div className="px-4 py-3 border-b border-dark-border bg-dark-bgSecondary">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-primary">MIDI Settings</h3>
                {isInitializing && <Loader2 size={14} className="animate-spin text-accent-primary" />}
              </div>
              {lastError && (
                <div className="flex items-center gap-2 mt-1 text-xs text-accent-error">
                  <AlertCircle size={12} />
                  <span>{lastError}</span>
                </div>
              )}
            </div>
          )}

          {isSupported === false ? (
            <div className="px-4 py-6">
              <div className="flex items-center gap-2 mb-3 justify-center">
                {midiInfo.isIOS || midiInfo.instructions?.includes('Android') ? (
                  <Smartphone size={24} className="text-text-muted" />
                ) : (
                  <AlertCircle size={24} className="text-text-muted" />
                )}
              </div>
              <p className="text-sm text-text-secondary text-center mb-3">
                Web MIDI API is not supported in this browser.
              </p>

              {/* Safari-specific troubleshooting */}
              {midiInfo.isIOS && (
                <div className="text-xs bg-accent-warning/10 border border-accent-warning/30 rounded p-3 mb-3">
                  <p className="font-bold text-accent-warning mb-2">Safari Troubleshooting:</p>
                  <ul className="list-disc list-inside space-y-1 text-text-secondary">
                    <li>Make sure you're using <strong>Safari</strong> (not Chrome on iOS)</li>
                    <li>Web MIDI requires <strong>HTTPS</strong> - check the URL starts with https://</li>
                    <li>Disable <strong>Private Browsing Mode</strong> - MIDI doesn't work in private mode</li>
                    <li>Check <strong>Settings → Safari → Advanced → Experimental Features</strong> and ensure 'Web MIDI API' is ON</li>
                    <li><strong>Home Screen Apps (PWA):</strong> Apple sometimes disables MIDI for apps saved to the home screen. Try using the regular Safari browser tab.</li>
                    <li>Update to <strong>iOS 15+</strong> for full MIDI support</li>
                    <li>Check browser console for detailed error messages</li>
                  </ul>
                  
                  {/* Real-time diagnostics */}
                  <div className="mt-3 pt-3 border-t border-accent-warning/20 font-mono text-[10px] text-text-muted space-y-1">
                    <div className="flex justify-between">
                      <span>Secure Context:</span>
                      <span className={window.isSecureContext ? "text-accent-success" : "text-accent-error"}>
                        {window.isSecureContext ? "YES" : "NO"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>PWA Mode:</span>
                      <span>{
                        // @ts-ignore
                        (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) ? "YES" : "NO"
                      }</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Protocol:</span>
                      <span>{window.location.protocol}</span>
                    </div>
                  </div>
                </div>
              )}

              {midiInfo.instructions && (
                <div className="text-xs text-text-muted text-left bg-dark-bgSecondary rounded p-3 max-h-64 overflow-y-auto whitespace-pre-line">
                  {midiInfo.instructions}
                </div>
              )}
            </div>
          ) : isSupported === null ? (
            <div className="px-4 py-6 text-center">
              <Loader2 size={24} className="mx-auto mb-2 text-text-muted animate-spin" />
              <p className="text-sm text-text-secondary">
                Checking MIDI support...
              </p>
            </div>
          ) : (
            <>
              {/* Device Selection */}
              <div className="px-4 py-3 space-y-3 border-b border-dark-border">
                <MIDIDeviceSelector
                  label="Input Device"
                  devices={inputDevices}
                  selectedId={selectedInputId}
                  onSelect={selectInput}
                />
                <MIDIDeviceSelector
                  label="Output Device"
                  devices={outputDevices}
                  selectedId={selectedOutputId}
                  onSelect={selectOutput}
                />
                {/* Mobile Help - Show instructions if on mobile and no devices connected */}
                {(midiInfo.isIOS || midiInfo.instructions?.includes('Android')) &&
                 inputDevices.length === 0 && outputDevices.length === 0 && (
                  <div className="mt-2 p-3 bg-dark-bgSecondary rounded border border-dark-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Smartphone size={14} className="text-accent-primary" />
                      <span className="text-xs font-medium text-text-primary">
                        Mobile MIDI Setup
                      </span>
                    </div>
                    <div className="text-xs text-text-muted whitespace-pre-line max-h-48 overflow-y-auto">
                      {midiInfo.instructions}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="px-4 py-2 border-b border-dark-border space-y-2">
                {/* MIDI Controller Setup */}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowLearnModal(true);
                  }}
                  className="w-full px-3 py-2 text-sm font-medium bg-accent-primary/20 border border-accent-primary/30 rounded flex items-center justify-center gap-2 hover:bg-accent-primary/30 transition-colors text-accent-primary"
                >
                  <Settings2 size={14} />
                  MIDI Controller Setup...
                </button>
                {/* TD-3 Pattern Transfer */}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    openPatternDialog();
                  }}
                  className="w-full px-3 py-2 text-sm font-medium bg-dark-bgActive rounded flex items-center justify-center gap-2 hover:bg-dark-bgHover transition-colors"
                >
                  <ArrowUpDown size={14} />
                  TD-3 Patterns...
                </button>
              </div>

              {/* NKS Panel */}
              <div className="border-t border-dark-border">
                <PerformancePanel />
              </div>

              {/* Activity Indicator */}
              {selectedInputId && (
                <div className="px-4 py-2 border-t border-dark-border bg-dark-bgSecondary">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <CircleDot
                      size={10}
                      className={showActivity ? 'text-accent-success' : 'text-text-muted'}
                    />
                    <span>
                      {showActivity ? 'Receiving MIDI...' : 'Listening for MIDI input'}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>

    {/* MIDI Learn Modal */}
    <MIDILearnModal
      isOpen={showLearnModal}
      onClose={() => setShowLearnModal(false)}
    />
    </>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const MIDIToolbarDropdown = React.memo(MIDIToolbarDropdownComponent);
