/**
 * MIDILearnModal - Extensive MIDI mapping configuration modal
 *
 * Features:
 * - Auto-detects connected MIDI controllers
 * - Suggests mappings based on controller profile
 * - Maps both TB-303 parameters and tracker actions
 * - MIDI Learn mode for custom mappings
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useMIDI } from '../../hooks/useMIDI';
import { useInstrumentStore } from '../../stores';
import { getCCMapManager, type GeneralCCMapping } from '../../midi/CCMapManager';
import { getMPKMiniDisplay } from '../../midi/MPKMiniDisplay';
import {
  CONTROLLER_PROFILES,
  TRACKER_ACTIONS,
  TB303_PARAMETERS,
  detectControllerProfile,
  type ControllerProfile,
  type TrackerAction,
  type TB303Parameter,
} from '../../midi/controllerProfiles';
import {
  Cable,
  X,
  Radio,
  Trash2,
  Zap,
  Music,
  Sliders,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  Settings,
  Monitor,
} from 'lucide-react';

interface MIDILearnModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type MappingTarget = {
  type: 'parameter';
  id: TB303Parameter;
  label: string;
  min: number;
  max: number;
  category: string;
} | {
  type: 'action';
  id: TrackerAction;
  label: string;
  category: string;
};

type TabId = 'devices' | 'parameters' | 'actions' | 'mappings' | 'settings';

export const MIDILearnModal: React.FC<MIDILearnModalProps> = ({ isOpen, onClose }) => {
  const { devices, isSupported, isEnabled, lastMessage, enableMIDI } = useMIDI();
  const ccManager = getCCMapManager();
  const instruments = useInstrumentStore((state) => state.instruments);

  // Initialize CCMapManager when modal opens
  useEffect(() => {
    if (isOpen && isEnabled) {
      ccManager.init();
    }
  }, [isOpen, isEnabled, ccManager]);

  const [activeTab, setActiveTab] = useState<TabId>('devices');
  const [detectedProfile, setDetectedProfile] = useState<ControllerProfile | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ControllerProfile | null>(null);
  const [isLearning, setIsLearning] = useState(false);
  const [learningTarget, setLearningTarget] = useState<MappingTarget | null>(null);
  const [mappings, setMappings] = useState<GeneralCCMapping[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Transport', '303 Main']));
  const [sensitivity, setSensitivity] = useState(ccManager.getGlobalSensitivity());
  const [isMPKMiniConnected, setIsMPKMiniConnected] = useState(false);
  const [displaySyncStatus, setDisplaySyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [controlledInstrumentId, setControlledInstrumentId] = useState<number | null>(
    ccManager.getControlledInstrument()
  );

  // Subscribe to controlled instrument changes
  useEffect(() => {
    return ccManager.onControlledInstrumentChange((id) => {
      setControlledInstrumentId(id);
    });
  }, [ccManager]);

  // Handle instrument selection change
  const handleInstrumentChange = useCallback((instrumentId: number | null) => {
    ccManager.setControlledInstrument(instrumentId);
    setControlledInstrumentId(instrumentId);
  }, [ccManager]);

  // Check for MPK Mini connection
  useEffect(() => {
    if (isEnabled && devices.length > 0) {
      const mpkDisplay = getMPKMiniDisplay();
      requestAnimationFrame(() => setIsMPKMiniConnected(mpkDisplay.checkConnection()));
    }
  }, [isEnabled, devices]);

  // Sync knob names to MPK Mini display
  const syncDisplayNames = useCallback(async () => {
    const mpkDisplay = getMPKMiniDisplay();
    if (!mpkDisplay.checkConnection()) {
      setDisplaySyncStatus('error');
      return;
    }

    setDisplaySyncStatus('syncing');

    // Build knob name map from current mappings
    // MPK Mini MK3 default CC numbers: 70-77 for knobs 1-8
    const knobNames: Record<number, string> = {};
    const ccToKnob: Record<number, number> = {
      70: 1, 71: 2, 72: 3, 73: 4, 74: 5, 75: 6, 76: 7, 77: 8
    };

    mappings.forEach((mapping) => {
      const knobNum = ccToKnob[mapping.ccNumber];
      if (knobNum && mapping.displayName) {
        // Truncate to fit display (16 chars max)
        knobNames[knobNum] = mapping.displayName.substring(0, 16);
      }
    });

    try {
      const success = await mpkDisplay.setKnobNames(knobNames);
      setDisplaySyncStatus(success ? 'success' : 'error');
      if (success) {
        setTimeout(() => setDisplaySyncStatus('idle'), 2000);
      }
    } catch {
      setDisplaySyncStatus('error');
    }
  }, [mappings]);

  // Apply DEViLBOX preset to MPK Mini display
  const applyDEViLBOXDisplayPreset = useCallback(async () => {
    const mpkDisplay = getMPKMiniDisplay();
    setDisplaySyncStatus('syncing');
    try {
      const success = await mpkDisplay.applyDEViLBOXPreset();
      setDisplaySyncStatus(success ? 'success' : 'error');
      if (success) {
        setTimeout(() => setDisplaySyncStatus('idle'), 2000);
      }
    } catch {
      setDisplaySyncStatus('error');
    }
  }, []);

  // Refresh mappings from CCMapManager
  const refreshMappings = useCallback(() => {
    setMappings(ccManager.getAllMappings());
  }, [ccManager]);

  // Auto-detect controller profile when devices change
  useEffect(() => {
    if (devices.length > 0) {
      const detected = detectControllerProfile(devices[0].name || '');
      requestAnimationFrame(() => {
        setDetectedProfile(detected);
        if (detected && !selectedProfile) {
          setSelectedProfile(detected);
        }
      });
    }
  }, [devices, selectedProfile]);

  // Subscribe to mapping changes
  useEffect(() => {
    requestAnimationFrame(() => refreshMappings());
    return ccManager.onMappingChange(refreshMappings);
  }, [ccManager, refreshMappings]);

  // Handle MIDI learn mode
  useEffect(() => {
    if (!isLearning || !learningTarget) return;

    const handleLearn = (isLearning: boolean) => {
      if (!isLearning) {
        setIsLearning(false);
        setLearningTarget(null);
        refreshMappings();
      }
    };

    return ccManager.onLearnChange(handleLearn);
  }, [isLearning, learningTarget, ccManager, refreshMappings]);

  // Start learning for a target
  const startLearning = async (target: MappingTarget) => {
    setIsLearning(true);
    setLearningTarget(target);

    const result = await ccManager.startLearn(
      0, // Instrument ID 0 for global TB-303
      target.id,
      target.label,
      target.type === 'parameter' ? target.min : 0,
      target.type === 'parameter' ? target.max : 127,
      target.type === 'parameter' && target.id.includes('cutoff') ? 'logarithmic' : 'linear'
    );

    if (result) {
      // Create the mapping
      ccManager.setMapping({
        id: `${result.channel}-${result.ccNumber}-${target.id}`,
        ccNumber: result.ccNumber,
        midiChannel: result.channel,
        instrumentId: 0,
        parameterPath: target.id,
        min: target.type === 'parameter' ? target.min : 0,
        max: target.type === 'parameter' ? target.max : 127,
        curve: target.type === 'parameter' && target.id.includes('cutoff') ? 'logarithmic' : 'linear',
        displayName: target.label,
      });
    }

    setIsLearning(false);
    setLearningTarget(null);
  };

  // Cancel learning
  const cancelLearning = () => {
    ccManager.cancelLearn();
    setIsLearning(false);
    setLearningTarget(null);
  };

  // Apply suggested profile mappings
  const applySuggestedMappings = () => {
    if (!selectedProfile) return;

    // Apply knob mappings
    selectedProfile.knobs.forEach((knob) => {
      if (knob.defaultMapping) {
        const param = TB303_PARAMETERS[knob.defaultMapping as TB303Parameter];
        if (param) {
          ccManager.setMapping({
            id: `suggested-${knob.cc}-${knob.defaultMapping}`,
            ccNumber: knob.cc,
            instrumentId: 0,
            parameterPath: knob.defaultMapping,
            min: param.min,
            max: param.max,
            curve: knob.defaultMapping.includes('cutoff') ? 'logarithmic' : 'linear',
            displayName: param.label,
          });
        }
      }
    });

    // Apply pad mappings for actions
    selectedProfile.pads.forEach((pad) => {
      if (pad.defaultMapping && pad.cc !== undefined) {
        const action = TRACKER_ACTIONS[pad.defaultMapping as TrackerAction];
        if (action) {
          ccManager.setMapping({
            id: `suggested-${pad.cc}-${pad.defaultMapping}`,
            ccNumber: pad.cc,
            instrumentId: 0,
            parameterPath: pad.defaultMapping,
            min: 0,
            max: 127,
            curve: 'linear',
            displayName: action.label,
          });
        }
      }
    });

    refreshMappings();
  };

  // Remove a mapping
  const removeMapping = (id: string) => {
    ccManager.removeMapping(id);
    refreshMappings();
  };

  // Clear all mappings
  const clearAllMappings = () => {
    ccManager.clearAllMappings();
    refreshMappings();
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Check if a parameter is mapped
  const isMapped = (targetId: string): boolean => {
    return mappings.some((m) => m.parameterPath === targetId);
  };

  // Get mapping for a parameter
  const getMappingFor = (targetId: string): GeneralCCMapping | undefined => {
    return mappings.find((m) => m.parameterPath === targetId);
  };

  // Update sensitivity
  const handleSensitivityChange = (value: number) => {
    setSensitivity(value);
    ccManager.setGlobalSensitivity(value);
  };

  if (!isOpen) return null;

  // Group parameters by category
  const parameterCategories = Object.entries(TB303_PARAMETERS).reduce(
    (acc, [id, param]) => {
      const category = param.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push({ id: id as TB303Parameter, ...param });
      return acc;
    },
    {} as Record<string, Array<{ id: TB303Parameter; label: string; min: number; max: number; category: string }>>
  );

  // Group actions by category
  const actionCategories = Object.entries(TRACKER_ACTIONS).reduce(
    (acc, [id, action]) => {
      const category = action.category;
      if (!acc[category]) acc[category] = [];
      acc[category].push({ id: id as TrackerAction, ...action });
      return acc;
    },
    {} as Record<string, Array<{ id: TrackerAction; label: string; category: string }>>
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-dark-bg border border-dark-border rounded-lg w-[800px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Cable size={20} />
            MIDI Controller Setup
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Learning Overlay */}
        {isLearning && learningTarget && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-10 rounded-lg">
            <Radio size={48} className="text-accent-primary animate-spin mb-4" />
            <p className="text-text-primary text-lg mb-2">
              Move a controller to map to:
            </p>
            <p className="text-accent-primary text-xl font-bold mb-4">
              {learningTarget.label}
            </p>
            {lastMessage && lastMessage.type === 'cc' && (
              <p className="text-text-muted text-sm mb-4">
                Last: CH{lastMessage.channel + 1} CC{lastMessage.controller} = {lastMessage.value}
              </p>
            )}
            <button
              onClick={cancelLearning}
              className="px-4 py-2 bg-dark-bgSecondary hover:bg-dark-bgActive text-text-secondary rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-dark-border">
          {[
            { id: 'devices' as TabId, label: 'Devices', icon: Cable },
            { id: 'parameters' as TabId, label: 'TB-303', icon: Sliders },
            { id: 'actions' as TabId, label: 'Tracker', icon: Music },
            { id: 'mappings' as TabId, label: 'Mappings', icon: Zap },
            { id: 'settings' as TabId, label: 'Settings', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-text-muted hover:text-text-secondary'
                }
              `}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Devices Tab */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              {!isSupported ? (
                <div className="bg-accent-error/10 border border-accent-error/30 rounded p-4">
                  <div className="flex items-center gap-2 text-accent-error">
                    <AlertCircle size={20} />
                    <span>Web MIDI API not supported</span>
                  </div>
                  <p className="text-text-muted text-sm mt-2">
                    Try using Chrome, Edge, or Opera for MIDI support
                  </p>
                </div>
              ) : !isEnabled ? (
                <div className="text-center py-8">
                  <Cable size={48} className="mx-auto text-text-muted mb-4" />
                  <p className="text-text-secondary mb-4">
                    Enable MIDI to connect your controller
                  </p>
                  <button
                    onClick={enableMIDI}
                    className="px-6 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white rounded font-medium transition-colors"
                  >
                    Enable MIDI
                  </button>
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center py-8">
                  <Cable size={48} className="mx-auto text-text-muted mb-4" />
                  <p className="text-text-secondary">
                    No MIDI devices detected
                  </p>
                  <p className="text-text-muted text-sm mt-2">
                    Connect a MIDI controller and refresh
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-text-secondary mb-3">
                      Connected Devices
                    </h3>
                    <div className="space-y-2">
                      {devices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between bg-dark-bgSecondary rounded p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-3 h-3 rounded-full ${device.state === 'connected' ? 'bg-accent-success' : 'bg-text-muted'}`} />
                            <div>
                              <div className="text-text-primary font-medium">{device.name}</div>
                              <div className="text-text-muted text-xs">{device.manufacturer}</div>
                            </div>
                          </div>
                          {detectedProfile && device.name?.toLowerCase().includes(detectedProfile.detectPatterns[0]) && (
                            <span className="text-xs bg-accent-primary/20 text-accent-primary px-2 py-1 rounded">
                              Auto-detected: {detectedProfile.name}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-text-secondary mb-3">
                      Controller Profile
                    </h3>
                    <select
                      value={selectedProfile?.id || ''}
                      onChange={(e) => {
                        const profile = CONTROLLER_PROFILES.find((p) => p.id === e.target.value);
                        setSelectedProfile(profile || null);
                      }}
                      className="w-full bg-dark-bgSecondary border border-dark-border rounded px-3 py-2 text-text-primary"
                    >
                      <option value="">Select a profile...</option>
                      {CONTROLLER_PROFILES.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.manufacturer} {profile.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedProfile && (
                    <div className="bg-dark-bgSecondary rounded p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-text-primary">
                          {selectedProfile.manufacturer} {selectedProfile.name}
                        </h4>
                        <button
                          onClick={applySuggestedMappings}
                          className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm rounded transition-colors"
                        >
                          Apply Suggested Mappings
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-text-muted">Knobs:</span>{' '}
                          <span className="text-text-secondary">{selectedProfile.knobs.length}</span>
                        </div>
                        <div>
                          <span className="text-text-muted">Pads:</span>{' '}
                          <span className="text-text-secondary">{selectedProfile.pads.length}</span>
                        </div>
                        {selectedProfile.extras?.faders && (
                          <div>
                            <span className="text-text-muted">Faders:</span>{' '}
                            <span className="text-text-secondary">{selectedProfile.extras.faders.length}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Parameters Tab (TB-303) */}
          {activeTab === 'parameters' && (
            <div className="space-y-3">
              {Object.entries(parameterCategories).map(([category, params]) => (
                <div key={category} className="bg-dark-bgSecondary rounded overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-dark-bgActive transition-colors"
                  >
                    <span className="text-sm font-medium text-text-secondary">{category}</span>
                    {expandedCategories.has(category) ? (
                      <ChevronDown size={16} className="text-text-muted" />
                    ) : (
                      <ChevronRight size={16} className="text-text-muted" />
                    )}
                  </button>
                  {expandedCategories.has(category) && (
                    <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                      {params.map((param) => {
                        const mapped = isMapped(param.id);
                        const mapping = getMappingFor(param.id);
                        const isCurrentlyLearning = isLearning && learningTarget?.id === param.id;

                        return (
                          <div
                            key={param.id}
                            className={`
                              flex items-center justify-between px-3 py-2 rounded text-sm
                              ${isCurrentlyLearning
                                ? 'bg-accent-primary text-white'
                                : mapped
                                ? 'bg-accent-success/20 border border-accent-success/30'
                                : 'bg-dark-bgTertiary'
                              }
                            `}
                          >
                            <div className="flex items-center gap-2">
                              {mapped && <Check size={14} className="text-accent-success" />}
                              <span className={mapped ? 'text-accent-success' : 'text-text-secondary'}>
                                {param.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {mapping && (
                                <span className="text-[10px] text-text-muted font-mono">
                                  CC{mapping.ccNumber}
                                </span>
                              )}
                              <button
                                onClick={() =>
                                  startLearning({
                                    type: 'parameter',
                                    id: param.id,
                                    label: param.label,
                                    min: param.min,
                                    max: param.max,
                                    category: param.category,
                                  })
                                }
                                disabled={isLearning}
                                className={`
                                  px-2 py-0.5 rounded text-xs transition-colors
                                  ${isCurrentlyLearning
                                    ? 'bg-white/20'
                                    : 'bg-dark-bgActive hover:bg-accent-primary/20 text-text-muted hover:text-accent-primary'
                                  }
                                `}
                              >
                                {isCurrentlyLearning ? 'Learning...' : 'Learn'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions Tab (Tracker) */}
          {activeTab === 'actions' && (
            <div className="space-y-3">
              {Object.entries(actionCategories).map(([category, actions]) => (
                <div key={category} className="bg-dark-bgSecondary rounded overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-dark-bgActive transition-colors"
                  >
                    <span className="text-sm font-medium text-text-secondary">{category}</span>
                    {expandedCategories.has(category) ? (
                      <ChevronDown size={16} className="text-text-muted" />
                    ) : (
                      <ChevronRight size={16} className="text-text-muted" />
                    )}
                  </button>
                  {expandedCategories.has(category) && (
                    <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                      {actions.map((action) => {
                        const mapped = isMapped(action.id);
                        const mapping = getMappingFor(action.id);
                        const isCurrentlyLearning = isLearning && learningTarget?.id === action.id;

                        return (
                          <div
                            key={action.id}
                            className={`
                              flex items-center justify-between px-3 py-2 rounded text-sm
                              ${isCurrentlyLearning
                                ? 'bg-accent-primary text-white'
                                : mapped
                                ? 'bg-accent-success/20 border border-accent-success/30'
                                : 'bg-dark-bgTertiary'
                              }
                            `}
                          >
                            <div className="flex items-center gap-2">
                              {mapped && <Check size={14} className="text-accent-success" />}
                              <span className={mapped ? 'text-accent-success' : 'text-text-secondary'}>
                                {action.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {mapping && (
                                <span className="text-[10px] text-text-muted font-mono">
                                  CC{mapping.ccNumber}
                                </span>
                              )}
                              <button
                                onClick={() =>
                                  startLearning({
                                    type: 'action',
                                    id: action.id,
                                    label: action.label,
                                    category: action.category,
                                  })
                                }
                                disabled={isLearning}
                                className={`
                                  px-2 py-0.5 rounded text-xs transition-colors
                                  ${isCurrentlyLearning
                                    ? 'bg-white/20'
                                    : 'bg-dark-bgActive hover:bg-accent-primary/20 text-text-muted hover:text-accent-primary'
                                  }
                                `}
                              >
                                {isCurrentlyLearning ? 'Learning...' : 'Learn'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Mappings Tab */}
          {activeTab === 'mappings' && (
            <div className="space-y-4">
              {mappings.length === 0 ? (
                <div className="text-center py-8">
                  <Zap size={48} className="mx-auto text-text-muted mb-4" />
                  <p className="text-text-secondary">No mappings configured</p>
                  <p className="text-text-muted text-sm mt-2">
                    Go to TB-303 or Tracker tabs to create mappings
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button
                      onClick={clearAllMappings}
                      className="flex items-center gap-1 text-sm text-accent-error hover:underline"
                    >
                      <Trash2 size={14} />
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-2">
                    {mappings.map((mapping) => (
                      <div
                        key={mapping.id}
                        className="flex items-center justify-between bg-dark-bgSecondary rounded px-4 py-3"
                      >
                        <div>
                          <div className="text-text-primary font-medium">
                            {mapping.displayName || mapping.parameterPath}
                          </div>
                          <div className="text-text-muted text-xs">
                            {mapping.parameterPath}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-text-secondary font-mono text-sm">
                              {mapping.midiChannel !== undefined ? `CH${mapping.midiChannel + 1} ` : ''}CC{mapping.ccNumber}
                            </div>
                            <div className="text-text-muted text-xs">
                              {mapping.min} - {mapping.max} ({mapping.curve})
                            </div>
                          </div>
                          <button
                            onClick={() => removeMapping(mapping.id)}
                            className="text-accent-error hover:text-accent-error/80 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-3">
                  Knob Sensitivity
                </h3>
                <div className="bg-dark-bgSecondary rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-text-muted text-sm">Slow (Smooth)</span>
                    <span className="text-text-primary font-mono">{sensitivity.toFixed(2)}</span>
                    <span className="text-text-muted text-sm">Fast (Direct)</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={sensitivity}
                    onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                    className="w-full accent-accent-primary"
                  />
                  <p className="text-text-muted text-xs mt-2">
                    Lower values make knobs respond more smoothly but slower.
                    Higher values give immediate response.
                  </p>
                </div>
              </div>

              {/* Controlled Instrument */}
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                  <Sliders size={16} />
                  Controlled Instrument
                </h3>
                <div className="bg-dark-bgSecondary rounded p-4">
                  <select
                    value={controlledInstrumentId ?? 'all'}
                    onChange={(e) => {
                      const value = e.target.value;
                      handleInstrumentChange(value === 'all' ? null : parseInt(value));
                    }}
                    className="w-full bg-dark-bgTertiary border border-dark-border rounded px-3 py-2 text-text-primary mb-2"
                  >
                    <option value="all">All TB-303 Instruments</option>
                    {instruments.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.id}. {inst.name} ({inst.synthType || 'Sampler'})
                      </option>
                    ))}
                  </select>
                  <p className="text-text-muted text-xs">
                    Choose which instrument responds to MIDI CC knobs.
                    "All TB-303" controls every TB-303 synth at once.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-3">
                  Quick Setup
                </h3>
                <div className="space-y-2">
                  <button
                    onClick={applySuggestedMappings}
                    disabled={!selectedProfile}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-primary hover:bg-accent-primary/80 disabled:bg-dark-bgSecondary disabled:text-text-muted text-white rounded font-medium transition-colors"
                  >
                    <Zap size={18} />
                    Apply Suggested Mappings
                  </button>
                  <button
                    onClick={clearAllMappings}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-dark-bgSecondary hover:bg-dark-bgActive text-text-secondary rounded transition-colors"
                  >
                    <Trash2 size={18} />
                    Clear All Mappings
                  </button>
                </div>
              </div>

              {/* MPK Mini Display Sync */}
              {isMPKMiniConnected && (
                <div>
                  <h3 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                    <Monitor size={16} />
                    MPK Mini MK3 Display
                  </h3>
                  <div className="bg-dark-bgSecondary rounded p-4 space-y-3">
                    <p className="text-text-muted text-xs">
                      Sync parameter names to your MPK Mini's OLED display.
                      Names will show when you turn the knobs.
                    </p>
                    <div className="space-y-2">
                      <button
                        onClick={syncDisplayNames}
                        disabled={displaySyncStatus === 'syncing' || mappings.length === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 disabled:bg-dark-bgTertiary disabled:text-text-muted text-white rounded text-sm transition-colors"
                      >
                        <Monitor size={16} />
                        {displaySyncStatus === 'syncing' ? 'Syncing...' : 'Sync Current Mappings'}
                      </button>
                      <button
                        onClick={applyDEViLBOXDisplayPreset}
                        disabled={displaySyncStatus === 'syncing'}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-dark-bgTertiary hover:bg-dark-bgActive text-text-secondary rounded text-sm transition-colors"
                      >
                        <Zap size={16} />
                        Apply DEViLBOX Preset (TB-303)
                      </button>
                    </div>
                    {displaySyncStatus === 'success' && (
                      <p className="text-accent-success text-xs flex items-center gap-1">
                        <Check size={12} /> Display updated!
                      </p>
                    )}
                    {displaySyncStatus === 'error' && (
                      <p className="text-accent-error text-xs flex items-center gap-1">
                        <AlertCircle size={12} /> Failed to update display
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-3">
                  Supported Controllers
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {CONTROLLER_PROFILES.filter((p) => p.id !== 'generic').map((profile) => (
                    <div
                      key={profile.id}
                      className="bg-dark-bgSecondary rounded px-3 py-2 text-text-muted"
                    >
                      {profile.manufacturer} {profile.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
          <div className="text-xs text-text-muted">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''} active
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-bgSecondary hover:bg-dark-bgActive text-text-secondary rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
