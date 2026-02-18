/**
 * LinkSyncPanel - Ableton Link-style sync control
 *
 * UI for controlling tempo synchronization with DAWs via MIDI Clock.
 * Shows connection status, BPM, and transport controls.
 */

import React, { useEffect, useState } from 'react';
import { getAbletonLink, type LinkState } from '@lib/sync/abletonLink';
import { Radio, Play, Square, Users, Wifi, WifiOff } from 'lucide-react';

interface LinkSyncPanelProps {
  onBPMChange?: (bpm: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export const LinkSyncPanel: React.FC<LinkSyncPanelProps> = ({
  onBPMChange,
  onPlayStateChange,
}) => {
  const [linkState, setLinkState] = useState<LinkState>({
    bpm: 120,
    isPlaying: false,
    beatPosition: 0,
    barPosition: 0,
    quantum: 4,
    phase: 0,
    peers: [],
  });
  const [isEnabled, setIsEnabled] = useState(false);
  const [midiAvailable, setMidiAvailable] = useState(false);

  useEffect(() => {
    // Check if Web MIDI is available
    setMidiAvailable('requestMIDIAccess' in navigator);

    if (!isEnabled) return;

    const link = getAbletonLink();

    // Subscribe to Link state changes
    const unsubscribe = link.subscribe((state) => {
      setLinkState(state);

      // Notify parent components
      if (onBPMChange && state.bpm !== linkState.bpm) {
        onBPMChange(state.bpm);
      }
      if (onPlayStateChange && state.isPlaying !== linkState.isPlaying) {
        onPlayStateChange(state.isPlaying);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isEnabled, onBPMChange, onPlayStateChange]);

  const handleEnableToggle = () => {
    setIsEnabled(!isEnabled);
  };

  const handleBPMChange = (bpm: number) => {
    const link = getAbletonLink();
    link.setBPM(bpm);
  };

  const handlePlayToggle = () => {
    const link = getAbletonLink();
    if (linkState.isPlaying) {
      link.stop();
    } else {
      link.start();
    }
  };

  const handleBeatAlign = () => {
    const link = getAbletonLink();
    link.forceBeatAlign();
  };

  return (
    <div className="bg-ft2-bg border border-ft2-border rounded p-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-ft2-highlight" />
          <span className="text-ft2-text font-bold text-xs">LINK SYNC</span>
        </div>

        {/* Enable Toggle */}
        <button
          onClick={handleEnableToggle}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition-colors ${
            isEnabled
              ? 'bg-ft2-highlight text-ft2-bg'
              : 'bg-ft2-bgSecondary text-ft2-textDim border border-ft2-border'
          }`}
          title={midiAvailable ? 'Toggle Link Sync' : 'Web MIDI not available'}
          disabled={!midiAvailable}
        >
          {isEnabled ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {!midiAvailable && (
        <div className="text-xs text-ft2-textDim mb-3 p-2 bg-ft2-bgSecondary rounded border border-ft2-border">
          ⚠️ Web MIDI not available in this browser
        </div>
      )}

      {isEnabled && (
        <>
          {/* Status */}
          <div className="flex items-center gap-4 mb-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  linkState.isPlaying ? 'bg-green-500 animate-pulse' : 'bg-ft2-textDim'
                }`}
              />
              <span className="text-ft2-textDim">
                {linkState.isPlaying ? 'Playing' : 'Stopped'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-ft2-textDim" />
              <span className="text-ft2-textDim">{linkState.peers.length} peers</span>
            </div>
          </div>

          {/* BPM Control */}
          <div className="mb-3">
            <label className="text-ft2-textDim text-xs mb-1 block">TEMPO</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="20"
                max="999"
                value={Math.round(linkState.bpm * 10) / 10}
                onChange={(e) => handleBPMChange(Number(e.target.value))}
                className="flex-1 bg-ft2-header border border-ft2-border px-3 py-1.5 text-ft2-text text-sm font-bold rounded outline-none focus:border-ft2-highlight"
              />
              <span className="text-ft2-textDim text-xs font-bold">BPM</span>
            </div>
          </div>

          {/* Position Display */}
          <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-ft2-header border border-ft2-border rounded p-2 text-center">
              <div className="text-ft2-textDim text-[10px] mb-1">BAR</div>
              <div className="text-ft2-text font-bold">{linkState.barPosition + 1}</div>
            </div>
            <div className="bg-ft2-header border border-ft2-border rounded p-2 text-center">
              <div className="text-ft2-textDim text-[10px] mb-1">BEAT</div>
              <div className="text-ft2-text font-bold">
                {(linkState.beatPosition % linkState.quantum) + 1}
              </div>
            </div>
            <div className="bg-ft2-header border border-ft2-border rounded p-2 text-center">
              <div className="text-ft2-textDim text-[10px] mb-1">PHASE</div>
              <div className="text-ft2-text font-bold">
                {(linkState.phase * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex gap-2">
            <button
              onClick={handlePlayToggle}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded font-bold text-xs transition-colors ${
                linkState.isPlaying
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {linkState.isPlaying ? (
                <>
                  <Square size={14} fill="currentColor" />
                  STOP
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  PLAY
                </>
              )}
            </button>

            <button
              onClick={handleBeatAlign}
              className="px-3 py-2 bg-ft2-header border border-ft2-border hover:border-ft2-highlight text-ft2-text rounded font-bold text-xs transition-colors"
              title="Align to beat boundary"
            >
              ALIGN
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-3 text-[10px] text-ft2-textDim p-2 bg-ft2-bgSecondary rounded border border-ft2-border">
            <p className="mb-1">💡 <strong>How to use:</strong></p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li>Enable Link Sync to send/receive MIDI Clock</li>
              <li>Configure MIDI devices in your OS settings</li>
              <li>Link syncs with DAWs via MIDI Clock (24 ppqn)</li>
              <li>BPM auto-detects from incoming MIDI Clock</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};
