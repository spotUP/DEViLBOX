/**
 * VL-1 Hardware UI — Casio VL-Tone (1981)
 *
 * A retro-styled React component mimicking the physical VL-1's appearance:
 * silver body, orange buttons, calculator keys, speaker grille, LCD display.
 *
 * Most famous for "Da Da Da" by Trio (1982).
 */

import React, { useCallback, useRef, useEffect, useMemo } from 'react';

interface VL1HardwareProps {
  parameters: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
}

// ── Color palette ────────────────────────────────────────────────────────────

const COLORS = {
  body: '#C0C0C0',
  bodyDark: '#A8A8A8',
  bodyBorder: '#888',
  lcd: '#B8C890',
  lcdText: '#2A3020',
  lcdBorder: '#707860',
  orange: '#E86420',
  orangeHover: '#F07830',
  orangeActive: '#D05818',
  orangeText: '#FFF',
  grayKey: '#E0E0E0',
  grayKeyHover: '#EAEAEA',
  grayKeyActive: '#CCC',
  grayKeyBorder: '#999',
  blackKey: '#333',
  blackKeyHover: '#444',
  blackKeyActive: '#222',
  blackKeyText: '#FFF',
  whiteKey: '#F8F8F0',
  whiteKeyHover: '#FFF',
  whiteKeyActive: '#DDD',
  whiteKeyBorder: '#AAA',
  labelText: '#444',
  speakerDot: '#999',
  speakerBg: '#B0B0B0',
  redLed: '#FF2200',
  darkText: '#222',
};

// ── Sound names (matching VL1 hardware labels) ───────────────────────────────

const SOUND_NAMES = [
  'Piano', 'Fantasy', 'Violin', 'Flute', 'Guitar',
  'Guitar 2', 'Eng.Horn', 'E.Piano', 'E.Fantasy', 'E.Violin',
];

const RHYTHM_NAMES = [
  'March', 'Waltz', 'Swing', '4 Beat', 'Rock 1',
  'Rock 2', 'Bossa', 'Samba', 'Rhumba', 'Beguine',
];

const ADSR_PARAMS = ['attack', 'decay', 'sustainLevel', 'sustainTime', 'release'] as const;

// ── Tiny VL-1 style button ───────────────────────────────────────────────────

const VL1Button: React.FC<{
  label: string;
  active?: boolean;
  color?: 'orange' | 'gray' | 'black';
  onClick?: () => void;
  small?: boolean;
}> = ({ label, active, color = 'gray', onClick, small }) => {
  const bg = color === 'orange'
    ? (active ? COLORS.orangeActive : COLORS.orange)
    : color === 'black'
      ? (active ? COLORS.blackKeyActive : COLORS.blackKey)
      : (active ? COLORS.grayKeyActive : COLORS.grayKey);
  const hoverBg = color === 'orange' ? COLORS.orangeHover
    : color === 'black' ? COLORS.blackKeyHover : COLORS.grayKeyHover;
  const textColor = (color === 'orange' || color === 'black') ? COLORS.orangeText : COLORS.darkText;
  const border = color === 'gray' ? COLORS.grayKeyBorder : 'transparent';

  return (
    <button
      onClick={onClick}
      style={{
        background: bg,
        color: textColor,
        border: `1px solid ${border}`,
        borderRadius: 3,
        padding: small ? '2px 6px' : '4px 10px',
        fontSize: small ? 9 : 10,
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontWeight: 'bold',
        cursor: 'pointer',
        minWidth: small ? 36 : 48,
        textAlign: 'center',
        boxShadow: active
          ? 'inset 0 1px 3px rgba(0,0,0,0.4)'
          : '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'all 0.1s ease',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = hoverBg; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = bg; }}
    >
      {label}
    </button>
  );
};

// ── ADSR Slider (vertical, VL-1 style with 0-9 markings) ────────────────────

const ADSRSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{
        fontSize: 8, fontWeight: 'bold', color: COLORS.labelText,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </div>
      <div style={{
        position: 'relative', width: 28, height: 80,
        background: COLORS.bodyDark, borderRadius: 3,
        border: `1px solid ${COLORS.bodyBorder}`,
      }}>
        {/* Tick marks */}
        {[0, 0.5, 1].map((t) => (
          <div key={t} style={{
            position: 'absolute', right: 2, top: `${(1 - t) * 85 + 5}%`,
            fontSize: 6, color: COLORS.labelText, transform: 'translateY(-50%)',
          }}>
            {Math.round(t * 9)}
          </div>
        ))}
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: 'absolute', left: 0, top: 0,
            width: 80, height: 28,
            transform: 'rotate(-90deg) translateX(-80px)',
            transformOrigin: 'top left',
            cursor: 'pointer',
            accentColor: COLORS.orange,
          }}
          title={`${label}: ${Math.round(value * 9)}`}
        />
      </div>
    </div>
  );
};

// ── Speaker Grille ───────────────────────────────────────────────────────────

const SpeakerGrille: React.FC = () => {
  const dots = useMemo(() => {
    const result: { x: number; y: number }[] = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 8; col++) {
        result.push({ x: col * 8 + 4, y: row * 8 + 4 });
      }
    }
    return result;
  }, []);

  return (
    <div style={{
      width: 70, height: 52, background: COLORS.speakerBg,
      borderRadius: 4, border: `1px solid ${COLORS.bodyBorder}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <svg width="70" height="52" viewBox="0 0 70 52">
        {dots.map((d, i) => (
          <circle key={i} cx={d.x + 3} cy={d.y + 2} r={2} fill={COLORS.speakerDot} />
        ))}
      </svg>
    </div>
  );
};

// ── LCD Display ──────────────────────────────────────────────────────────────

const LCDDisplay: React.FC<{ soundIndex: number; rhythmOn: boolean; rhythmIndex: number }> = ({
  soundIndex, rhythmOn, rhythmIndex,
}) => {
  const soundName = SOUND_NAMES[soundIndex] || 'ADSR';
  const rhythmName = rhythmOn ? RHYTHM_NAMES[rhythmIndex] || '---' : '---';

  return (
    <div style={{
      background: COLORS.lcd,
      border: `2px solid ${COLORS.lcdBorder}`,
      borderRadius: 4,
      padding: '6px 12px',
      fontFamily: '"Courier New", monospace',
      fontSize: 12,
      color: COLORS.lcdText,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      minWidth: 200,
      gap: 16,
      boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.15)',
    }}>
      <div>
        <div style={{ fontSize: 7, opacity: 0.6 }}>SOUND</div>
        <div style={{ fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>{soundName}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 7, opacity: 0.6 }}>RHYTHM</div>
        <div style={{ fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>{rhythmName}</div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

const VL1Hardware: React.FC<VL1HardwareProps> = ({ parameters, onParamChange }) => {
  const paramsRef = useRef(parameters);
  useEffect(() => { paramsRef.current = parameters; }, [parameters]);

  const update = useCallback((key: string, value: number) => {
    onParamChange(key, value);
  }, [onParamChange]);

  const soundIndex = Math.round((parameters.sound ?? 0) * 10);
  const rhythmIndex = Math.round((parameters.rhythm ?? 0) * 9);
  const rhythmOn = (parameters.rhythmOn ?? 0) > 0.5;
  const octaveVal = Math.round((parameters.octave ?? 0.5) * 2);

  return (
    <div style={{
      background: `linear-gradient(180deg, ${COLORS.body} 0%, ${COLORS.bodyDark} 100%)`,
      border: `2px solid ${COLORS.bodyBorder}`,
      borderRadius: 8,
      padding: 16,
      maxWidth: 640,
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)',
      userSelect: 'none',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SpeakerGrille />
          <div>
            <div style={{
              fontSize: 8, fontWeight: 'bold', color: COLORS.labelText,
              letterSpacing: 2, textTransform: 'uppercase',
            }}>
              CASIO
            </div>
            <div style={{
              fontSize: 18, fontWeight: 'bold', color: COLORS.darkText,
              letterSpacing: 3, fontFamily: '"Courier New", monospace',
            }}>
              VL-TONE
            </div>
            <div style={{
              fontSize: 7, color: COLORS.labelText, letterSpacing: 1,
            }}>
              VL-1
            </div>
          </div>
        </div>
        <LCDDisplay soundIndex={soundIndex} rhythmOn={rhythmOn} rhythmIndex={rhythmIndex} />
      </div>

      {/* ── Sound Select Row ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 8, fontWeight: 'bold', color: COLORS.labelText,
          marginBottom: 4, letterSpacing: 1,
        }}>
          SOUND SELECT
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {SOUND_NAMES.map((name, i) => (
            <VL1Button
              key={name}
              label={name}
              active={soundIndex === i}
              color={i >= 7 ? 'orange' : 'gray'}
              small
              onClick={() => update('sound', i / 10)}
            />
          ))}
        </div>
      </div>

      {/* ── ADSR + Controls Row ── */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 10, alignItems: 'flex-end',
      }}>
        {/* ADSR Sliders */}
        <div>
          <div style={{
            fontSize: 8, fontWeight: 'bold', color: COLORS.orange,
            marginBottom: 4, letterSpacing: 1,
          }}>
            A D S L   S T   R
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ADSR_PARAMS.map((p) => (
              <ADSRSlider
                key={p}
                label={p === 'sustainLevel' ? 'SL' : p === 'sustainTime' ? 'ST' : p[0].toUpperCase()}
                value={parameters[p] ?? 0}
                onChange={(v) => update(p, v)}
              />
            ))}
          </div>
        </div>

        {/* Vibrato / Tremolo */}
        <div style={{ display: 'flex', gap: 6 }}>
          <ADSRSlider
            label="VIB"
            value={parameters.vibrato ?? 0}
            onChange={(v) => update('vibrato', v)}
          />
          <ADSRSlider
            label="TREM"
            value={parameters.tremolo ?? 0}
            onChange={(v) => update('tremolo', v)}
          />
        </div>

        {/* Octave */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{
            fontSize: 8, fontWeight: 'bold', color: COLORS.labelText,
            letterSpacing: 1,
          }}>
            OCTAVE
          </div>
          {['LOW', 'MID', 'HIGH'].map((name, i) => (
            <VL1Button
              key={name}
              label={name}
              active={octaveVal === i}
              color={octaveVal === i ? 'orange' : 'gray'}
              small
              onClick={() => update('octave', i / 2)}
            />
          ))}
        </div>

        {/* Tune + Volume + Balance */}
        <div style={{ display: 'flex', gap: 6 }}>
          <ADSRSlider
            label="TUNE"
            value={parameters.tune ?? 0.5}
            onChange={(v) => update('tune', v)}
          />
          <ADSRSlider
            label="VOL"
            value={parameters.volume ?? 0.7}
            onChange={(v) => update('volume', v)}
          />
          <ADSRSlider
            label="BAL"
            value={parameters.balance ?? 0.5}
            onChange={(v) => update('balance', v)}
          />
        </div>
      </div>

      {/* ── Rhythm Section ── */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 8,
      }}>
        <div>
          <div style={{
            fontSize: 8, fontWeight: 'bold', color: COLORS.labelText,
            marginBottom: 4, letterSpacing: 1,
          }}>
            RHYTHM
          </div>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 400 }}>
            {RHYTHM_NAMES.map((name, i) => (
              <VL1Button
                key={name}
                label={name}
                active={rhythmOn && rhythmIndex === i}
                color={rhythmOn && rhythmIndex === i ? 'orange' : 'gray'}
                small
                onClick={() => {
                  update('rhythm', i / 9);
                  if (!rhythmOn) update('rhythmOn', 1);
                }}
              />
            ))}
          </div>
        </div>

        {/* Rhythm On/Off */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <VL1Button
            label={rhythmOn ? '■ STOP' : '▶ START'}
            active={rhythmOn}
            color={rhythmOn ? 'orange' : 'black'}
            onClick={() => update('rhythmOn', rhythmOn ? 0 : 1)}
          />
          <ADSRSlider
            label="TEMPO"
            value={parameters.tempo ?? 0.5}
            onChange={(v) => update('tempo', v)}
          />
        </div>

        {/* Red power LED */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: COLORS.redLed,
          boxShadow: `0 0 6px ${COLORS.redLed}`,
          marginBottom: 4,
        }} />
      </div>
    </div>
  );
};

export default VL1Hardware;
