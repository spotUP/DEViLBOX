import React from 'react';
import type { FurnaceConfig, FurnaceOperatorConfig } from '@typedefs/instrument';
import { Knob } from '../controls/Knob';
import { Cpu, Activity, Zap, Waves, Volume2, Music, Settings } from 'lucide-react';

interface FurnaceEditorProps {
  config: FurnaceConfig;
  onChange: (updates: Partial<FurnaceConfig>) => void;
}

export const FurnaceEditor: React.FC<FurnaceEditorProps> = ({ config, onChange }) => {
  const updateOperator = (idx: number, updates: Partial<FurnaceOperatorConfig>) => {
    const newOps = [...config.operators];
    newOps[idx] = { ...newOps[idx], ...updates };
    onChange({ operators: newOps });
  };

  const chipName = getChipName(config.chipType);
  const category = getChipCategory(config.chipType);

  return (
    <div className="space-y-6">
      {/* Chip Header - Uniform across all chips */}
      <div className="flex items-center justify-between bg-dark-bgSecondary p-3 rounded-lg border border-dark-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-700 rounded flex items-center justify-center shadow-lg shadow-indigo-900/20">
            <Cpu size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-white text-sm tracking-tight">{chipName}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted font-mono uppercase bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border">
                {category} • ID: {config.chipType}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <Zap size={8} /> Engine Ready
              </span>
            </div>
          </div>
        </div>
        
        {/* Global Controls - Show for all */}
        <div className="flex gap-4">
          <Knob
            label="VOL"
            value={100} // Placeholder, should come from config
            min={0}
            max={127}
            onChange={() => {}}
            size="sm"
            color="var(--color-text-primary)"
          />
        </div>
      </div>

      {/* 1. FM OPERATOR PANEL - Show for FM chips */}
      {category === "FM" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border shadow-inner">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-amber-500" />
                <h3 className="font-mono text-sm font-bold text-text-primary uppercase tracking-wider">Algorithm & Feedback</h3>
              </div>
              <div className="flex gap-4">
                <Knob label="ALG" value={config.algorithm} min={0} max={7} onChange={(v) => onChange({ algorithm: Math.round(v) })} size="sm" color="#f59e0b" />
                <Knob label="FB" value={config.feedback} min={0} max={7} onChange={(v) => onChange({ feedback: Math.round(v) })} size="sm" color="#d97706" />
              </div>
            </div>
            <div className="h-10 bg-dark-bg flex items-center justify-center rounded border border-dark-border/50">
              <span className="font-mono text-[10px] text-text-muted italic">
                {getAlgDescription(config.algorithm)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.operators.map((op, i) => (
              <OperatorCard key={i} index={i} op={op} onUpdate={(u) => updateOperator(i, u)} />
            ))}
          </div>
        </div>
      )}

      {/* 2. PSG / PULSE PANEL - Show for PSG chips */}
      {category === "PSG" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
            <div className="flex items-center gap-2 mb-4">
              <Music size={16} className="text-sky-400" />
              <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Pulse Control</h3>
            </div>
            <div className="flex justify-around">
              <Knob label="DUTY" value={50} min={0} max={100} onChange={() => {}} size="md" color="#38bdf8" />
              <Knob label="WIDTH" value={50} min={0} max={100} onChange={() => {}} size="md" color="#0ea5e9" />
            </div>
          </div>
          
          <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-rose-400" />
              <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Noise Mode</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="bg-dark-bg border border-dark-border rounded py-2 font-mono text-[10px] text-rose-400 hover:bg-rose-950/20">WHITE</button>
              <button className="bg-dark-bg border border-dark-border rounded py-2 font-mono text-[10px] text-text-muted">PERIODIC</button>
            </div>
            <div className="mt-4">
              <Knob label="METAL" value={0} min={0} max={127} onChange={() => {}} size="sm" color="#fb7185" />
            </div>
          </div>

          <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
            <div className="flex items-center gap-2 mb-4">
              <Settings size={16} className="text-emerald-400" />
              <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Envelope</h3>
            </div>
            <div className="flex justify-between gap-2">
              <Knob label="ATK" value={0} min={0} max={15} onChange={() => {}} size="sm" color="#34d399" />
              <Knob label="DEC" value={8} min={0} max={15} onChange={() => {}} size="sm" color="#10b981" />
              <Knob label="SUS" value={10} min={0} max={15} onChange={() => {}} size="sm" color="#059669" />
              <Knob label="REL" value={5} min={0} max={15} onChange={() => {}} size="sm" color="#047857" />
            </div>
          </div>
        </div>
      )}

      {/* 3. WAVETABLE PANEL - Show for Wavetable chips */}
      {(category === "Wavetable" || config.wavetables.length > 0) && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Waves size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Wavetable Engine ({config.wavetables.length} waves)
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {config.wavetables.map((wave, i) => (
              <WavetableVisualizer key={i} data={wave.data} index={wave.id} />
            ))}
            {config.wavetables.length === 0 && (
              <div className="col-span-4 h-16 border border-dashed border-dark-border rounded flex items-center justify-center">
                <span className="text-[10px] text-text-muted font-mono italic">No custom waves defined. Using default ROM shapes.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. PCM / SAMPLE PANEL - Show for PCM chips */}
      {category === "PCM" && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 size={16} className="text-violet-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">PCM Sample Properties</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Knob label="RATE" value={44100} min={4000} max={48000} onChange={() => {}} size="sm" color="#a78bfa" />
            <Knob label="START" value={0} min={0} max={65535} onChange={() => {}} size="sm" color="#8b5cf6" />
            <Knob label="END" value={65535} min={0} max={65535} onChange={() => {}} size="sm" color="#7c3aed" />
            <Knob label="LOOP" value={0} min={0} max={65535} onChange={() => {}} size="sm" color="#6d28d9" />
            <div className="flex flex-col items-center justify-center gap-1">
              <span className="text-[9px] font-bold text-text-muted uppercase">Bit Depth</span>
              <div className="bg-dark-bg px-2 py-1 rounded border border-dark-border text-xs font-mono text-violet-400">8-BIT</div>
            </div>
          </div>
        </div>
      )}

      {/* MACROS & MODULATION - Show for all */}
      {config.macros.length > 0 && (
        <div className="bg-dark-bg p-3 border border-dark-border rounded flex items-center gap-3 shadow-lg">
          <div className="w-8 h-8 rounded-full bg-violet-900/30 flex items-center justify-center">
            <Activity size={14} className="text-violet-400" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold text-text-primary uppercase block tracking-tight">Active Modulation Matrix</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {config.macros.map((_, i) => (
                <span key={i} className="text-[8px] px-1 bg-dark-bgSecondary text-text-muted rounded border border-dark-border font-mono">
                  M.{i+1}
                </span>
              ))}
              <span className="text-[9px] text-text-muted font-mono ml-2 italic">({config.macros.length} sequences)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OperatorCard: React.FC<{ index: number; op: FurnaceOperatorConfig; onUpdate: (u: Partial<FurnaceOperatorConfig>) => void }> = ({ index, op, onUpdate }) => {
  return (
    <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border hover:border-amber-500/30 transition-colors group">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-dark-bgTertiary flex items-center justify-center font-mono text-[10px] font-bold text-amber-500 border border-amber-500/20 group-hover:border-amber-500/50 transition-colors">
          {index + 1}
        </div>
        <h4 className="font-mono text-[10px] font-bold text-text-primary uppercase tracking-wider">Operator {index + 1}</h4>
      </div>

      <div className="grid grid-cols-2 gap-y-3 gap-x-2">
        <Knob label="MULT" value={op.mult} min={0} max={15} onChange={(v) => onUpdate({ mult: Math.round(v) })} size="sm" color="#22d3ee" />
        <Knob label="TL" value={op.tl} min={0} max={127} onChange={(v) => onUpdate({ tl: Math.round(v) })} size="sm" color="#ef4444" />
        <Knob label="AR" value={op.ar} min={0} max={31} onChange={(v) => onUpdate({ ar: Math.round(v) })} size="sm" color="#10b981" />
        <Knob label="DR" value={op.dr} min={0} max={31} onChange={(v) => onUpdate({ dr: Math.round(v) })} size="sm" color="#f59e0b" />
        <Knob label="SL" value={op.sl} min={0} max={15} onChange={(v) => onUpdate({ sl: Math.round(v) })} size="sm" color="#8b5cf6" />
        <Knob label="RR" value={op.rr} min={0} max={15} onChange={(v) => onUpdate({ rr: Math.round(v) })} size="sm" color="#ec4899" />
      </div>
    </div>
  );
};

const WavetableVisualizer: React.FC<{ data: number[]; index: number }> = ({ data, index }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    // Grid/Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Waveform
    ctx.beginPath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#22d3ee');
    gradient.addColorStop(1, '#0891b2');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;

    const maxVal = Math.max(...data.map(Math.abs), 1);
    const isUnsigned = data.every(v => v >= 0);

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      let y;
      if (isUnsigned) {
        y = h - (data[i] / maxVal) * h * 0.8 - h * 0.1;
      } else {
        y = h / 2 - (data[i] / maxVal) * (h / 2) * 0.8;
      }
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';
    ctx.fill();

  }, [data]);

  return (
    <div className="bg-dark-bgTertiary p-1 rounded border border-dark-border hover:border-cyan-500/50 transition-colors">
      <canvas ref={canvasRef} width={120} height={48} className="w-full h-12" />
      <div className="flex justify-between items-center px-1 mt-1">
        <span className="text-[8px] font-mono text-cyan-400 font-bold">W{index}</span>
        <span className="text-[8px] font-mono text-text-muted">{data.length} pts</span>
      </div>
    </div>
  );
};

function getChipCategory(id: number): "FM" | "PSG" | "Wavetable" | "PCM" | "Other" {
  // FM chips
  if ([0, 1, 2, 11, 13, 14, 19, 22, 23, 26, 32, 33, 41].includes(id)) return "FM";
  // PSG chips
  if ([3, 4, 5, 6, 7, 8, 10, 12, 18, 33, 34, 35, 43, 44, 48, 52].includes(id)) return "PSG";
  // Wavetable chips
  if ([2, 6, 9, 15, 17, 18, 38, 66].includes(id)) return "Wavetable";
  // PCM chips
  if ([20, 21, 24, 25, 27, 28, 29, 30, 31, 36, 39, 40, 42, 45, 46, 50, 53, 65].includes(id)) return "PCM";
  
  return "Other";
}

function getChipName(id: number): string {
  switch (id) {
    case 0: return "Sega Genesis (YM2612)";
    case 1: return "Arcade FM (YM2151)";
    case 2: return "Nintendo Game Boy (LR35902)";
    case 3: return "Commodore 64 (SID)";
    case 4: return "Nintendo NES (2A03)";
    case 5: return "PC Engine (HuC6280)";
    case 6: return "General Instrument AY-3-8910";
    case 7: return "General Instrument AY8930";
    case 8: return "Atari TIA (2600)";
    case 9: return "Philips SAA1099";
    case 10: return "Commodore VIC-20";
    case 11: return "Yamaha OPLL (YM2413)";
    case 12: return "Konami VRC6";
    case 13: return "Yamaha OPNA (YM2608)";
    case 14: return "Yamaha OPNB (YM2610)";
    case 15: return "Famicom Disk System (FDS)";
    case 16: return "Famicom MMC5";
    case 17: return "Namco 163";
    case 18: return "Konami SCC";
    case 19: return "Bandai WonderSwan";
    case 20: return "OKI MSM6295";
    case 21: return "Ensoniq ES5506";
    case 22: return "Yamaha OPZ (YM2414)";
    case 23: return "Yamaha Y8950";
    case 24: return "Super Nintendo (SPC700)";
    case 25: return "Atari Lynx (Mikey)";
    case 26: return "Yamaha OPL4 (YMF278B)";
    case 27: return "SegaPCM";
    case 28: return "Yamaha YMZ280B";
    case 29: return "Ricoh RF5C68";
    case 30: return "Irem GA20";
    case 31: return "Namco C140";
    case 32: return "Capcom QSound";
    case 33: return "Commodore VIC-I";
    case 34: return "Commodore TED";
    case 35: return "Watara Supervision";
    case 36: return "Commander X16 VERA";
    case 37: return "Sharp SM8521";
    case 38: return "Konami K005289 (Bubble)";
    case 39: return "Konami K007232";
    case 40: return "Konami K053260";
    case 41: return "Seta X1-010";
    case 42: return "NEC uPD1771";
    case 43: return "Toshiba T6W28";
    case 44: return "Nintendo Virtual Boy (VSU)";
    case 66: return "Konami Bubble System";
    default: return `Unknown Chip (${id})`;
  }
}

function getAlgDescription(alg: number): string {
  const descs = [
    "4 → 3 → 2 → 1 → Output",
    "(3+4) → 2 → 1 → Output",
    "4 → (2+3) → 1 → Output",
    "(2+4) → 3 → 1 → Output",
    "(2→1) + (4→3) → Output",
    "4 → (1+2+3) → Output",
    "1 + (4→3) + (2) → Output",
    "1 + 2 + 3 + 4 → Output"
  ];
  return descs[alg] || "Unknown";
}