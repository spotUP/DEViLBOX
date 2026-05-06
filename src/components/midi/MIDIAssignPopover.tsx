/**
 * MIDIAssignPopover — searchable picker for assigning params/actions to a control
 *
 * Shows categories of assignable targets:
 * - Parameters (continuous CC controls)
 * - Actions (button triggers)
 * - Dub Moves (performance triggers/holds)
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { ControlDescriptor } from '@/midi/controllerLayouts';
import type { ControlAssignment } from '@/stores/useMIDIPresetStore';

// ============================================================================
// ASSIGNABLE TARGETS
// ============================================================================

interface AssignableTarget {
  kind: 'param' | 'action' | 'dub';
  target: string;
  label: string;
  category: string;
}

const PARAM_TARGETS: AssignableTarget[] = [
  // DJ
  { kind: 'param', target: 'dj.crossfader', label: 'Crossfader', category: 'DJ' },
  { kind: 'param', target: 'dj.masterVolume', label: 'Master Volume', category: 'DJ' },
  { kind: 'param', target: 'dj.deckA.volume', label: 'Deck A Volume', category: 'DJ' },
  { kind: 'param', target: 'dj.deckA.filter', label: 'Deck A Filter', category: 'DJ' },
  { kind: 'param', target: 'dj.deckA.filterQ', label: 'Deck A Filter Q', category: 'DJ' },
  { kind: 'param', target: 'dj.deckA.pitch', label: 'Deck A Pitch', category: 'DJ' },
  { kind: 'param', target: 'dj.deckB.volume', label: 'Deck B Volume', category: 'DJ' },
  { kind: 'param', target: 'dj.deckB.filter', label: 'Deck B Filter', category: 'DJ' },
  { kind: 'param', target: 'dj.deckB.filterQ', label: 'Deck B Filter Q', category: 'DJ' },
  { kind: 'param', target: 'dj.deckB.pitch', label: 'Deck B Pitch', category: 'DJ' },

  // Dub Bus
  { kind: 'param', target: 'dub.echoWet', label: 'Echo Wet', category: 'Dub Bus' },
  { kind: 'param', target: 'dub.echoIntensity', label: 'Echo Intensity', category: 'Dub Bus' },
  { kind: 'param', target: 'dub.echoRateMs', label: 'Echo Rate', category: 'Dub Bus' },
  { kind: 'param', target: 'dub.springWet', label: 'Spring Wet', category: 'Dub Bus' },
  { kind: 'param', target: 'dub.returnGain', label: 'Return Gain', category: 'Dub Bus' },
  { kind: 'param', target: 'dub.hpfCutoff', label: 'High Pass Cutoff', category: 'Dub Bus' },
  { kind: 'param', target: 'dub.sidechainAmount', label: 'Sidechain Amount', category: 'Dub Bus' },

  // TB-303
  { kind: 'param', target: 'cutoff', label: 'Filter Cutoff', category: '303' },
  { kind: 'param', target: 'resonance', label: 'Resonance', category: '303' },
  { kind: 'param', target: 'envMod', label: 'Envelope Mod', category: '303' },
  { kind: 'param', target: 'decay', label: 'Decay', category: '303' },
  { kind: 'param', target: 'accent', label: 'Accent', category: '303' },
  { kind: 'param', target: 'overdrive', label: 'Overdrive', category: '303' },
  { kind: 'param', target: 'slideTime', label: 'Slide Time', category: '303' },
  { kind: 'param', target: 'volume', label: 'Volume', category: '303' },
  { kind: 'param', target: 'waveform', label: 'Waveform', category: '303' },

  // Mixer
  { kind: 'param', target: 'mixer.volume', label: 'Channel Volume', category: 'Mixer' },
  { kind: 'param', target: 'mixer.pan', label: 'Channel Pan', category: 'Mixer' },
  { kind: 'param', target: 'mixer.filterPosition', label: 'Channel Filter', category: 'Mixer' },
  { kind: 'param', target: 'mixer.filterResonance', label: 'Channel Filter Q', category: 'Mixer' },

  // Master FX
  { kind: 'param', target: 'masterFx.slot0.wet', label: 'FX Slot 1 Wet', category: 'Master FX' },
  { kind: 'param', target: 'masterFx.slot0.param0', label: 'FX Slot 1 Param', category: 'Master FX' },
  { kind: 'param', target: 'masterFx.slot1.wet', label: 'FX Slot 2 Wet', category: 'Master FX' },
  { kind: 'param', target: 'masterFx.slot1.param0', label: 'FX Slot 2 Param', category: 'Master FX' },
  { kind: 'param', target: 'masterFx.masterVolume', label: 'Master Volume', category: 'Master FX' },
  { kind: 'param', target: 'masterFx.limiterCeiling', label: 'Limiter Ceiling', category: 'Master FX' },
];

const ACTION_TARGETS: AssignableTarget[] = [
  // Transport
  { kind: 'action', target: 'play_a', label: 'Play Deck A', category: 'Transport' },
  { kind: 'action', target: 'play_b', label: 'Play Deck B', category: 'Transport' },
  { kind: 'action', target: 'cue_a', label: 'Cue Deck A', category: 'Transport' },
  { kind: 'action', target: 'cue_b', label: 'Cue Deck B', category: 'Transport' },
  { kind: 'action', target: 'sync_a', label: 'Sync Deck A', category: 'Transport' },
  { kind: 'action', target: 'sync_b', label: 'Sync Deck B', category: 'Transport' },

  // Channel controls
  ...Array.from({ length: 8 }, (_, i) => ({
    kind: 'action' as const,
    target: `channel_mute_${i + 1}`,
    label: `Mute Channel ${i + 1}`,
    category: 'Channels',
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    kind: 'action' as const,
    target: `channel_solo_${i + 1}`,
    label: `Solo Channel ${i + 1}`,
    category: 'Channels',
  })),

  // Push-to-talk
  { kind: 'action', target: 'ptt', label: 'Push to Talk', category: 'Transport' },
];

const DUB_TARGETS: AssignableTarget[] = [
  // Echo
  { kind: 'dub', target: 'dub.echoThrow', label: 'Echo Throw', category: 'Echo' },
  { kind: 'dub', target: 'dub.reverseEcho', label: 'Reverse Echo', category: 'Echo' },
  { kind: 'dub', target: 'dub.echoBuildUp', label: 'Echo Buildup', category: 'Echo' },
  { kind: 'dub', target: 'dub.delayTimeThrow', label: 'Delay Time Throw', category: 'Echo' },
  { kind: 'dub', target: 'dub.backwardReverb', label: 'Backward Reverb', category: 'Echo' },
  { kind: 'dub', target: 'dub.madProfPingPong', label: 'Ping Pong', category: 'Echo' },

  // Delay presets
  { kind: 'dub', target: 'dub.delayPresetQuarter', label: 'Delay 1/4', category: 'Delay' },
  { kind: 'dub', target: 'dub.delayPresetDotted', label: 'Delay Dotted', category: 'Delay' },
  { kind: 'dub', target: 'dub.delayPresetTriplet', label: 'Delay Triplet', category: 'Delay' },
  { kind: 'dub', target: 'dub.delayPreset8th', label: 'Delay 1/8', category: 'Delay' },
  { kind: 'dub', target: 'dub.delayPreset380', label: 'Delay 380ms', category: 'Delay' },
  { kind: 'dub', target: 'dub.delayPreset16th', label: 'Delay 1/16', category: 'Delay' },
  { kind: 'dub', target: 'dub.delayPresetDoubler', label: 'Delay Doubler', category: 'Delay' },

  // Spring/reverb
  { kind: 'dub', target: 'dub.springSlam', label: 'Spring Slam', category: 'Reverb' },
  { kind: 'dub', target: 'dub.springKick', label: 'Spring Kick', category: 'Reverb' },
  { kind: 'dub', target: 'dub.ghostReverb', label: 'Ghost Reverb', category: 'Reverb' },

  // Drops/stops
  { kind: 'dub', target: 'dub.tapeStop', label: 'Tape Stop', category: 'Performance' },
  { kind: 'dub', target: 'dub.transportTapeStop', label: 'Transport Tape Stop', category: 'Performance' },
  { kind: 'dub', target: 'dub.masterDrop', label: 'Master Drop', category: 'Performance' },
  { kind: 'dub', target: 'dub.versionDrop', label: 'Version Drop', category: 'Performance' },

  // Effects
  { kind: 'dub', target: 'dub.tubbyScream', label: 'Tubby Scream', category: 'Effects' },
  { kind: 'dub', target: 'dub.eqSweep', label: 'EQ Sweep', category: 'Effects' },
  { kind: 'dub', target: 'dub.crushBass', label: 'Crush Bass', category: 'Effects' },
  { kind: 'dub', target: 'dub.stereoDoubler', label: 'Stereo Doubler', category: 'Effects' },
  { kind: 'dub', target: 'dub.snareCrack', label: 'Snare Crack', category: 'Effects' },
  { kind: 'dub', target: 'dub.combSweep', label: 'Comb Sweep', category: 'Effects' },
  { kind: 'dub', target: 'dub.ringMod', label: 'Ring Modulator', category: 'Effects' },

  // Filters/risers
  { kind: 'dub', target: 'dub.hpfRise', label: 'High Pass Rise', category: 'Filter' },
  { kind: 'dub', target: 'dub.filterDrop', label: 'Filter Drop', category: 'Filter' },

  // Oscillator
  { kind: 'dub', target: 'dub.dubSiren', label: 'Dub Siren', category: 'Oscillator' },
  { kind: 'dub', target: 'dub.oscBass', label: 'Oscillator Bass', category: 'Oscillator' },
  { kind: 'dub', target: 'dub.sonarPing', label: 'Sonar Ping', category: 'Oscillator' },
  { kind: 'dub', target: 'dub.subSwell', label: 'Sub Swell', category: 'Oscillator' },
  { kind: 'dub', target: 'dub.radioRiser', label: 'Radio Riser', category: 'Oscillator' },
  { kind: 'dub', target: 'dub.subHarmonic', label: 'Sub Harmonic', category: 'Oscillator' },

  // Tape/modulation
  { kind: 'dub', target: 'dub.tapeWobble', label: 'Tape Wobble', category: 'Modulation' },
  { kind: 'dub', target: 'dub.voltageStarve', label: 'Voltage Starve', category: 'Modulation' },

  // Throw
  { kind: 'dub', target: 'dub.channelThrow', label: 'Channel Throw', category: 'Performance' },
];

const ALL_TARGETS = [...PARAM_TARGETS, ...ACTION_TARGETS, ...DUB_TARGETS];

// ============================================================================
// COMPONENT
// ============================================================================

interface MIDIAssignPopoverProps {
  /** The control being assigned */
  control: ControlDescriptor;
  /** Current assignment (if any) */
  currentAssignment?: ControlAssignment;
  /** Position to render at (absolute within parent) */
  position: { x: number; y: number };
  /** Called when user picks an assignment */
  onAssign: (assignment: ControlAssignment) => void;
  /** Called when user clears the assignment */
  onClear: () => void;
  /** Called when user clicks outside */
  onClose: () => void;
}

export const MIDIAssignPopover: React.FC<MIDIAssignPopoverProps> = ({
  control,
  currentAssignment,
  position,
  onAssign,
  onClear,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'param' | 'action' | 'dub'>(
    control.type === 'encoder' || control.type === 'fader' ? 'param' : 'dub',
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Filter targets
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ALL_TARGETS.filter((t) => {
      if (t.kind !== activeTab) return false;
      if (!q) return true;
      return t.label.toLowerCase().includes(q) ||
             t.target.toLowerCase().includes(q) ||
             t.category.toLowerCase().includes(q);
    });
  }, [search, activeTab]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, AssignableTarget[]>();
    for (const t of filtered) {
      const arr = groups.get(t.category) ?? [];
      arr.push(t);
      groups.set(t.category, arr);
    }
    return groups;
  }, [filtered]);

  const handleSelect = useCallback((target: AssignableTarget) => {
    onAssign({
      kind: target.kind,
      target: target.target,
    });
  }, [onAssign]);

  const tabs = [
    { key: 'param' as const, label: 'Parameters' },
    { key: 'action' as const, label: 'Actions' },
    { key: 'dub' as const, label: 'Dub Moves' },
  ];

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 w-72 bg-dark-bg border border-dark-border rounded-lg shadow-xl overflow-hidden"
      style={{
        left: Math.min(position.x, window.innerWidth - 320),
        top: Math.min(position.y, window.innerHeight - 400),
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-dark-border bg-dark-bgSecondary">
        <div className="text-text-primary text-xs font-mono font-bold">
          {control.label || control.id}
        </div>
        <div className="text-text-muted text-[10px] font-mono">
          {control.type} · {control.midi.type.toUpperCase()} {control.midi.number}
          {currentAssignment && (
            <span className="ml-2 text-accent-primary">
              → {currentAssignment.target}
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-dark-border">
        <input
          ref={searchRef}
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-dark-bgTertiary border border-dark-borderLight rounded px-2 py-1 text-text-primary font-mono text-xs focus:outline-none focus:border-accent-primary"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-1.5 text-[10px] font-mono transition-colors
              ${activeTab === tab.key
                ? 'text-accent-primary border-b-2 border-accent-primary bg-dark-bgSecondary'
                : 'text-text-muted hover:text-text-secondary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Target list */}
      <div className="max-h-48 overflow-y-auto">
        {grouped.size === 0 && (
          <div className="px-3 py-4 text-text-muted text-xs font-mono text-center">
            No matches
          </div>
        )}
        {Array.from(grouped).map(([category, targets]) => (
          <div key={category}>
            <div className="px-3 py-1 text-text-muted text-[9px] font-mono uppercase tracking-wider bg-dark-bgSecondary/50">
              {category}
            </div>
            {targets.map((target) => {
              const isCurrentTarget = currentAssignment?.target === target.target;
              return (
                <button
                  key={target.target}
                  onClick={() => handleSelect(target)}
                  className={`w-full px-3 py-1.5 text-left text-xs font-mono transition-colors flex items-center gap-2
                    ${isCurrentTarget
                      ? 'bg-accent-primary/20 text-accent-primary'
                      : 'text-text-primary hover:bg-dark-bgHover'}`}
                >
                  <span className="flex-1 truncate">{target.label}</span>
                  <span className="text-text-muted text-[9px] shrink-0">{target.target}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer — clear button */}
      {currentAssignment && (
        <div className="px-2 py-1.5 border-t border-dark-border">
          <button
            onClick={onClear}
            className="w-full px-2 py-1 text-[10px] font-mono text-accent-error hover:bg-accent-error/10 rounded transition-colors"
          >
            Clear Assignment
          </button>
        </div>
      )}
    </div>
  );
};
