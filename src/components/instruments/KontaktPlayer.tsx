import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { notify } from '@stores/useNotificationStore';
import { useKontaktStore } from '@stores/useKontaktStore';

interface KeyboardKey {
  midi: number;
  label: string;
  isBlack: boolean;
  left: number;
}

const BLACK_NOTES = [1, 3, 6, 8, 10];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function buildKeyboard(): KeyboardKey[] {
  const keys: KeyboardKey[] = [];
  let whiteIndex = 0;

  for (let octave = 3; octave < 5; octave += 1) {
    for (let semitone = 0; semitone < 12; semitone += 1) {
      const midi = octave * 12 + semitone;
      const isBlack = BLACK_NOTES.includes(semitone);
      if (isBlack) {
        const blackOffsets: Record<number, number> = {
          1: whiteIndex - 0.32,
          3: whiteIndex - 0.32,
          6: whiteIndex - 0.32,
          8: whiteIndex - 0.32,
          10: whiteIndex - 0.32,
        };
        keys.push({
          midi,
          label: NOTE_NAMES[semitone],
          isBlack: true,
          left: blackOffsets[semitone] ?? whiteIndex,
        });
        continue;
      }

      keys.push({
        midi,
        label: `${NOTE_NAMES[semitone]}${octave}`,
        isBlack: false,
        left: whiteIndex,
      });
      whiteIndex += 1;
    }
  }

  return keys;
}

const KEYBOARD = buildKeyboard();
const WHITE_KEYS = KEYBOARD.filter((key) => !key.isBlack);
const BLACK_KEYS_RENDER = KEYBOARD.filter((key) => key.isBlack);

export const KontaktPlayer: React.FC = () => {
  const {
    bridgeStatus,
    currentPreset,
    error,
    sampleRate,
    volume,
    connect,
    disconnect,
    noteOn,
    noteOff,
    setVolume,
    requestStatus,
  } = useKontaktStore();

  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const activeNotesRef = useRef<number[]>([]);

  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);

  const isReady = bridgeStatus === 'ready';

  const statusBadgeClass = useMemo(() => {
    if (isReady) {
      return 'bg-accent-success/15 text-accent-success border border-accent-success/30';
    }
    if (bridgeStatus === 'connecting') {
      return 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30';
    }
    return 'bg-accent-error/15 text-accent-error border border-accent-error/30';
  }, [bridgeStatus, isReady]);

  const releaseAll = useCallback(() => {
    const notes = activeNotesRef.current;
    for (const midi of notes) {
      noteOff(midi);
    }
    setActiveNotes([]);
  }, [noteOff]);

  useEffect(() => {
    window.addEventListener('mouseup', releaseAll);
    window.addEventListener('touchend', releaseAll);
    return () => {
      window.removeEventListener('mouseup', releaseAll);
      window.removeEventListener('touchend', releaseAll);
    };
  }, [releaseAll]);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
      requestStatus();
      notify.success('Kontakt bridge connected');
    } catch (connectError) {
      notify.error(connectError instanceof Error ? connectError.message : 'Kontakt bridge connection failed');
    }
  }, [connect, requestStatus]);

  const handleDisconnect = useCallback(() => {
    releaseAll();
    disconnect();
  }, [disconnect, releaseAll]);

  const handleKeyDown = useCallback((midi: number) => {
    if (!isReady) {
      notify.warning('Bridge not running');
      return;
    }

    if (activeNotesRef.current.includes(midi)) {
      return;
    }

    noteOn(midi, 100, 0);
    setActiveNotes((prev) => [...prev, midi]);
  }, [isReady, noteOn]);

  const handleKeyUp = useCallback((midi: number) => {
    noteOff(midi, 0);
    setActiveNotes((prev) => prev.filter((note) => note !== midi));
  }, [noteOff]);

  return (
    <div className="h-full flex flex-col bg-dark-bg text-text-primary">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-dark-border bg-dark-bgSecondary">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-accent-primary">Kontakt Bridge</div>
          <div className="text-[9px] text-text-muted">Native bridge on ws://localhost:4009</div>
        </div>
        <span className={`text-[9px] font-mono px-2 py-1 rounded ${statusBadgeClass}`}>
          {isReady ? 'Bridge Connected' : bridgeStatus === 'connecting' ? 'Bridge Connecting' : 'Bridge Disconnected'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="bg-dark-bgSecondary border border-dark-border rounded p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Current Preset</div>
              <div className="text-[12px] text-text-primary truncate">
                {currentPreset ?? 'No preset loaded'}
              </div>
              <div className="text-[9px] text-text-muted">{sampleRate} Hz · Stereo</div>
            </div>
            <div className="flex gap-2">
              {isReady ? (
                <Button variant="danger" size="sm" onClick={handleDisconnect}>Disconnect</Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleConnect}>Connect</Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <Knob
                label="Volume"
                min={0}
                max={1}
                value={volume}
                onChange={setVolume}
                size="sm"
                formatValue={(value) => `${Math.round(value * 127)}`}
              />
            </div>
            <div className="text-[10px] text-text-secondary leading-relaxed">
              Sends MIDI Control Change 7 to Kontakt.
            </div>
          </div>

          {error && (
            <div className="rounded border border-accent-error/30 bg-accent-error/10 px-2 py-1.5 text-[10px] text-accent-error">
              {error}
            </div>
          )}
        </div>

        <div className="bg-dark-bgSecondary border border-dark-border rounded p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Keyboard</div>
          <div className="relative h-36 select-none overflow-hidden rounded border border-dark-border bg-dark-bg">
            <div className="absolute inset-0 flex">
              {WHITE_KEYS.map((key) => {
                const active = activeNotes.includes(key.midi);
                return (
                  <button
                    key={key.midi}
                    type="button"
                    className={[
                      'relative flex-1 border-r border-dark-borderLight last:border-r-0 text-[9px] font-mono text-text-muted',
                      active ? 'bg-accent-primary/20 text-accent-primary' : 'bg-dark-bgSecondary hover:bg-dark-bgHover',
                    ].join(' ')}
                    onMouseDown={() => handleKeyDown(key.midi)}
                    onMouseUp={() => handleKeyUp(key.midi)}
                    onMouseLeave={() => handleKeyUp(key.midi)}
                  >
                    <span className="absolute bottom-2 inset-x-0 text-center">{key.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="absolute inset-x-0 top-0 h-[58%] pointer-events-none">
              {BLACK_KEYS_RENDER.map((key) => {
                const active = activeNotes.includes(key.midi);
                return (
                  <button
                    key={key.midi}
                    type="button"
                    className={[
                      'absolute top-0 h-full w-[9%] rounded-b border border-dark-border pointer-events-auto text-[8px] font-mono',
                      active ? 'bg-accent-highlight/30 text-accent-highlight' : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover',
                    ].join(' ')}
                    style={{ left: `${(key.left / WHITE_KEYS.length) * 100}%` }}
                    onMouseDown={() => handleKeyDown(key.midi)}
                    onMouseUp={() => handleKeyUp(key.midi)}
                    onMouseLeave={() => handleKeyUp(key.midi)}
                  >
                    <span className="absolute bottom-2 inset-x-0 text-center">{key.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="text-[9px] text-text-muted">Two octaves from C3 to B4.</div>
        </div>

        {!isReady && (
          <div className="bg-dark-bgSecondary border border-dark-border rounded p-3 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Setup</div>
            <pre className="bg-dark-bgTertiary border border-dark-borderLight rounded p-2 text-[9px] font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap">
{`cd /Users/spot/Code/DEViLBOX/tools/kontakt-bridge
mkdir build && cd build
cmake .. && make
./kontakt-bridge`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
