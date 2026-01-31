/**
 * MIDILearnPanel - UI for MIDI device management and CC mapping
 */

import React, { useEffect, useState } from 'react';
import { useMIDI } from '../../hooks/useMIDI';
import { useMIDIMappingStore, type MIDIMappableParameter } from '../../stores/useMIDIMappingStore';
import { Cable, Trash2, Radio, XCircle } from 'lucide-react';

const PARAMETER_LABELS: Record<MIDIMappableParameter, { label: string; min: number; max: number; group?: string }> = {
  // General
  baseOctave: { label: 'Base Octave', min: 1, max: 6, group: 'General' },
  velocity: { label: 'Velocity', min: 0, max: 127, group: 'General' },
  // TB-303 Main
  cutoff: { label: 'Cutoff', min: 50, max: 18000, group: '303 Main' },
  resonance: { label: 'Resonance', min: 0, max: 100, group: '303 Main' },
  envMod: { label: 'Env Mod', min: 0, max: 100, group: '303 Main' },
  decay: { label: 'Decay', min: 30, max: 3000, group: '303 Main' },
  accent: { label: 'Accent', min: 0, max: 100, group: '303 Main' },
  slideTime: { label: 'Slide Time', min: 10, max: 500, group: '303 Main' },
  overdrive: { label: 'Overdrive', min: 0, max: 100, group: '303 Main' },
  // TB-303 Devil Fish
  normalDecay: { label: 'Normal Decay', min: 30, max: 3000, group: 'Devil Fish' },
  accentDecay: { label: 'Accent Decay', min: 30, max: 3000, group: 'Devil Fish' },
  softAttack: { label: 'Soft Attack', min: 0.3, max: 30, group: 'Devil Fish' },
  vegSustain: { label: 'VEG Sustain', min: 0, max: 100, group: 'Devil Fish' },
  filterFM: { label: 'Filter FM', min: 0, max: 100, group: 'Devil Fish' },
  filterTracking: { label: 'Key Track', min: 0, max: 200, group: 'Devil Fish' },
};

interface MIDILearnPanelProps {
  onClose?: () => void;
}

export const MIDILearnPanel: React.FC<MIDILearnPanelProps> = ({ onClose }) => {
  const { devices, isSupported, isEnabled, lastMessage, enableMIDI, disableMIDI, onMessage } = useMIDI();
  const {
    mappings,
    isLearning,
    learningParameter,
    addMapping,
    removeMapping,
    clearAllMappings,
    startLearning,
    stopLearning,
  } = useMIDIMappingStore();

  const [error, setError] = useState<string | null>(null);

  // Handle MIDI learn mode
  useEffect(() => {
    if (!isLearning || !learningParameter) return;

    const unsubscribe = onMessage((message) => {
      if (message.type === 'cc' && message.controller !== undefined && message.value !== undefined) {
        const paramInfo = PARAMETER_LABELS[learningParameter];
        addMapping({
          channel: message.channel,
          controller: message.controller,
          parameter: learningParameter,
          min: paramInfo.min,
          max: paramInfo.max,
          curve: 'linear',
        });
        stopLearning();
      }
    });

    return unsubscribe;
  }, [isLearning, learningParameter, onMessage, addMapping, stopLearning]);

  const handleEnableMIDI = async () => {
    try {
      setError(null);
      await enableMIDI();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable MIDI');
    }
  };

  if (!isSupported) {
    return (
      <div className="bg-dark-bgSecondary border border-dark-border rounded p-4">
        <div className="flex items-center gap-2 text-accent-error">
          <XCircle size={16} />
          <span className="text-sm">Web MIDI API not supported in this browser</span>
        </div>
        <p className="text-xs text-text-muted mt-2">
          Try using Chrome, Edge, or Opera for MIDI support
        </p>
      </div>
    );
  }

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Cable size={16} />
          MIDI Learn
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xs"
          >
            Close
          </button>
        )}
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-3">
        {!isEnabled ? (
          <button
            onClick={handleEnableMIDI}
            className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary/80 text-white rounded text-xs font-medium transition-colors"
          >
            Enable MIDI
          </button>
        ) : (
          <>
            <button
              onClick={disableMIDI}
              className="px-3 py-1.5 bg-dark-bgTertiary hover:bg-dark-bgActive text-text-secondary rounded text-xs transition-colors"
            >
              Disable MIDI
            </button>
            <span className="flex items-center gap-1 text-xs text-accent-success">
              <span className="w-2 h-2 bg-accent-success rounded-full animate-pulse" />
              Connected
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="bg-accent-error/10 border border-accent-error/30 rounded p-2 text-xs text-accent-error">
          {error}
        </div>
      )}

      {/* Device List */}
      {isEnabled && devices.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-2">Connected Devices</h4>
          <div className="space-y-1">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-2 text-xs text-text-muted bg-dark-bgTertiary rounded px-2 py-1"
              >
                <span className={`w-2 h-2 rounded-full ${device.state === 'connected' ? 'bg-accent-success' : 'bg-text-muted'}`} />
                <span className="flex-1">{device.name}</span>
                <span className="text-[10px] opacity-60">{device.manufacturer}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last MIDI Message */}
      {isEnabled && lastMessage && lastMessage.type === 'cc' && (
        <div className="bg-dark-bgTertiary rounded p-2">
          <div className="text-xs text-text-muted">Last CC Message:</div>
          <div className="text-xs font-mono text-text-primary mt-1">
            CH{lastMessage.channel + 1} CC{lastMessage.controller} = {lastMessage.value}
          </div>
        </div>
      )}

      {/* Learn Mode */}
      {isEnabled && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-text-secondary">Map Parameters</h4>
          {/* Group parameters by category */}
          {['General', '303 Main', 'Devil Fish'].map((group) => {
            const groupParams = (Object.keys(PARAMETER_LABELS) as MIDIMappableParameter[])
              .filter((param) => PARAMETER_LABELS[param].group === group);

            if (groupParams.length === 0) return null;

            return (
              <div key={group}>
                <div className="text-[10px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
                  {group}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {groupParams.map((param) => {
                    const isMapped = Array.from(mappings.values()).some((m) => m.parameter === param);
                    const isCurrentlyLearning = isLearning && learningParameter === param;

                    return (
                      <button
                        key={param}
                        onClick={() => {
                          if (isCurrentlyLearning) {
                            stopLearning();
                          } else {
                            startLearning(param);
                          }
                        }}
                        className={`
                          flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors
                          ${isCurrentlyLearning
                            ? 'bg-accent-primary text-white animate-pulse'
                            : isMapped
                            ? 'bg-accent-success/20 text-accent-success border border-accent-success/30'
                            : 'bg-dark-bgTertiary hover:bg-dark-bgActive text-text-secondary'
                          }
                        `}
                      >
                        {isCurrentlyLearning && <Radio size={12} className="animate-spin" />}
                        <span className="flex-1 text-left">{PARAMETER_LABELS[param].label}</span>
                        {isMapped && !isCurrentlyLearning && <span className="text-[10px]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {isLearning && (
            <p className="text-xs text-accent-primary mt-2 animate-pulse">
              Move a MIDI controller to assign it to {PARAMETER_LABELS[learningParameter!].label}...
            </p>
          )}
        </div>
      )}

      {/* Current Mappings */}
      {isEnabled && mappings.size > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-text-secondary">Active Mappings</h4>
            <button
              onClick={clearAllMappings}
              className="flex items-center gap-1 text-xs text-accent-error hover:underline"
            >
              <Trash2 size={10} />
              Clear All
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {Array.from(mappings.entries()).map(([key, mapping]) => (
              <div
                key={key}
                className="flex items-center justify-between bg-dark-bgTertiary rounded px-2 py-1 text-xs"
              >
                <span className="text-text-primary">
                  {PARAMETER_LABELS[mapping.parameter].label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-text-muted text-[10px]">
                    CH{mapping.channel + 1} CC{mapping.controller}
                  </span>
                  <button
                    onClick={() => removeMapping(mapping.channel, mapping.controller)}
                    className="text-accent-error hover:text-accent-error/80"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
