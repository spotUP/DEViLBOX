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

// ── ADSR mini — uses shared EnvelopeVisualization ──
import { EnvelopeVisualization } from '@components/instruments/shared';
const ADSRMini: React.FC<{ a: number; d: number; s: number; r: number; color: string; width?: number; height?: number }> = ({ a, d, s, r, color, width = 160, height = 50 }) => (
  <EnvelopeVisualization mode="sid" attack={a} decay={d} sustain={s} release={r} width={width} height={height} color={color} backgroundColor="#121218" border="1px solid #2a2a3a" />
);

// ── Large Component Mocks ──

const CH_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#a855f7'];

const PatternGridMock: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = 500, h = 240;
    ctx.fillStyle = '#0d0d12'; ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "JetBrains Mono", monospace';
    // Header
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, w, 16);
    const cols = ['Row', 'Note', 'Ins', 'Cmd', 'Dat', 'Note', 'Ins', 'Cmd', 'Dat', 'Note', 'Ins', 'Cmd', 'Dat'];
    const colW = [30, 30, 22, 22, 22, 30, 22, 22, 22, 30, 22, 22, 22];
    let cx = 0;
    cols.forEach((col, i) => {
      ctx.fillStyle = i === 0 ? '#555' : i < 5 ? '#6366f180' : i < 9 ? '#f59e0b80' : '#10b98180';
      ctx.fillText(col, cx + 2, 11); cx += colW[i];
    });
    // Rows
    const demoNotes = [['C-4','01','---','--'],['...','..','---','--'],['E-4','01','---','--'],['...','..','---','--'],['G-4','02','0C','40'],['...','..','---','--'],['...','..','---','--'],['C-5','01','03','20'],['...','..','---','--'],['===','..','---','--'],['...','..','---','--'],['D-4','01','---','--'],['...','..','---','--'],['F#4','02','04','30']];
    for (let r = 0; r < 14; r++) {
      const y = 18 + r * 15;
      const isBeat = r % 4 === 0;
      ctx.fillStyle = isBeat ? '#0e0e1a' : (r % 2 === 0 ? '#0b0b14' : '#0d0d18');
      ctx.fillRect(0, y, w, 15);
      if (r === 4) { ctx.fillStyle = '#ffffff10'; ctx.fillRect(0, y, w, 15); } // cursor
      // Row number
      ctx.fillStyle = isBeat ? '#666' : '#444';
      ctx.fillText(r.toString(16).toUpperCase().padStart(2, '0'), 4, y + 11);
      // Channel data
      const d = demoNotes[r] || ['...','..','---','--'];
      for (let ch = 0; ch < 3; ch++) {
        const bx = 30 + ch * 96;
        const note = d[0], ins = d[1], cmd = d[2], dat = d[3];
        ctx.fillStyle = note === '...' ? '#333' : note === '===' ? '#ef4444' : '#e8e8f0';
        ctx.fillText(note, bx + 2, y + 11);
        ctx.fillStyle = ins === '..' ? '#333' : '#fbbf24';
        ctx.fillText(ins, bx + 32, y + 11);
        ctx.fillStyle = cmd === '---' ? '#333' : '#f97316';
        ctx.fillText(cmd, bx + 54, y + 11);
        ctx.fillStyle = dat === '--' ? '#333' : '#f97316';
        ctx.fillText(dat, bx + 76, y + 11);
      }
    }
  }, []);
  return <canvas ref={ref} width={500} height={240} style={{ width: 500, height: 240, borderRadius: 4 }} />;
};


const OrderMatrixMock: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = 500, h = 120;
    ctx.fillStyle = '#0d0d12'; ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "JetBrains Mono", monospace';
    // Header
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, w, 16);
    ['Pos', 'CH1', 'CH2', 'CH3'].forEach((ch, i) => {
      ctx.fillStyle = i === 0 ? '#666' : CH_COLORS[i - 1];
      ctx.fillText(ch, 8 + i * 80, 11);
    });
    // Data
    const data = [['00','00','00'],['01','02','01'],['02','01','03'],['FF','FF','FF']];
    data.forEach((row, r) => {
      const y = 18 + r * 16;
      ctx.fillStyle = r === 1 ? '#ffffff08' : 'transparent';
      ctx.fillRect(0, y, w, 16);
      ctx.fillStyle = '#555'; ctx.fillText(r.toString(16).toUpperCase().padStart(2, '0'), 8, y + 12);
      row.forEach((val, ch) => {
        ctx.fillStyle = val === 'FF' ? '#ef4444' : '#60e060';
        ctx.fillText(val, 88 + ch * 80, y + 12);
      });
    });
  }, []);
  return <canvas ref={ref} width={500} height={120} style={{ width: 500, height: 120, borderRadius: 4 }} />;
};

const InstrumentPanelMock: React.FC = () => (
  <div style={{ fontSize: 9, color: '#e2e2e8' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ color: '#6366f1', fontWeight: 'bold' }}>#01 Classic Bass</span>
      <span style={{ color: '#6b6b80' }}>AD:09 SR:00</span>
    </div>
    <ADSRMini a={0} d={9} s={0} r={0} color="#10b981" width={250} height={50} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 8 }}>
      {['ATK:0', 'DEC:9', 'SUS:0', 'REL:0'].map(l => <div key={l} style={{ background: '#121218', padding: '2px 4px', borderRadius: 2, textAlign: 'center', color: '#10b981' }}>{l}</div>)}
    </div>
    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
      {['TRI', 'SAW', 'PUL', 'NOI'].map((w, i) => <div key={w} style={{ flex: 1, padding: '4px 0', textAlign: 'center', borderRadius: 3, border: `1px solid ${i === 1 ? '#10b981' : '#2a2a3a'}`, background: i === 1 ? '#10b98120' : '#22222e', color: i === 1 ? '#10b981' : '#44445a' }}>{w}</div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', marginTop: 8, color: '#6b6b80' }}>
      <span>Wave: <span style={{ color: '#60e060' }}>00</span></span>
      <span>Pulse: <span style={{ color: '#ff8866' }}>00</span></span>
      <span>Filter: <span style={{ color: '#ffcc00' }}>00</span></span>
      <span>Speed: <span style={{ color: '#6699ff' }}>00</span></span>
    </div>
    <div style={{ display: 'flex', gap: 12, marginTop: 6, color: '#6b6b80' }}>
      <span>Gate: 00</span><span>Vib: 00</span>
    </div>
  </div>
);

const InstrumentDesignerMock: React.FC = () => (
  <div style={{ fontSize: 9, color: '#e2e2e8' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ color: '#6b6b80' }}>&lt;</span>
      <span style={{ color: '#6366f1', fontWeight: 'bold' }}>#01 Classic Bass</span>
      <span style={{ color: '#6b6b80' }}>&gt;</span>
    </div>
    <div style={{ color: '#44445a', marginBottom: 2 }}>ENVELOPE</div>
    <ADSRMini a={0} d={9} s={10} r={3} color="#6366f1" width={250} height={60} />
    <div style={{ display: 'flex', gap: 8, marginTop: 4, color: '#6b6b80' }}>
      <span>A:0 2ms</span><span>D:9 300ms</span><span>S:10 67%</span><span>R:3 72ms</span>
    </div>
    <div style={{ color: '#44445a', marginTop: 8, marginBottom: 2 }}>WAVEFORM</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
      {[{ n: 'TRI', on: false }, { n: 'SAW', on: true }, { n: 'PUL', on: false }, { n: 'NOI', on: false }].map(({ n, on }) => (
        <div key={n} style={{ padding: 4, borderRadius: 4, border: `1px solid ${on ? '#10b981' : '#2a2a3a'}`, background: on ? '#10b98115' : '#22222e', color: on ? '#10b981' : '#44445a' }}>{n}</div>
      ))}
    </div>
    <div style={{ color: '#44445a', marginTop: 8, marginBottom: 2 }}>FILTER</div>
    <div style={{ display: 'flex', gap: 4 }}>
      {['LP', 'BP', 'HP'].map((m, i) => <div key={m} style={{ padding: '2px 8px', borderRadius: 3, border: `1px solid ${i === 0 ? '#ffcc00' : '#2a2a3a'}`, color: i === 0 ? '#ffcc00' : '#44445a', fontSize: 8 }}>{m}</div>)}
    </div>
  </div>
);

const TableEditorMock: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = 380, h = 180;
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, w, h);
    ctx.font = '10px "JetBrains Mono", monospace';
    // Tabs
    ['wave', 'pulse', 'filter', 'speed'].forEach((t, i) => {
      const colors = ['#60e060', '#ff8866', '#ffcc00', '#6699ff'];
      ctx.fillStyle = i === 1 ? '#0d0d0d' : 'transparent';
      ctx.fillRect(i * 95, 0, 94, 18);
      ctx.fillStyle = i === 1 ? colors[i] : '#555';
      ctx.fillText(t.toUpperCase(), i * 95 + 8, 13);
      if (i === 1) { ctx.fillStyle = colors[i]; ctx.fillRect(i * 95, 16, 94, 2); }
    });
    // Header
    ctx.fillStyle = '#888'; ctx.fillText(' IDX', 4, 32); ctx.fillText('LEFT', 40, 32); ctx.fillText('RIGHT', 80, 32);
    // Rows
    for (let r = 0; r < 9; r++) {
      const y = 36 + r * 15;
      const isCursor = r === 3;
      if (isCursor) { ctx.fillStyle = '#ffffff08'; ctx.fillRect(0, y, w, 15); }
      ctx.fillStyle = '#555'; ctx.fillText(r.toString(16).toUpperCase().padStart(2, '0'), 8, y + 11);
      const lv = r < 6 ? Math.round(Math.sin(r * 0.8) * 127 + 128) : 0;
      const rv = r < 6 ? Math.round(Math.cos(r * 0.6) * 127 + 128) : 0;
      ctx.fillStyle = lv === 0 ? '#333' : '#ff8866'; ctx.fillText(lv.toString(16).toUpperCase().padStart(2, '0'), 40, y + 11);
      ctx.fillStyle = rv === 0 ? '#333' : '#ff8866'; ctx.fillText(rv.toString(16).toUpperCase().padStart(2, '0'), 80, y + 11);
      if (rv > 0) { ctx.fillStyle = '#ff886622'; ctx.fillRect(126, y + 2, (rv / 255) * 200, 11); }
    }
  }, []);
  return <canvas ref={ref} width={380} height={180} style={{ width: 380, height: 180, borderRadius: 4 }} />;
};

const SIDMonitorMock: React.FC = () => (
  <div style={{ fontSize: 8, fontFamily: '"JetBrains Mono", monospace', color: '#666' }}>
    <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: 4 }}>SID #1 REGISTERS</div>
    {[0, 1, 2].map(v => (
      <div key={v} style={{ marginBottom: 6 }}>
        <div style={{ color: '#6b6b80', marginBottom: 1 }}>Voice {v + 1}</div>
        {['Freq Lo', 'Freq Hi', 'PW Lo', 'PW Hi', 'Control', 'Atk/Dec', 'Sus/Rel'].map((name, ri) => {
          const colors = ['#6699ff', '#6699ff', '#ff8866', '#ff8866', '#ffcc00', '#60e060', '#60e060'];
          const val = Math.round(Math.random() * 200);
          return (
            <div key={ri} style={{ display: 'flex', gap: 6, color: val > 0 ? colors[ri] : '#333' }}>
              <span style={{ width: 48, color: '#444' }}>{name}</span>
              <span>{val.toString(16).toUpperCase().padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>
    ))}
    <div style={{ color: '#6b6b80', marginBottom: 1 }}>Filter / Vol</div>
    {['FC Lo', 'FC Hi', 'Res/Filt', 'Mode/Vol'].map(name => (
      <div key={name} style={{ display: 'flex', gap: 6, color: '#ef4444' }}>
        <span style={{ width: 48, color: '#444' }}>{name}</span>
        <span>{Math.round(Math.random() * 255).toString(16).toUpperCase().padStart(2, '0')}</span>
      </div>
    ))}
  </div>
);

const MixerMock: React.FC = () => (
  <div style={{ display: 'flex', gap: 4, height: 160 }}>
    {Array.from({ length: 6 }, (_, ch) => {
      const color = CH_COLORS[ch]; const level = 0.3 + Math.random() * 0.6;
      return (
        <div key={ch} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 4px', background: '#22222e', borderRadius: 4, border: '1px solid #2a2a3a' }}>
          <div style={{ width: '80%', height: 3, borderRadius: 2, background: color }} />
          <span style={{ fontSize: 9, color: '#e2e2e8' }}>CH{ch + 1}</span>
          <div style={{ flex: 1, width: 10, background: '#121218', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${level * 100}%`, background: level > 0.85 ? '#ef4444' : color, borderRadius: 2, opacity: 0.7 }} />
          </div>
          <span style={{ fontSize: 8, color: '#44445a' }}>M S</span>
        </div>
      );
    })}
  </div>
);

const ArrangementMock: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const w = 500, h = 120, headerW = 40;
    ctx.fillStyle = '#121218'; ctx.fillRect(0, 0, w, h);
    ctx.font = '8px "JetBrains Mono", monospace';
    for (let ch = 0; ch < 3; ch++) {
      const y = ch * 38, color = CH_COLORS[ch], trackH = 36;
      ctx.fillStyle = '#1a1a24'; ctx.fillRect(0, y, headerW, trackH);
      ctx.fillStyle = color; ctx.fillRect(0, y, 3, trackH);
      ctx.fillStyle = '#6b6b80'; ctx.fillText(`CH${ch + 1}`, 6, y + 20);
      ctx.fillStyle = '#2a2a3a'; ctx.fillRect(headerW, y + trackH - 1, w - headerW, 1);
      let bx = headerW;
      for (let p = 0; p < 4; p++) {
        const bw = 60 + Math.random() * 40;
        ctx.fillStyle = color; ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.roundRect(bx + 1, y + 2, bw - 2, trackH - 4, 4); ctx.fill();
        ctx.globalAlpha = 0.6; ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx + 1, y + 2, bw - 2, trackH - 4, 4); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = color;
        ctx.fillText(p.toString(16).toUpperCase().padStart(2, '0'), bx + 4, y + 20);
        bx += bw + 2;
      }
    }
    ctx.fillStyle = '#f59e0b'; ctx.fillRect(headerW + 120, 0, 2, h);
  }, []);
  return <canvas ref={ref} width={500} height={120} style={{ width: 500, height: 120, borderRadius: 4 }} />;
};

const ToolbarMock: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#1a1a2e', borderRadius: 4, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>
    <span style={{ color: '#6b6b80', padding: '1px 4px', border: '1px solid #333', borderRadius: 2 }}>Save</span>
    <span style={{ color: '#6b6b80', padding: '1px 4px', border: '1px solid #333', borderRadius: 2 }}>PRG</span>
    <span style={{ color: '#6b6b80', padding: '1px 4px', border: '1px solid #333', borderRadius: 2 }}>SID</span>
    <span style={{ width: 1, height: 16, background: '#333' }} />
    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>REC</span>
    <span style={{ color: '#f59e0b' }}>JAM</span>
    <span style={{ width: 1, height: 16, background: '#333' }} />
    <span style={{ color: '#6b6b80' }}>Pos:<span style={{ color: '#e2e2e8' }}>00</span></span>
    <span style={{ color: '#6b6b80' }}>Row:<span style={{ color: '#e2e2e8' }}>00</span></span>
    <span style={{ color: '#ffcc00', fontWeight: 'bold' }}>Commando Theme</span>
    <span style={{ color: '#6b6b80' }}>by Rob Hubbard</span>
    <span style={{ flex: 1 }} />
    <span style={{ color: '#6b6b80' }}>Oct:3</span>
    <span style={{ color: '#6b6b80' }}>Stp:1</span>
    <span style={{ color: '#6b6b80' }}>Tempo:6</span>
    <span style={{ color: '#6b6b80' }}>6581</span>
    <span style={{ color: '#10b981', fontWeight: 'bold', padding: '1px 4px', border: '1px solid #10b98150', borderRadius: 2 }}>1xSID</span>
    <span style={{ width: 1, height: 16, background: '#333' }} />
    <span style={{ color: '#6366f180' }}>[PRO]</span>
    <span style={{ color: '#6366f1', fontWeight: 'bold' }}>[DAW]</span>
  </div>
);

const PresetListMock: React.FC = () => (
  <div style={{ fontSize: 9 }}>
    <div style={{ color: '#888', marginBottom: 4 }}>PRESETS</div>
    <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
      {['bass', 'lead', 'pad', 'arp', 'drum', 'fx'].map((c, i) => (
        <span key={c} style={{ padding: '1px 4px', fontSize: 8, borderRadius: 2, background: i === 0 ? '#1a2a3a' : '#141414', color: i === 0 ? '#66aaff' : '#666' }}>{c.toUpperCase()}</span>
      ))}
    </div>
    {['Classic Bass', 'Sub Bass', 'Acid Bass', 'Hubbard Bass', 'Galway Bass'].map((name, i) => (
      <div key={name} style={{ padding: '2px 4px', background: i === 1 ? '#1a1a1a' : 'transparent', color: i === 1 ? '#66aaff' : '#ccc', borderRadius: 2, marginBottom: 1 }}>
        {name} <span style={{ color: '#666', float: 'right' }}>09 00</span>
      </div>
    ))}
  </div>
);

const PresetCardsMock: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
    {[{ n: 'Classic Bass', d: 'Punchy sawtooth bass', a: 0, dd: 9, s: 0, r: 0, w: 'S' },
      { n: 'Acid Bass', d: 'Pulse with filter sweep', a: 0, dd: 8, s: 0, r: 0, w: 'P' },
      { n: 'PWM Lead', d: 'Pulse width modulation', a: 0, dd: 9, s: 10, r: 9, w: 'P' },
      { n: 'Soft Pad', d: 'Slow attack triangle', a: 8, dd: 12, s: 8, r: 12, w: 'T' }
    ].map(({ n, d, a, dd, s, r, w }) => (
      <div key={n} style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #2a2a3a', background: '#22222e', cursor: 'pointer' }}>
        <div style={{ fontSize: 9, color: '#e2e2e8', fontWeight: 'bold', marginBottom: 1 }}>{n}</div>
        <div style={{ fontSize: 7, color: '#44445a', marginBottom: 3 }}>{d}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 3, fontSize: 7 }}>
            {['T', 'S', 'P', 'N'].map(wf => <span key={wf} style={{ color: wf === w ? '#10b981' : '#44445a' }}>{wf}</span>)}
          </div>
          <ADSRMini a={a} d={dd} s={s} r={r} color="#6366f1" width={50} height={16} />
        </div>
      </div>
    ))}
  </div>
);

const NavBarMock: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: '#0d0d12', borderRadius: 4, fontSize: 10, border: '1px solid #2a2a3a' }}>
    <span style={{ fontWeight: 'bold', color: '#e2e2e8', marginRight: 8 }}>DEViLBOX</span>
    {['Tracker', 'Arrange', 'Piano', 'Mixer', 'DJ', 'Pads', 'VJ', 'Studio', 'Split', 'Grid', '303'].map((v, i) => (
      <span key={v} style={{ padding: '2px 6px', borderRadius: 3, fontSize: 9, cursor: 'pointer', background: i === 0 ? '#6366f120' : 'transparent', color: i === 0 ? '#6366f1' : '#6b6b80' }}>{v}</span>
    ))}
    <span style={{ flex: 1 }} />
    <span style={{ fontSize: 9, color: '#6b6b80' }}>Vol</span>
    <span style={{ fontSize: 9, color: '#6b6b80' }}>MIDI</span>
    <span style={{ fontSize: 9, color: '#6b6b80' }}>Settings</span>
  </div>
);

const MobileTabBarMock: React.FC = () => (
  <div style={{ display: 'flex', background: '#0d0d12', borderRadius: 4, border: '1px solid #2a2a3a' }}>
    {[{ l: 'Pattern', active: true }, { l: 'Instr', active: false }, { l: 'Mixer', active: false }, { l: 'Arrange', active: false }, { l: 'Pads', active: false }].map(({ l, active }) => (
      <div key={l} style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 9, color: active ? '#6366f1' : '#44445a', background: active ? '#6366f110' : 'transparent', cursor: 'pointer' }}>{l}</div>
    ))}
  </div>
);

const OscilloscopeMock: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#0d0d12'; ctx.fillRect(0, 0, 280, 60);
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = 0; x < 280; x++) {
      const y = 30 + Math.sin(x * 0.05) * 20 * Math.sin(x * 0.02);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, []);
  return <canvas ref={ref} width={280} height={60} style={{ width: 280, height: 60, borderRadius: 4, border: '1px solid #2a2a3a' }} />;
};

const FreqBarsMock: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 60, background: '#0d0d12', borderRadius: 4, padding: '4px 2px', border: '1px solid #2a2a3a' }}>
    {Array.from({ length: 32 }, (_, i) => {
      const h = Math.max(2, 55 * Math.exp(-i * 0.08) * (0.5 + Math.random() * 0.5));
      return <div key={i} style={{ flex: 1, height: h, background: `hsl(${160 + i * 3}, 70%, 50%)`, borderRadius: 1, opacity: 0.8 }} />;
    })}
  </div>
);

const StereoFieldMock: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#0d0d12'; ctx.fillRect(0, 0, 100, 100);
    ctx.strokeStyle = '#2a2a3a'; ctx.beginPath(); ctx.arc(50, 50, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#2a2a3a'; ctx.beginPath(); ctx.moveTo(50, 10); ctx.lineTo(50, 90); ctx.moveTo(10, 50); ctx.lineTo(90, 50); ctx.stroke();
    ctx.fillStyle = '#6366f1'; ctx.globalAlpha = 0.3;
    for (let i = 0; i < 50; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 25; ctx.fillRect(50 + Math.cos(a) * r, 50 + Math.sin(a) * r, 2, 2); }
    ctx.globalAlpha = 1;
  }, []);
  return <canvas ref={ref} width={100} height={100} style={{ width: 100, height: 100, borderRadius: 4, border: '1px solid #2a2a3a' }} />;
};

const DAWViewMock: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: 340, gap: 1, background: '#121218', borderRadius: 6, overflow: 'hidden', border: '1px solid #2a2a3a' }}>
    <ToolbarMock />
    <div style={{ flex: 1, display: 'flex', gap: 1, minHeight: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ height: 100, background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#44445a' }}>Arrangement Timeline</div>
        <div style={{ flex: 1, background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#44445a' }}>Piano Roll Editor</div>
      </div>
      <div style={{ width: 180, background: '#1a1a24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#44445a', borderLeft: '1px solid #2a2a3a' }}>Instrument Designer</div>
    </div>
    <div style={{ height: 80, background: '#1a1a24', borderTop: '1px solid #2a2a3a', padding: 4 }}>
      <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
        {['Mixer', 'Tables', 'Monitor', 'Presets', 'Clips', 'Steps', 'Scope'].map((t, i) => (
          <span key={t} style={{ padding: '1px 6px', fontSize: 8, borderRadius: 2, color: i === 0 ? '#6366f1' : '#44445a', background: i === 0 ? '#6366f120' : 'transparent' }}>{t}</span>
        ))}
      </div>
      <MixerMock />
    </div>
  </div>
);

const ProViewMock: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', height: 260, gap: 1, background: '#0d0d12', borderRadius: 6, overflow: 'hidden', border: '1px solid #2a2a3a' }}>
    <ToolbarMock />
    <div style={{ height: 60, background: '#0d0d12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#44445a', borderBottom: '1px solid #1a1a2e' }}>Order Matrix (3 channels × order positions)</div>
    <div style={{ flex: 1, background: '#0b0b14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#44445a' }}>Pattern Grid — Hex Editor (Note | Ins | Cmd | Dat × 3 channels)</div>
  </div>
);

// ── Main Page ──
// ── Split-Screen Live Comparison ──
const SPLIT_VIEWS = [
  { id: 'tracker', label: 'Tracker' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'dj', label: 'DJ' },
  { id: 'studio', label: 'Studio' },
  { id: 'drumpad', label: 'Pads' },
];

const SplitScreenComparison: React.FC = () => {
  const [showSplit, setShowSplit] = useState(false);
  const [view, setView] = useState('tracker');

  const baseUrl = window.location.origin;
  const domUrl = `${baseUrl}/?_renderMode=dom#/_view=${view}`;
  const glUrl = `${baseUrl}/?_renderMode=webgl#/_view=${view}`;

  if (!showSplit) {
    return (
      <button
        onClick={() => setShowSplit(true)}
        style={{
          padding: '8px 20px', fontSize: 12, fontFamily: 'inherit', border: '1px solid #6366f1',
          borderRadius: 6, cursor: 'pointer', background: '#6366f120', color: '#6366f1', fontWeight: 'bold',
        }}
      >
        Open Side-by-Side Comparison
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0a0a10', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: '#1a1a24', borderBottom: '1px solid #2a2a3a' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: '#e2e2e8' }}>DOM vs WebGL</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {SPLIT_VIEWS.map(({ id, label }) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '3px 10px', fontSize: 10, fontFamily: 'inherit', border: 'none', borderRadius: 3, cursor: 'pointer',
              background: view === id ? '#6366f1' : '#22222e', color: view === id ? '#fff' : '#6b6b80',
            }}>{label}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#44445a' }}>Both iframes load the full app — interact with either side</span>
        <button onClick={() => setShowSplit(false)} style={{
          padding: '4px 12px', fontSize: 11, fontFamily: 'inherit', border: '1px solid #2a2a3a',
          borderRadius: 4, cursor: 'pointer', background: '#22222e', color: '#e2e2e8',
        }}>Close</button>
      </div>

      {/* Split panes */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '2px solid #6366f1' }}>
          <div style={{ height: 22, flexShrink: 0, background: '#10b98120', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#10b981', fontWeight: 'bold' }}>
            DOM (React/HTML) — Source of Truth
          </div>
          <iframe key={`dom-${view}`} src={domUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="DOM" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 22, flexShrink: 0, background: '#6366f120', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#6366f1', fontWeight: 'bold' }}>
            WebGL (Pixi) — Should Match DOM
          </div>
          <iframe key={`gl-${view}`} src={glUrl} style={{ flex: 1, border: 'none', width: '100%' }} title="WebGL" />
        </div>
      </div>
    </div>
  );
};

// ── Back to App link ──
const BackToApp: React.FC = () => (
  <a
    href="/"
    onClick={(e) => { e.preventDefault(); history.replaceState(null, '', window.location.pathname); window.location.reload(); }}
    style={{ fontSize: 11, color: '#6366f1', textDecoration: 'none', cursor: 'pointer' }}
  >
    Back to App
  </a>
);

export const DesignSystemPage: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'auto', background: '#121218', color: '#e2e2e8', fontFamily: '"JetBrains Mono", "SF Mono", monospace', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 4 }}>DEViLBOX Design System</h1>
            <p style={{ fontSize: 12, color: '#6b6b80', marginBottom: 0 }}>Visual catalog of all UI components — DOM and Pixi renderers</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SplitScreenComparison />
            <BackToApp />
          </div>
        </div>

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

        {/* ─── 7. Editor Components (Large) ─── */}
        <Section title="Pattern Editor" description="Hex-based tracker pattern grid — the core editing surface">
          <Card label="Pattern Grid (DOM — PatternEditorCanvas)" width={520} height={260}>
            <PatternGridMock />
          </Card>
        </Section>

        <Section title="Order Matrix" description="Sequence editor showing pattern order per channel">
          <Card label="Order Matrix (DOM — GTOrderMatrix)" width={520} height={140}>
            <OrderMatrixMock />
          </Card>
        </Section>

        <Section title="Instrument Panel" description="SID instrument editor — ADSR, waveforms, table pointers">
          <Card label="Instrument Panel (DOM — GTInstrumentPanel)" width={280} height={300}>
            <InstrumentPanelMock />
          </Card>
          <Card label="Instrument Designer (Pixi — PixiGTInstrumentDesigner)" width={280} height={300}>
            <InstrumentDesignerMock />
          </Card>
        </Section>

        <Section title="Table Editor" description="Wave/Pulse/Filter/Speed table hex editor with draw mode">
          <Card label="Table Editor (DOM — GTTableEditor)" width={400} height={200}>
            <TableEditorMock />
          </Card>
        </Section>

        <Section title="SID Monitor" description="Live SID register display — 3 voices + global filter">
          <Card label="SID Monitor (DOM + Pixi)" width={250} height={280}>
            <SIDMonitorMock />
          </Card>
        </Section>

        <Section title="Mixer" description="Per-channel mixer strips with VU meters">
          <Card label="Mixer Panel (DAW bottom panel)" width={400} height={180}>
            <MixerMock />
          </Card>
        </Section>

        <Section title="Arrangement Timeline" description="Horizontal pattern blocks per channel">
          <Card label="Arrangement (DAW — PixiGTDAWArrangement)" width={520} height={140}>
            <ArrangementMock />
          </Card>
        </Section>

        <Section title="Toolbar" description="Transport controls, song info, SID config">
          <Card label="GT Toolbar (DOM — GTToolbar)" width={700}>
            <ToolbarMock />
          </Card>
        </Section>

        <Section title="Preset Browser" description="SID instrument presets organized by category">
          <Card label="List Variant (Studio)" width={220} height={200}>
            <PresetListMock />
          </Card>
          <Card label="Cards Variant (DAW)" width={400} height={200}>
            <PresetCardsMock />
          </Card>
        </Section>

        <Section title="Navigation" description="Desktop nav bar, mobile tab bar, mobile hamburger menu">
          <Card label="Desktop NavBar" width={700}>
            <NavBarMock />
          </Card>
          <Card label="Mobile Tab Bar" width={360}>
            <MobileTabBarMock />
          </Card>
        </Section>

        <Section title="Visualization Components" description="Audio-reactive and static visual displays">
          <Card label="Oscilloscope" width={300} height={80}>
            <OscilloscopeMock />
          </Card>
          <Card label="Frequency Bars" width={300} height={80}>
            <FreqBarsMock />
          </Card>
          <Card label="Stereo Field" width={120} height={120}>
            <StereoFieldMock />
          </Card>
        </Section>

        {/* ─── 8. Full View Compositions ─── */}
        <Section title="Full View Compositions" description="Complete view layouts as they appear in the app">
          <Card label="DAW Mode (GT Ultra)" width={700} height={360}>
            <DAWViewMock />
          </Card>
          <Card label="Pro Mode (GT Ultra)" width={700} height={280}>
            <ProViewMock />
          </Card>
        </Section>

        {/* ─── 9. Layout Patterns ─── */}
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
