/**
 * TestKeyboard - On-screen piano keyboard for testing sounds
 * Responsive full-width design that shows as many octaves as fit
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Music } from 'lucide-react';
import type { InstrumentConfig } from '../../types/instrument';
import { ToneEngine } from '../../engine/ToneEngine';

interface TestKeyboardProps {
  instrument: InstrumentConfig;
}

interface Key {
  note: string;
  label: string;
  isBlack: boolean;
  keyboardKey?: string;
  octave: number;
}

// Note names in an octave
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// FastTracker II keyboard layout mapping (2 octaves worth of keys)
const FT2_KEYBOARD_MAP: Record<string, string> = {
  // Lower octave row (Z-M)
  'z': 'C', 's': 'C#', 'x': 'D', 'd': 'D#', 'c': 'E',
  'v': 'F', 'g': 'F#', 'b': 'G', 'h': 'G#', 'n': 'A', 'j': 'A#', 'm': 'B',
  // Upper octave row (Q-I)
  'q': 'C+', '2': 'C#+', 'w': 'D+', '3': 'D#+', 'e': 'E+',
  'r': 'F+', '5': 'F#+', 't': 'G+', '6': 'G#+', 'y': 'A+', '7': 'A#+', 'u': 'B+',
  'i': 'C++',
};

// Generate keys for a given range of octaves
function generateKeys(startOctave: number, numOctaves: number): Key[] {
  const keys: Key[] = [];

  // Keyboard mapping - we map to octaves 3 and 4 by default
  const keyboardOctaveOffset = startOctave <= 3 ? 3 - startOctave : 0;

  for (let oct = 0; oct < numOctaves; oct++) {
    const octave = startOctave + oct;
    for (const noteName of NOTE_NAMES) {
      const isBlack = noteName.includes('#');
      const note = `${noteName}${octave}`;

      // Find keyboard mapping
      let keyboardKey: string | undefined;
      const mappedOctave = oct - keyboardOctaveOffset;
      if (mappedOctave === 0) {
        // Lower octave keys
        const entry = Object.entries(FT2_KEYBOARD_MAP).find(([_, v]) => v === noteName);
        if (entry) keyboardKey = entry[0];
      } else if (mappedOctave === 1) {
        // Upper octave keys
        const entry = Object.entries(FT2_KEYBOARD_MAP).find(([_, v]) => v === noteName + '+');
        if (entry) keyboardKey = entry[0];
      } else if (mappedOctave === 2 && noteName === 'C') {
        // Top C
        keyboardKey = 'i';
      }

      keys.push({
        note,
        label: noteName.replace('#', ''),
        isBlack,
        keyboardKey,
        octave,
      });
    }
  }

  // Add final C of the last octave
  const lastOctave = startOctave + numOctaves;
  keys.push({
    note: `C${lastOctave}`,
    label: 'C',
    isBlack: false,
    keyboardKey: numOctaves <= 2 ? 'i' : undefined,
    octave: lastOctave,
  });

  return keys;
}

// Set of keyboard keys used for piano
const ALL_PIANO_KEYS = new Set(Object.keys(FT2_KEYBOARD_MAP));

// Minimum white key width in pixels
const MIN_WHITE_KEY_WIDTH = 24;
const MAX_WHITE_KEY_WIDTH = 40;
const WHITE_KEYS_PER_OCTAVE = 7;

export const TestKeyboard: React.FC<TestKeyboardProps> = ({ instrument }) => {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [containerWidth, setContainerWidth] = useState(400);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(ToneEngine.getInstance());
  const activeNotesRef = useRef<Set<string>>(new Set());
  const instrumentRef = useRef(instrument);
  const isInitializedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    instrumentRef.current = instrument;
  }, [instrument]);

  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);

  // ResizeObserver for responsive width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width - 24; // Account for padding
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Calculate number of octaves that fit
  const { numOctaves, whiteKeyWidth, keys } = useMemo(() => {
    // Calculate how many octaves fit
    // Each octave has 7 white keys, plus we need 1 extra for the final C
    const availableWidth = containerWidth - 8; // Some margin

    // Start with max octaves and work down
    let octaves = 6; // Max 6 octaves (C1-C7)
    let keyWidth = MAX_WHITE_KEY_WIDTH;

    while (octaves >= 2) {
      const totalWhiteKeys = octaves * WHITE_KEYS_PER_OCTAVE + 1;
      keyWidth = availableWidth / totalWhiteKeys;

      if (keyWidth >= MIN_WHITE_KEY_WIDTH) {
        // This many octaves fit with acceptable key size
        keyWidth = Math.min(keyWidth, MAX_WHITE_KEY_WIDTH);
        break;
      }
      octaves--;
    }

    // Ensure minimum of 2 octaves
    octaves = Math.max(2, octaves);
    const totalWhiteKeys = octaves * WHITE_KEYS_PER_OCTAVE + 1;
    keyWidth = Math.min(availableWidth / totalWhiteKeys, MAX_WHITE_KEY_WIDTH);

    // Center octaves around middle C (C4)
    // For 2 octaves: C3-C5, for 4 octaves: C2-C6, etc.
    const startOctave = Math.max(1, 4 - Math.floor(octaves / 2));

    return {
      numOctaves: octaves,
      whiteKeyWidth: keyWidth,
      keys: generateKeys(startOctave, octaves),
    };
  }, [containerWidth]);

  // Initialize engine once
  useEffect(() => {
    if (!isInitializedRef.current) {
      engineRef.current.init().then(() => {
        isInitializedRef.current = true;
      });
    }
  }, []);

  // Attack note - starts playing and sustains until release
  const attackNote = useCallback((note: string) => {
    // Don't retrigger if already playing
    if (activeNotesRef.current.has(note)) return;

    const engine = engineRef.current;
    const inst = instrument;

    engine.triggerNoteAttack(inst.id, note, 0, 0.8, inst);
    setActiveNotes((prev) => new Set(prev).add(note));
  }, [instrument]);

  // Release note - stops the sustained note
  const releaseNote = useCallback((note: string) => {
    const engine = engineRef.current;
    const inst = instrument;

    engine.triggerNoteRelease(inst.id, note, 0, inst);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
  }, [instrument]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.repeat) return;

      const keyLower = e.key.toLowerCase();

      if (ALL_PIANO_KEYS.has(keyLower)) {
        e.preventDefault();
        e.stopPropagation();

        const key = keys.find((k) => k.keyboardKey === keyLower);
        if (key) {
          attackNote(key.note);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();

      if (ALL_PIANO_KEYS.has(keyLower)) {
        e.preventDefault();
        e.stopPropagation();

        const key = keys.find((k) => k.keyboardKey === keyLower);
        if (key) {
          releaseNote(key.note);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [attackNote, releaseNote, keys]);

  // Separate white and black keys
  const whiteKeys = keys.filter((k) => !k.isBlack);
  const blackKeys = keys.filter((k) => k.isBlack);

  // Calculate black key positioning
  const getBlackKeyPosition = (key: Key) => {
    const keyIndex = keys.findIndex((k) => k.note === key.note);
    const whiteKeysBefore = keys.slice(0, keyIndex).filter((k) => !k.isBlack).length;
    // Position black key between white keys
    return whiteKeysBefore * whiteKeyWidth - (whiteKeyWidth * 0.3) / 2;
  };

  const blackKeyWidth = whiteKeyWidth * 0.6;
  const keyHeight = 96;
  const blackKeyHeight = keyHeight * 0.6;

  return (
    <div ref={containerRef} className="space-y-3 w-full">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-ft2-highlight">
          <Music size={16} />
          <span>TEST KEYBOARD</span>
        </div>
        <div className="text-xs text-ft2-textDim font-mono">
          {numOctaves} octaves · FT2 layout
        </div>
      </div>

      {/* Piano Keyboard */}
      <div className="bg-ft2-header rounded border-2 border-ft2-border p-3">
        <div
          className="relative flex items-end justify-center"
          style={{ height: keyHeight }}
        >
          <div className="relative flex">
            {/* White keys */}
            {whiteKeys.map((key, index) => {
              const isActive = activeNotes.has(key.note);
              const isOctaveStart = key.label === 'C';
              return (
                <button
                  key={key.note}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    attackNote(key.note);
                  }}
                  onMouseUp={(e) => {
                    e.preventDefault();
                    releaseNote(key.note);
                  }}
                  onMouseLeave={() => {
                    if (activeNotes.has(key.note)) releaseNote(key.note);
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    attackNote(key.note);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    releaseNote(key.note);
                  }}
                  className={`
                    relative border border-ft2-border rounded-b
                    transition-colors duration-75 cursor-pointer select-none touch-none
                    ${isActive
                      ? 'bg-cyan-400 shadow-lg shadow-cyan-400/50'
                      : 'bg-white hover:bg-gray-100'
                    }
                    ${isOctaveStart && index > 0 ? 'border-l-2 border-l-gray-300' : ''}
                  `}
                  style={{
                    width: whiteKeyWidth,
                    height: keyHeight,
                    marginRight: index < whiteKeys.length - 1 ? 1 : 0,
                  }}
                >
                  <div className="absolute bottom-1 left-0 right-0 text-center">
                    {isOctaveStart && (
                      <div className="text-[8px] text-gray-400 font-mono">{key.octave}</div>
                    )}
                    <div
                      className="font-bold text-gray-700"
                      style={{ fontSize: whiteKeyWidth < 30 ? '8px' : '10px' }}
                    >
                      {key.label}
                    </div>
                    {key.keyboardKey && (
                      <div className="text-[8px] text-gray-400 font-mono uppercase">
                        {key.keyboardKey}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Black keys overlay */}
            {blackKeys.map((key) => {
              const isActive = activeNotes.has(key.note);
              const leftPosition = getBlackKeyPosition(key);

              return (
                <button
                  key={key.note}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    attackNote(key.note);
                  }}
                  onMouseUp={(e) => {
                    e.preventDefault();
                    releaseNote(key.note);
                  }}
                  onMouseLeave={() => {
                    if (activeNotes.has(key.note)) releaseNote(key.note);
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    attackNote(key.note);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    releaseNote(key.note);
                  }}
                  className={`
                    absolute border border-ft2-border rounded-b
                    transition-colors duration-75 cursor-pointer select-none touch-none z-10
                    ${isActive
                      ? 'bg-amber-500 shadow-lg shadow-amber-500/50'
                      : 'bg-gray-900 hover:bg-gray-700'
                    }
                  `}
                  style={{
                    left: leftPosition,
                    width: blackKeyWidth,
                    height: blackKeyHeight,
                  }}
                >
                  {key.keyboardKey && (
                    <div
                      className="absolute bottom-1 left-0 right-0 text-center text-gray-400 font-mono uppercase"
                      style={{ fontSize: '7px' }}
                    >
                      {key.keyboardKey}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Velocity Control */}
      <div className="flex items-center gap-3 bg-ft2-header rounded border border-ft2-border p-2">
        <span className="text-xs font-bold text-ft2-highlight">VELOCITY:</span>
        <input
          type="range"
          min="0"
          max="100"
          defaultValue="80"
          className="flex-1 h-1 bg-ft2-bg rounded-lg appearance-none cursor-pointer accent-ft2-cursor"
        />
        <span className="text-xs font-mono text-ft2-text">80%</span>
      </div>
    </div>
  );
};
