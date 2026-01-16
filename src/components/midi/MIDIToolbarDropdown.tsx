/**
 * MIDIToolbarDropdown - MIDI status indicator and settings dropdown for toolbar
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMIDIStore } from '../../stores/useMIDIStore';
import { MIDIDeviceSelector } from './MIDIDeviceSelector';
import { Cable, CircleDot, AlertCircle, Loader2, RotateCcw, ArrowUpDown, Save, FolderOpen, Trash2 } from 'lucide-react';
import type { TB303Parameter, CCMapping } from '../../midi/types';

// Controller profile for saving/loading CC configurations
interface ControllerProfile {
  name: string;
  mappings: CCMapping[];
  createdAt: number;
}

const STORAGE_KEY = 'midi-controller-profiles';

const PARAMETER_LABELS: Record<TB303Parameter, string> = {
  cutoff: 'Cutoff',
  resonance: 'Resonance',
  envMod: 'Env Mod',
  decay: 'Decay',
  accent: 'Accent',
  overdrive: 'Overdrive',
  slideTime: 'Slide Time',
};

export const MIDIToolbarDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profiles, setProfiles] = useState<ControllerProfile[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    isSupported,
    isInitialized,
    lastError,
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    ccMappings,
    isLearning,
    learningParameter,
    lastActivityTimestamp,
    init,
    selectInput,
    selectOutput,
    startLearn,
    cancelLearn,
    resetMappings,
    openPatternDialog,
  } = useMIDIStore();

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

  // Handle Learn button click
  const handleLearnClick = (parameter: TB303Parameter) => {
    if (isLearning && learningParameter === parameter) {
      cancelLearn();
    } else {
      startLearn(parameter);
    }
  };

  // Get CC number for parameter
  const getCCForParameter = (parameter: TB303Parameter): number | null => {
    const mapping = ccMappings.find((m) => m.parameter === parameter);
    return mapping?.ccNumber ?? null;
  };

  // Load profiles from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setProfiles(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save current mappings as a profile
  const handleSaveProfile = useCallback(() => {
    if (!profileName.trim()) return;

    const newProfile: ControllerProfile = {
      name: profileName.trim(),
      mappings: [...ccMappings],
      createdAt: Date.now(),
    };

    const updatedProfiles = [...profiles, newProfile];
    setProfiles(updatedProfiles);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfiles));
    setProfileName('');
    setShowSaveDialog(false);
  }, [profileName, ccMappings, profiles]);

  // Load a saved profile
  const handleLoadProfile = useCallback((profile: ControllerProfile) => {
    // Apply all mappings from the profile
    profile.mappings.forEach((mapping) => {
      useMIDIStore.getState().setMapping(mapping);
    });
    setShowProfileMenu(false);
  }, []);

  // Delete a profile
  const handleDeleteProfile = useCallback((profileToDelete: ControllerProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedProfiles = profiles.filter((p) => p.createdAt !== profileToDelete.createdAt);
    setProfiles(updatedProfiles);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfiles));
  }, [profiles]);

  return (
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
        <div className="absolute right-0 top-full mt-1 w-80 bg-dark-bgTertiary border border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
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

              {/* TD-3 Pattern Transfer */}
              <div className="px-4 py-2 border-b border-dark-border">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    openPatternDialog();
                  }}
                  disabled={!selectedOutputId}
                  className="w-full px-3 py-2 text-sm font-medium bg-dark-bgActive rounded flex items-center justify-center gap-2 hover:bg-dark-bgHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowUpDown size={14} />
                  TD-3 Patterns...
                </button>
              </div>

              {/* CC Mappings */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    CC Mappings
                  </h4>
                  <div className="flex items-center gap-2">
                    {/* Controller Profile Menu */}
                    <div className="relative">
                      <button
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
                        title="Load/Save controller profiles"
                      >
                        <FolderOpen size={10} />
                        Profiles
                      </button>
                      {showProfileMenu && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-dark-bg border border-dark-border rounded-md shadow-lg z-10">
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setShowProfileMenu(false);
                                setShowSaveDialog(true);
                              }}
                              className="w-full px-3 py-1.5 text-xs text-left text-text-secondary hover:bg-dark-bgHover flex items-center gap-2"
                            >
                              <Save size={10} />
                              Save Current...
                            </button>
                            {profiles.length > 0 && (
                              <>
                                <div className="border-t border-dark-border my-1" />
                                <div className="px-2 py-1 text-xs text-text-muted">Saved Profiles</div>
                                {profiles.map((profile) => (
                                  <div
                                    key={profile.createdAt}
                                    className="flex items-center justify-between px-3 py-1.5 hover:bg-dark-bgHover cursor-pointer group"
                                    onClick={() => handleLoadProfile(profile)}
                                  >
                                    <span className="text-xs text-text-secondary">{profile.name}</span>
                                    <button
                                      onClick={(e) => handleDeleteProfile(profile, e)}
                                      className="text-text-muted hover:text-accent-error opacity-0 group-hover:opacity-100"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={resetMappings}
                      className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1"
                      title="Reset to TD-3 defaults"
                    >
                      <RotateCcw size={10} />
                      Reset
                    </button>
                  </div>
                </div>

                {/* Save Profile Dialog */}
                {showSaveDialog && (
                  <div className="mb-3 p-2 bg-dark-bg rounded border border-dark-border">
                    <input
                      type="text"
                      placeholder="Profile name..."
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveProfile();
                        if (e.key === 'Escape') setShowSaveDialog(false);
                      }}
                      className="w-full px-2 py-1 text-xs bg-dark-bgSecondary border border-dark-border rounded text-text-primary"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleSaveProfile}
                        className="flex-1 px-2 py-1 text-xs bg-accent-primary text-text-inverse rounded hover:bg-accent-primary/80"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setShowSaveDialog(false)}
                        className="px-2 py-1 text-xs bg-dark-bgActive text-text-secondary rounded hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Info: Works with any controller */}
                <p className="text-[10px] text-text-muted mb-2 italic">
                  Works with any USB-MIDI controller. Use Learn to assign CCs.
                </p>

                <div className="space-y-1">
                  {(['cutoff', 'resonance', 'envMod', 'decay', 'accent'] as TB303Parameter[]).map(
                    (param) => {
                      const ccNum = getCCForParameter(param);
                      const isCurrentlyLearning = isLearning && learningParameter === param;

                      return (
                        <div
                          key={param}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-sm text-text-secondary">
                            {PARAMETER_LABELS[param]}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-text-muted w-8 text-right">
                              {ccNum !== null ? `CC${ccNum}` : '—'}
                            </span>
                            <button
                              onClick={() => handleLearnClick(param)}
                              className={`
                                px-2 py-0.5 text-xs rounded font-medium transition-colors
                                ${isCurrentlyLearning
                                  ? 'bg-accent-primary text-text-inverse animate-pulse'
                                  : 'bg-dark-bgActive text-text-secondary hover:text-text-primary'
                                }
                              `}
                            >
                              {isCurrentlyLearning ? 'Waiting...' : 'Learn'}
                            </button>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                {isLearning && (
                  <p className="mt-2 text-xs text-accent-primary text-center">
                    Move a knob on your MIDI controller...
                  </p>
                )}
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
  );
};
