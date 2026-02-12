/**
 * MIDIToolbarDropdown - MIDI status indicator and settings dropdown for toolbar
 */

import React, { useState, useEffect, useRef } from 'react';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { MIDIDeviceSelector } from './MIDIDeviceSelector';
import { MIDILearnModal } from './MIDILearnModal';
import { PerformancePanel } from './PerformancePanel';
import { Cable, CircleDot, AlertCircle, Loader2, ArrowUpDown, Settings2 } from 'lucide-react';


const MIDIToolbarDropdownComponent: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
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
      setIsInitializing(true);
      init().finally(() => setIsInitializing(false));
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
      setShowActivity(true);
      const timer = setTimeout(() => setShowActivity(false), 100);
      return () => clearTimeout(timer);
    }
  }, [lastActivityTimestamp]);

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
    <div className="relative" ref={dropdownRef}>
      {/* Toolbar Button */}
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

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-[80vh] bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 overflow-y-auto">
          {/* Header */}
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

          {isSupported === false ? (
            <div className="px-4 py-6 text-center">
              <AlertCircle size={24} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text-secondary">
                Web MIDI API is not supported in this browser.
              </p>
              <p className="text-xs text-text-muted mt-1">
                Try Chrome, Edge, or Opera.
              </p>
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
