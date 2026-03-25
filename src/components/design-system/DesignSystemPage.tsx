/**
 * DesignSystemPage — Visual catalog of all DEViLBOX UI components.
 *
 * Access via: http://localhost:5173/#/design-system
 *
 * Organized from atomic components → composite panels → full views.
 * Shows both DOM and Pixi component variants side by side where applicable.
 */

import React, { useState, useRef, useEffect } from 'react';

// ── Section wrapper ──
const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <div style={{ marginBottom: 32, borderBottom: '1px solid #2a2a3a', paddingBottom: 24 }}>
    <h2 style={{ fontSize: 18, fontWeight: 'bold', color: '#e2e2e8', marginBottom: 4 }}>{title}</h2>
    {description && <p style={{ fontSize: 12, color: '#6b6b80', marginBottom: 12 }}>{description}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      {children}
    </div>
  </div>
);

const Card: React.FC<{ label: string; width?: number; height?: number; children: React.ReactNode }> = ({ label, width = 200, height, children }) => (
  <div style={{ background: '#1a1a24', border: '1px solid #2a2a3a', borderRadius: 6, padding: 12, width, minHeight: height }}>
    <div style={{ fontSize: 9, color: '#6b6b80', marginBottom: 8, fontFamily: '"JetBrains Mono", monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    {children}
  </div>
);

// ── Color Swatch ──
const Swatch: React.FC<{ color: string; name: string; hex: string }> = ({ color, name, hex }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
    <div style={{ width: 24, height: 24, borderRadius: 4, background: color, border: '1px solid #333' }} />
    <div>
      <div style={{ fontSize: 11, color: '#e2e2e8' }}>{name}</div>
      <div style={{ fontSize: 9, color: '#6b6b80', fontFamily: '"JetBrains Mono", monospace' }}>{hex}</div>
    </div>
  </div>
);

// ── Button samples ──
const BTN = 'px-3 py-1.5 text-xs font-mono border cursor-pointer transition-colors rounded';
const ButtonSample: React.FC<{ label: string; className: string }> = ({ label, className }) => (
  <button className={`${BTN} ${className}`}>{label}</button>
);

// ── Slider sample ──
const SliderSample: React.FC<{ label: string; color?: string }> = ({ label, color = '#6366f1' }) => {
  const [val, setVal] = useState(50);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, color: '#6b6b80', marginBottom: 2 }}>{label}: {val}</div>
      <input type="range" min={0} max={100} value={val} onChange={e => setVal(+e.target.value)} style={{ width: '100%', accentColor: color }} />
    </div>
  );
};

// ── ADSR mini canvas ──
const ADSRMini: React.FC<{ a: number; d: number; s: number; r: number; color: string; width?: number; height?: number }> = ({ a, d, s, r, color, width = 160, height = 50 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
    const DECAY_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
    const aT = ATTACK_MS[a] / 1000, dT = DECAY_MS[d] / 1000, sL = s / 15, rT = DECAY_MS[r] / 1000;
    const total = aT + dT + rT + 0.2;
    const tx = (t: number) => (t / total) * width;
    const ly = (l: number) => height * (1 - l);
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(tx(aT), 2);
    ctx.lineTo(tx(aT + dT), ly(sL));
    ctx.lineTo(tx(aT + dT + 0.2), ly(sL));
    ctx.lineTo(tx(total), height);
    ctx.closePath();
    ctx.fillStyle = color + '25';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(tx(aT), 2);
    ctx.lineTo(tx(aT + dT), ly(sL));
    ctx.lineTo(tx(aT + dT + 0.2), ly(sL));
    ctx.lineTo(tx(total), height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [a, d, s, r, color, width, height]);
  return <canvas ref={ref} width={width} height={height} style={{ width, height, borderRadius: 4, background: '#121218', border: '1px solid #2a2a3a' }} />;
};

// ── Main Page ──
export const DesignSystemPage: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#121218', color: '#e2e2e8', fontFamily: '"JetBrains Mono", "SF Mono", monospace', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 4 }}>DEViLBOX Design System</h1>
        <p style={{ fontSize: 12, color: '#6b6b80', marginBottom: 32 }}>Visual catalog of all UI components — DOM and Pixi renderers</p>

        {/* ─── 1. Colors ─── */}
        <Section title="Colors" description="Core palette used across all components">
          <Card label="Backgrounds" width={220}>
            <Swatch color="#121218" name="Background" hex="#121218" />
            <Swatch color="#1a1a24" name="Panel BG" hex="#1a1a24" />
            <Swatch color="#22222e" name="Surface" hex="#22222e" />
            <Swatch color="#2a2a3a" name="Border" hex="#2a2a3a" />
          </Card>
          <Card label="Accents" width={220}>
            <Swatch color="#6366f1" name="Primary (Indigo)" hex="#6366f1" />
            <Swatch color="#f59e0b" name="Warm (Amber)" hex="#f59e0b" />
            <Swatch color="#10b981" name="Success (Emerald)" hex="#10b981" />
            <Swatch color="#ef4444" name="Error (Red)" hex="#ef4444" />
          </Card>
          <Card label="Text" width={220}>
            <Swatch color="#e2e2e8" name="Primary" hex="#e2e2e8" />
            <Swatch color="#6b6b80" name="Secondary" hex="#6b6b80" />
            <Swatch color="#44445a" name="Muted" hex="#44445a" />
          </Card>
          <Card label="Channel Colors" width={220}>
            <Swatch color="#6366f1" name="CH1 (Indigo)" hex="#6366f1" />
            <Swatch color="#f59e0b" name="CH2 (Amber)" hex="#f59e0b" />
            <Swatch color="#10b981" name="CH3 (Emerald)" hex="#10b981" />
            <Swatch color="#ec4899" name="CH4 (Pink)" hex="#ec4899" />
            <Swatch color="#06b6d4" name="CH5 (Cyan)" hex="#06b6d4" />
            <Swatch color="#a855f7" name="CH6 (Purple)" hex="#a855f7" />
          </Card>
          <Card label="SID Table Colors" width={220}>
            <Swatch color="#60e060" name="Wave" hex="#60e060" />
            <Swatch color="#ff8866" name="Pulse" hex="#ff8866" />
            <Swatch color="#ffcc00" name="Filter" hex="#ffcc00" />
            <Swatch color="#6699ff" name="Speed" hex="#6699ff" />
          </Card>
          <Card label="FT2 Theme" width={220}>
            <Swatch color="var(--color-ft2-header, #1a1a2e)" name="FT2 Header" hex="var(--color-ft2-header)" />
            <Swatch color="var(--color-ft2-text, #c0c0c0)" name="FT2 Text" hex="var(--color-ft2-text)" />
            <Swatch color="var(--color-ft2-highlight, #ffcc00)" name="FT2 Highlight" hex="var(--color-ft2-highlight)" />
            <Swatch color="var(--color-ft2-border, #333)" name="FT2 Border" hex="var(--color-ft2-border)" />
          </Card>
        </Section>

        {/* ─── 2. Typography ─── */}
        <Section title="Typography" description="Monospace font system">
          <Card label="Font Sizes" width={300}>
            <div style={{ fontSize: 8, color: '#e2e2e8', marginBottom: 4 }}>8px — Micro labels, table tooltips</div>
            <div style={{ fontSize: 9, color: '#e2e2e8', marginBottom: 4 }}>9px — Bottom tabs, preset categories</div>
            <div style={{ fontSize: 10, color: '#e2e2e8', marginBottom: 4 }}>10px — Toolbar items, panel labels</div>
            <div style={{ fontSize: 11, color: '#e2e2e8', marginBottom: 4 }}>11px — Main UI text, song name</div>
            <div style={{ fontSize: 13, color: '#e2e2e8', marginBottom: 4 }}>13px — Headers, status messages</div>
          </Card>
          <Card label="Font Weights" width={300}>
            <div style={{ fontSize: 11, fontWeight: 'normal', color: '#e2e2e8', marginBottom: 4 }}>Normal — Body text, values</div>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#e2e2e8', marginBottom: 4 }}>Bold — Headers, active items</div>
          </Card>
        </Section>

        {/* ─── 3. Atomic Components ─── */}
        <Section title="Buttons" description="DOM button styles (Tailwind classes)">
          <Card label="FT2 Style" width={300}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <ButtonSample label="Default" className="bg-ft2-header text-ft2-textDim border-ft2-border hover:bg-ft2-border" />
              <ButtonSample label="Active" className="bg-indigo-600/30 text-indigo-300 border-indigo-500/50 font-bold" />
              <ButtonSample label="Record" className="bg-red-500 text-white border-transparent font-bold" />
              <ButtonSample label="Jam" className="bg-amber-600/30 text-amber-400 border-amber-500/50" />
              <ButtonSample label="Success" className="bg-emerald-600/20 text-emerald-400 border-emerald-500/50 font-bold" />
            </div>
          </Card>
          <Card label="DAW Style" width={300}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['[play]', '[stop]', '[REC]', '[FOLLOW]', '[SIDE]', '[PRO]', '[DAW]'].map(label => (
                <span key={label} style={{ padding: '2px 6px', fontSize: 10, fontFamily: 'inherit', color: label.includes('REC') ? '#ef4444' : label === label.toUpperCase() ? '#6366f1' : '#44445a', cursor: 'pointer' }}>{label}</span>
              ))}
            </div>
          </Card>
        </Section>

        <Section title="Inputs" description="Sliders, toggles, and hex inputs">
          <Card label="ADSR Sliders" width={220}>
            <SliderSample label="Attack" color="#10b981" />
            <SliderSample label="Decay" color="#10b981" />
            <SliderSample label="Sustain" color="#10b981" />
            <SliderSample label="Release" color="#10b981" />
          </Card>
          <Card label="Waveform Toggles" width={260}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {[{ name: 'TRI', on: true }, { name: 'SAW', on: false }, { name: 'PUL', on: true }, { name: 'NOI', on: false }].map(({ name, on }) => (
                <div key={name} style={{ padding: '6px 8px', borderRadius: 4, border: `1px solid ${on ? '#10b981' : '#2a2a3a'}`, background: on ? '#10b98120' : '#22222e', color: on ? '#10b981' : '#44445a', fontSize: 10, cursor: 'pointer' }}>
                  {name} — {on ? 'Active' : 'Off'}
                </div>
              ))}
            </div>
          </Card>
          <Card label="Hex Input" width={200}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['A0', '9F', '00', 'FF'].map(hex => (
                <div key={hex} style={{ background: '#121218', border: '1px solid #2a2a3a', borderRadius: 3, padding: '2px 6px', fontFamily: 'inherit', fontSize: 11, color: hex === '00' ? '#44445a' : '#60e060' }}>{hex}</div>
              ))}
            </div>
          </Card>
        </Section>

        {/* ─── 4. Visualizations ─── */}
        <Section title="Visualizations" description="ADSR envelopes, waveforms, VU meters">
          <Card label="ADSR Envelopes" width={360}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div>
                <div style={{ fontSize: 8, color: '#6b6b80', marginBottom: 2 }}>Punchy Bass</div>
                <ADSRMini a={0} d={9} s={0} r={0} color="#6366f1" />
              </div>
              <div>
                <div style={{ fontSize: 8, color: '#6b6b80', marginBottom: 2 }}>Soft Pad</div>
                <ADSRMini a={8} d={12} s={8} r={12} color="#10b981" />
              </div>
            </div>
          </Card>
          <Card label="Channel VU Meters" width={280}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
              {[0.8, 0.5, 0.3, 0.9, 0.2, 0.6].map((level, i) => {
                const colors = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#a855f7'];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: 12, height: 60, background: '#121218', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${level * 100}%`, background: level > 0.85 ? '#ef4444' : colors[i], borderRadius: 2, opacity: 0.8 }} />
                    </div>
                    <div style={{ fontSize: 7, color: '#6b6b80' }}>{i + 1}</div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card label="Mini Waveforms" width={320}>
            <div style={{ display: 'flex', gap: 12 }}>
              {['Triangle', 'Sawtooth', 'Pulse', 'Noise'].map(name => (
                <div key={name} style={{ textAlign: 'center' }}>
                  <svg width={60} height={30} viewBox="0 0 60 30" style={{ background: '#121218', borderRadius: 3, border: '1px solid #2a2a3a' }}>
                    <polyline
                      fill="none" stroke="#10b981" strokeWidth="1.5"
                      points={name === 'Triangle' ? '0,15 15,2 45,28 60,15' : name === 'Sawtooth' ? '0,15 54,2 54,28 60,15' : name === 'Pulse' ? '0,15 0,2 30,2 30,28 60,28 60,15' : '0,15 6,5 12,22 18,8 24,25 30,3 36,20 42,10 48,24 54,7 60,15'}
                    />
                  </svg>
                  <div style={{ fontSize: 7, color: '#6b6b80', marginTop: 2 }}>{name}</div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        {/* ─── 5. Panel Components ─── */}
        <Section title="Panel Components" description="Composite panels used in the tracker and DAW views">
          <Card label="Tab Bar" width={400}>
            <div style={{ display: 'flex', gap: 2, background: '#121218', padding: 4, borderRadius: 4 }}>
              {['Mixer', 'Tables', 'Monitor', 'Presets', 'Clips', 'Steps', 'Scope'].map((tab, i) => (
                <button key={tab} style={{ padding: '3px 10px', fontSize: 10, fontFamily: 'inherit', borderRadius: 3, border: 'none', cursor: 'pointer', background: i === 0 ? '#6366f130' : 'transparent', color: i === 0 ? '#6366f1' : '#44445a', fontWeight: i === 0 ? 'bold' : 'normal' }}>{tab}</button>
              ))}
            </div>
          </Card>
          <Card label="Channel Strip" width={100} height={200}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0' }}>
              <div style={{ width: '80%', height: 3, borderRadius: 2, background: '#6366f1' }} />
              <span style={{ fontSize: 10, color: '#e2e2e8' }}>CH 1</span>
              <div style={{ width: 12, height: 80, background: '#121218', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 0, width: '100%', height: '60%', background: '#6366f1', borderRadius: 2, opacity: 0.7 }} />
              </div>
              <div style={{ display: 'flex', gap: 4, fontSize: 9, color: '#44445a' }}>
                <span>M</span><span>S</span>
              </div>
            </div>
          </Card>
          <Card label="Preset Card" width={200}>
            <div style={{ padding: '8px 10px', borderRadius: 4, border: '1px solid #2a2a3a', background: '#22222e', cursor: 'pointer' }}>
              <div style={{ fontSize: 10, color: '#e2e2e8', fontWeight: 'bold', marginBottom: 2 }}>Classic Bass</div>
              <div style={{ fontSize: 8, color: '#44445a', marginBottom: 4 }}>Punchy sawtooth bass</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4, fontSize: 8 }}>
                  <span style={{ color: '#44445a' }}>T</span>
                  <span style={{ color: '#10b981' }}>S</span>
                  <span style={{ color: '#44445a' }}>P</span>
                  <span style={{ color: '#44445a' }}>N</span>
                </div>
                <ADSRMini a={0} d={9} s={0} r={0} color="#6366f1" width={60} height={18} />
              </div>
            </div>
          </Card>
          <Card label="Arrangement Block" width={300}>
            <div style={{ display: 'flex', gap: 2, padding: 4, background: '#121218', borderRadius: 4 }}>
              {['#6366f1', '#f59e0b', '#10b981'].map((color, ch) => (
                <div key={ch} style={{ flex: 1 }}>
                  <div style={{ fontSize: 7, color: '#6b6b80', marginBottom: 2 }}>CH{ch + 1}</div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[0, 1, 2].map(p => (
                      <div key={p} style={{ flex: 1, height: 20, borderRadius: 3, background: `${color}40`, border: `1px solid ${color}99`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color }}>
                        {p.toString(16).toUpperCase().padStart(2, '0')}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card label="Step Sequencer Row" width={340}>
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: 16 }, (_, i) => {
                const on = [0, 4, 8, 10, 12].includes(i);
                const isBeat = i % 4 === 0;
                return (
                  <div key={i} style={{
                    width: 18, height: 18, borderRadius: 3, cursor: 'pointer',
                    border: `1px solid ${on ? '#6366f1' : isBeat ? '#2a2a3a' : '#1e1e28'}`,
                    background: on ? '#6366f1' : 'transparent',
                  }} />
                );
              })}
            </div>
          </Card>
        </Section>

        {/* ─── 6. Table Data ─── */}
        <Section title="Table Visualization" description="Wave/Pulse/Filter/Speed table bar charts">
          <Card label="Bar Chart (Pulse Table)" width={400}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 60, background: '#121218', borderRadius: 4, padding: '4px 2px', border: '1px solid #2a2a3a' }}>
              {Array.from({ length: 32 }, (_, i) => {
                const val = Math.sin(i * 0.3) * 0.5 + 0.5;
                return <div key={i} style={{ flex: 1, height: `${val * 100}%`, background: '#ff8866', borderRadius: 1, opacity: 0.7 }} />;
              })}
            </div>
          </Card>
        </Section>

        {/* ─── 7. Layout Patterns ─── */}
        <Section title="Layout Patterns" description="How panels are composed into views">
          <Card label="DAW Layout" width={500} height={200}>
            <div style={{ display: 'flex', flexDirection: 'column', height: 180, gap: 2 }}>
              <div style={{ height: 20, background: '#1a1a2e', borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 8, color: '#6b6b80' }}>Toolbar (transport, BPM, view switch)</div>
              <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ height: 50, background: '#0d0d15', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#6b6b80' }}>Arrangement Timeline</div>
                  <div style={{ flex: 1, background: '#0d0d15', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#6b6b80' }}>Piano Roll</div>
                </div>
                <div style={{ width: 100, background: '#0d0d15', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#6b6b80' }}>Instrument Designer</div>
              </div>
              <div style={{ height: 40, background: '#0d0d15', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#6b6b80' }}>Bottom Panel (Mixer / Tables / Monitor / Presets)</div>
            </div>
          </Card>
          <Card label="Pro Layout" width={300} height={200}>
            <div style={{ display: 'flex', flexDirection: 'column', height: 180, gap: 2 }}>
              <div style={{ height: 20, background: '#1a1a2e', borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 8, color: '#6b6b80' }}>GT Toolbar</div>
              <div style={{ height: 40, background: '#0d0d15', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#6b6b80' }}>Order Matrix</div>
              <div style={{ flex: 1, background: '#0d0d15', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#6b6b80' }}>Pattern Grid (hex editor)</div>
            </div>
          </Card>
        </Section>

        {/* ─── 8. Spacing & Sizing ─── */}
        <Section title="Spacing & Sizing" description="Standard dimensions used across panels">
          <Card label="Panel Heights" width={300}>
            {[
              { name: 'Toolbar', h: 36 },
              { name: 'Bottom Panel', h: 240 },
              { name: 'Arrangement', h: 220 },
              { name: 'Order Matrix', h: 160 },
              { name: 'Tab Bar', h: 28 },
            ].map(({ name, h }) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b6b80', marginBottom: 4 }}>
                <span>{name}</span>
                <span style={{ color: '#e2e2e8' }}>{h}px</span>
              </div>
            ))}
          </Card>
          <Card label="Sidebar & Gaps" width={300}>
            {[
              { name: 'Sidebar Width', v: '280px' },
              { name: 'Piano Keys Width', v: '40px' },
              { name: 'Channel Header', v: '50px' },
              { name: 'Border Radius', v: '4px / 6px' },
              { name: 'Standard Padding', v: '8px' },
              { name: 'Standard Gap', v: '4px' },
            ].map(({ name, v }) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b6b80', marginBottom: 4 }}>
                <span>{name}</span>
                <span style={{ color: '#e2e2e8' }}>{v}</span>
              </div>
            ))}
          </Card>
        </Section>

        <div style={{ textAlign: 'center', padding: '24px 0', color: '#44445a', fontSize: 10 }}>
          DEViLBOX Design System — generated from component library
        </div>
      </div>
    </div>
  );
};
