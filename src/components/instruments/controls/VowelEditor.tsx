/**
 * VowelEditor - Clickable vowel grid + sequence strip for speech synths.
 *
 * Renders a grid of 14 vowel buttons (SAM phoneme codes) and a horizontal
 * strip showing the current sequence. Used by SAMControls, V2SpeechControls,
 * and ChipSynthControls for per-note vowel cycling in sing mode.
 */

import React from 'react';
import { useThemeStore } from '@stores';
import { X, Trash2, Repeat, Play } from 'lucide-react';

const VOWELS = [
  { code: 'IY', example: 'beet' },  { code: 'IH', example: 'bit' },
  { code: 'EH', example: 'bet' },   { code: 'AE', example: 'bat' },
  { code: 'AA', example: 'hot' },   { code: 'AH', example: 'but' },
  { code: 'AO', example: 'bought' },{ code: 'OH', example: 'bone' },
  { code: 'UH', example: 'book' },  { code: 'UW', example: 'boot' },
  { code: 'RR', example: 'bird' },  { code: 'LL', example: 'lull' },
  { code: 'WW', example: 'we' },    { code: 'YY', example: 'yes' },
];

interface VowelEditorProps {
  vowelSequence: string[];
  loopSingle: boolean;
  onChange: (sequence: string[]) => void;
  onLoopToggle: (loop: boolean) => void;
  accentColor?: string;
}

export const VowelEditor: React.FC<VowelEditorProps> = ({
  vowelSequence,
  loopSingle,
  onChange,
  onLoopToggle,
  accentColor,
}) => {
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const color = accentColor ?? (isCyanTheme ? '#00ffff' : '#ffcc33');
  const panelBorder = isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255,255,255,0.08)';
  const mutedColor = isCyanTheme ? '#006060' : '#94a3b8';
  const bgColor = isCyanTheme ? 'rgba(0, 20, 20, 0.4)' : 'rgba(0,0,0,0.3)';

  const addVowel = (code: string) => {
    onChange([...vowelSequence, code]);
  };

  const removeAt = (index: number) => {
    onChange(vowelSequence.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      background: bgColor,
      border: `1px solid ${panelBorder}`,
      borderRadius: 8,
      padding: '8px 10px',
    }}>
      {/* Header */}
      <span style={{
        fontSize: 10, fontWeight: 700,
        color, textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        Vowel Sequence
      </span>

      {/* Vowel Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 3,
      }}>
        {VOWELS.map(v => (
          <button
            key={v.code}
            onClick={() => addVowel(v.code)}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px 2px',
              borderRadius: 4,
              border: `1px solid ${panelBorder}`,
              background: isCyanTheme ? '#041010' : '#0d1117',
              cursor: 'pointer',
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${color}22`;
              e.currentTarget.style.borderColor = `${color}66`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isCyanTheme ? '#041010' : '#0d1117';
              e.currentTarget.style.borderColor = panelBorder;
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'Monaco, Menlo, monospace' }}>
              {v.code}
            </span>
            <span style={{ fontSize: 7, color: mutedColor, textTransform: 'uppercase' }}>
              {v.example}
            </span>
          </button>
        ))}
      </div>

      {/* Sequence Strip */}
      {vowelSequence.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          overflowX: 'auto',
          paddingBottom: 2,
        }}>
          <div style={{
            display: 'flex', gap: 3, flex: '1 1 0', minWidth: 0,
            overflowX: 'auto',
          }}>
            {vowelSequence.map((code, i) => (
              <div
                key={`${code}-${i}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  padding: '2px 6px',
                  borderRadius: 10,
                  background: `${color}22`,
                  border: `1px solid ${color}44`,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color, fontFamily: 'Monaco, Menlo, monospace' }}>
                  {code}
                </span>
                <button
                  onClick={() => removeAt(i)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 12, height: 12, borderRadius: 6,
                    background: 'transparent',
                    border: 'none', cursor: 'pointer',
                    color: mutedColor,
                    padding: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4444'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = mutedColor; }}
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={clearAll}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '3px 6px',
              borderRadius: 4,
              background: 'transparent',
              border: `1px solid ${panelBorder}`,
              cursor: 'pointer',
              color: mutedColor,
              flexShrink: 0,
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ff4444';
              e.currentTarget.style.borderColor = '#ff444444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = mutedColor;
              e.currentTarget.style.borderColor = panelBorder;
            }}
            title="Clear all"
          >
            <Trash2 size={10} />
          </button>
        </div>
      )}

      {vowelSequence.length === 0 && (
        <div style={{ fontSize: 9, color: mutedColor, textAlign: 'center', padding: '2px 0' }}>
          Click vowels above to build a sequence. Each tracker note cycles to the next vowel.
        </div>
      )}

      {/* Sustain Mode Toggle - prominent, full-width */}
      <div
        onClick={() => onLoopToggle(!loopSingle)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid ${loopSingle ? `${color}44` : panelBorder}`,
          background: loopSingle ? `${color}12` : 'transparent',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {loopSingle
          ? <Repeat size={14} style={{ color, flexShrink: 0 }} />
          : <Play size={14} style={{ color: mutedColor, flexShrink: 0 }} />
        }
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: loopSingle ? color : mutedColor, textTransform: 'uppercase' }}>
            {loopSingle ? 'Sustain / Loop' : 'One-Shot'}
          </span>
          <span style={{ fontSize: 8, color: mutedColor }}>
            {loopSingle
              ? 'Vowel loops while note is held'
              : 'Vowel plays once per note trigger'}
          </span>
        </div>
        {/* Toggle switch */}
        <div style={{
          width: 40, height: 20, borderRadius: 10,
          background: loopSingle ? color : (isCyanTheme ? '#0a1a1a' : '#334155'),
          border: `1px solid ${loopSingle ? color : panelBorder}`,
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: 8,
            background: isCyanTheme ? '#030808' : '#fff',
            position: 'absolute', top: 1,
            left: loopSingle ? 21 : 2,
            transition: 'left 0.2s',
            boxShadow: loopSingle ? `0 0 6px ${color}` : 'none',
          }} />
        </div>
      </div>
    </div>
  );
};
