/**
 * MusicLineToolbar — Channel mute toggles, mono/poly keyboard mode, and
 * collapsible song metadata panel for MusicLine Editor.
 *
 * Renders inline within the MusicLine section of TrackerView.tsx.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFormatStore } from '@stores';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';
import { ChevronDown, ChevronRight } from 'lucide-react';

// ── Channel Mute Toggles ──────────────────────────────────────────────────

interface ChannelMuteTogglesProps {
  numChannels: number;
}

const ChannelMuteToggles: React.FC<ChannelMuteTogglesProps> = ({ numChannels }) => {
  const [muteMask, setMuteMask] = useState(0); // bits: 1 = muted

  const toggleChannel = useCallback((ch: number) => {
    setMuteMask((prev) => {
      const newMask = prev ^ (1 << ch);
      // Forward to WASM engine
      if (MusicLineEngine.hasInstance()) {
        const ml = MusicLineEngine.getInstance();
        ml.setChannelOn(ch, (newMask & (1 << ch)) === 0);
      }
      return newMask;
    });
  }, []);

  const soloChannel = useCallback((ch: number) => {
    // Double-click or right-click to solo: mute all except this channel
    setMuteMask((prev) => {
      const allMuted = ((1 << numChannels) - 1) & ~(1 << ch);
      const isSoloed = prev === allMuted;
      const newMask = isSoloed ? 0 : allMuted; // toggle solo off/on

      if (MusicLineEngine.hasInstance()) {
        const ml = MusicLineEngine.getInstance();
        for (let i = 0; i < numChannels; i++) {
          ml.setChannelOn(i, (newMask & (1 << i)) === 0);
        }
      }
      return newMask;
    });
  }, [numChannels]);

  return (
    <div className="flex items-center gap-0.5">
      <span className="text-xs text-text-muted mr-1">Ch:</span>
      {Array.from({ length: numChannels }, (_, ch) => {
        const isMuted = (muteMask & (1 << ch)) !== 0;
        return (
          <button
            key={ch}
            className={`w-5 h-5 text-xs font-mono rounded border transition-colors ${
              isMuted
                ? 'bg-dark-bgSecondary text-text-muted border-dark-border opacity-40'
                : 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
            }`}
            onClick={() => toggleChannel(ch)}
            onContextMenu={(e) => {
              e.preventDefault();
              soloChannel(ch);
            }}
            title={`Channel ${ch + 1}: ${isMuted ? 'Muted' : 'Active'} (right-click to solo)`}
          >
            {ch + 1}
          </button>
        );
      })}
    </div>
  );
};

// ── Mono/Poly Keyboard Mode Toggle ────────────────────────────────────────

const KeyboardModeToggle: React.FC = () => {
  const mode = useFormatStore((s) => s.musiclineKeyboardMode);
  const toggle = useFormatStore((s) => s.toggleMusicLineKeyboardMode);

  return (
    <button
      className={`px-2 py-0.5 text-xs rounded border transition-colors ${
        mode === 'poly'
          ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40'
          : 'bg-dark-bgSecondary text-text-muted border-dark-border'
      }`}
      onClick={toggle}
      title="Keyboard input mode: Mono (one channel) / Poly (rotate across channels)"
    >
      {mode === 'mono' ? 'Mono' : 'Poly'}
    </button>
  );
};

// ── Song Metadata Panel ───────────────────────────────────────────────────

const MetadataPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const metadata = useFormatStore((s) => s.musiclineMetadata);
  const setField = useFormatStore((s) => s.setMusicLineMetadataField);

  // Show nothing if no metadata was parsed and panel is collapsed
  const hasAnyData = metadata && (
    metadata.title || metadata.author || metadata.date || metadata.duration ||
    metadata.infoText.some((t) => t)
  );

  return (
    <div className="border-t border-dark-border">
      <button
        className="flex items-center gap-1 px-3 py-1 w-full text-left text-xs text-text-muted hover:text-text-primary transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>Song Info</span>
        {hasAnyData && !expanded && (
          <span className="ml-2 text-text-secondary truncate">
            {metadata!.title || metadata!.author || '(has metadata)'}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
          <MetadataField label="Title" value={metadata?.title ?? ''} field="title" onChange={setField} />
          <MetadataField label="Author" value={metadata?.author ?? ''} field="author" onChange={setField} />
          <MetadataField label="Date" value={metadata?.date ?? ''} field="date" onChange={setField} />
          <MetadataField label="Duration" value={metadata?.duration ?? ''} field="duration" onChange={setField} />
          {Array.from({ length: 5 }, (_, i) => (
            <MetadataField
              key={i}
              label={`Info ${i + 1}`}
              value={metadata?.infoText[i] ?? ''}
              field={`info${i}`}
              onChange={setField}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface MetadataFieldProps {
  label: string;
  value: string;
  field: string;
  onChange: (field: string, value: string) => void;
}

const MetadataField: React.FC<MetadataFieldProps> = ({ label, value, field, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = useCallback(() => {
    if (localValue !== value) {
      onChange(field, localValue);
    }
  }, [localValue, value, field, onChange]);

  return (
    <>
      <label className="text-text-muted whitespace-nowrap py-0.5">{label}</label>
      <input
        ref={inputRef}
        type="text"
        className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1.5 py-0.5 text-xs font-mono focus:border-accent-primary/50 focus:outline-none"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
          // Stop propagation to prevent tracker keyboard shortcuts from firing
          e.stopPropagation();
        }}
      />
    </>
  );
};

// ── Main Toolbar ──────────────────────────────────────────────────────────

interface MusicLineToolbarProps {
  numChannels: number;
}

export const MusicLineToolbar: React.FC<MusicLineToolbarProps> = ({ numChannels }) => {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-3 py-1">
        <ChannelMuteToggles numChannels={numChannels} />
        <div className="h-4 w-px bg-dark-border" />
        <KeyboardModeToggle />
      </div>
      <MetadataPanel />
    </div>
  );
};
