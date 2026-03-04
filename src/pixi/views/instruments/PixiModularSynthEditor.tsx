/**
 * PixiModularSynthEditor — GL-native modular synth patch editor.
 * Two view modes: Rack (module strips + cable lines) and Matrix (connection grid).
 * Uses configRef pattern for stale-state prevention per CLAUDE.md.
 *
 * Matches DOM version features:
 * - All parameters shown (no slice limit)
 * - Module collapse/expand
 * - Category-filtered module browser
 * - CV amount display/cycling in matrix cells
 * - Orthogonal cable routing
 * - Keyboard shortcuts (Delete, Escape, Tab)
 * - Polyphony display
 * - Selected module highlight
 */
import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiLabel, PixiKnob, PixiScrollView } from '../../components';
import { ModuleRegistry } from '../../../engine/modular/ModuleRegistry';
import { registerBuiltInModules } from '../../../engine/modular/modules';
import type { ModularPatchConfig, ModularModuleInstance, ModularConnection, ModulePortDef, SignalType, PortRef, ModuleCategory } from '../../../types/modular';

registerBuiltInModules();

const STRIP_GAP = 4, PORT_R = 5, CELL = 22, HDR = 56;
// Color-code: audio=green, CV=blue, gate=red, trigger=orange
const SIG_CLR: Record<SignalType, number> = { audio: 0x44ff44, cv: 0x4488ff, gate: 0xff4444, trigger: 0xff8844 };
type ViewMode = 'rack' | 'matrix';

// Category config matching DOM ModuleShelf
const CATEGORY_ORDER: ModuleCategory[] = ['source', 'filter', 'amplifier', 'modulator', 'envelope', 'utility', 'io'];
const CATEGORY_NAMES: Record<ModuleCategory, string> = {
  source: 'Sources', filter: 'Filters', amplifier: 'Amplifiers',
  modulator: 'Modulators', envelope: 'Envelopes', utility: 'Utility', io: 'I/O',
};

export interface PixiModularSynthEditorProps {
  config: ModularPatchConfig;
  onChange: (config: ModularPatchConfig) => void;
  width?: number;
  height?: number;
}

const pk = (r: PortRef) => `${r.moduleId}:${r.portId}`;
const getDesc = (id: string) => ModuleRegistry.get(id);
let _ctr = 0;

export const PixiModularSynthEditor: React.FC<PixiModularSynthEditorProps> = ({ config, onChange, width = 540, height = 400 }) => {
  const theme = usePixiTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('rack');
  const [wiring, setWiring] = useState<PortRef | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserCategory, setBrowserCategory] = useState<ModuleCategory | null>(null);
  const cfgRef = useRef(config);
  useEffect(() => { cfgRef.current = config; });

  const update = useCallback((p: Partial<ModularPatchConfig>) => onChange({ ...cfgRef.current, ...p }), [onChange]);

  const addModule = useCallback((descriptorId: string) => {
    const desc = getDesc(descriptorId);
    if (!desc) return;
    const id = `${descriptorId.toLowerCase()}_${++_ctr}`;
    const params: Record<string, number> = {};
    desc.parameters.forEach((p) => { params[p.id] = p.default; });
    update({ modules: [...cfgRef.current.modules, { id, descriptorId: desc.id, label: `${desc.name} ${_ctr}`, parameters: params, rackSlot: cfgRef.current.modules.length }] });
    setBrowserOpen(false);
  }, [update]);

  const removeModule = useCallback((mid: string) => {
    const c = cfgRef.current;
    update({ modules: c.modules.filter((m) => m.id !== mid), connections: c.connections.filter((cn) => cn.source.moduleId !== mid && cn.target.moduleId !== mid) });
    if (selectedModule === mid) setSelectedModule(null);
  }, [update, selectedModule]);

  const setParam = useCallback((mid: string, pid: string, v: number) => {
    update({ modules: cfgRef.current.modules.map((m) => m.id === mid ? { ...m, parameters: { ...m.parameters, [pid]: v } } : m) });
  }, [update]);

  const portClick = useCallback((ref: PortRef, dir: 'input' | 'output') => {
    if (!wiring) { setWiring(ref); return; }
    const src = dir === 'input' ? wiring : ref, tgt = dir === 'input' ? ref : wiring;
    const sd = getDesc(cfgRef.current.modules.find((m) => m.id === src.moduleId)?.descriptorId ?? '');
    const td = getDesc(cfgRef.current.modules.find((m) => m.id === tgt.moduleId)?.descriptorId ?? '');
    const sp = sd?.ports.find((p) => p.id === src.portId), tp = td?.ports.find((p) => p.id === tgt.portId);
    if (!sp || !tp || sp.direction !== 'output' || tp.direction !== 'input') { setWiring(null); return; }
    const dup = cfgRef.current.connections.some((c) => c.source.moduleId === src.moduleId && c.source.portId === src.portId && c.target.moduleId === tgt.moduleId && c.target.portId === tgt.portId);
    if (!dup) update({ connections: [...cfgRef.current.connections, { id: `${pk(src)}->${pk(tgt)}`, source: src, target: tgt, amount: 1 }] });
    setWiring(null);
  }, [wiring, update]);

  const toggleConn = useCallback((src: PortRef, tgt: PortRef) => {
    const c = cfgRef.current;
    const i = c.connections.findIndex((cn) => cn.source.moduleId === src.moduleId && cn.source.portId === src.portId && cn.target.moduleId === tgt.moduleId && cn.target.portId === tgt.portId);
    if (i >= 0) update({ connections: c.connections.filter((_, j) => j !== i) });
    else update({ connections: [...c.connections, { id: `${pk(src)}->${pk(tgt)}`, source: src, target: tgt, amount: 1 }] });
  }, [update]);

  const cycleAmount = useCallback((src: PortRef, tgt: PortRef) => {
    const c = cfgRef.current;
    const conn = c.connections.find((cn) => cn.source.moduleId === src.moduleId && cn.source.portId === src.portId && cn.target.moduleId === tgt.moduleId && cn.target.portId === tgt.portId);
    if (!conn) return;
    const amounts = [0.25, 0.5, 0.75, 1.0];
    const curIdx = amounts.findIndex((a) => Math.abs(a - conn.amount) < 0.01);
    const nextAmount = amounts[(curIdx + 1) % amounts.length];
    update({ connections: c.connections.map((cn) => cn.id === conn.id ? { ...cn, amount: nextAmount } : cn) });
  }, [update]);

  const cancelWire = useCallback(() => setWiring(null), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedModule) removeModule(selectedModule);
      }
      if (e.key === 'Escape') {
        setSelectedModule(null);
        setWiring(null);
        setBrowserOpen(false);
      }
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        if (!active || active.tagName === 'BODY' || active.tagName === 'CANVAS') {
          e.preventDefault();
          setViewMode(prev => prev === 'rack' ? 'matrix' : 'rack');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedModule, removeModule]);

  // Browser — modules grouped by category
  const modulesByCategory = useMemo(() => {
    const all = ModuleRegistry.getAll();
    const map: Partial<Record<ModuleCategory, typeof all>> = {};
    CATEGORY_ORDER.forEach((cat) => {
      const mods = all.filter((m) => m.category === cat);
      if (mods.length > 0) map[cat] = mods;
    });
    return map;
  }, []);

  const filteredBrowserModules = useMemo(() => {
    if (!browserCategory) return ModuleRegistry.getAll();
    return modulesByCategory[browserCategory] ?? [];
  }, [browserCategory, modulesByCategory]);

  const contentH = height - 30 - (wiring ? 20 : 0) - (browserOpen ? 80 : 0);

  return (
    <layoutContainer layout={{ flexDirection: 'column', width, height }}>
      {/* Toolbar */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center', height: 30 }}>
        <PixiButton label="Rack" size="sm" active={viewMode === 'rack'} onClick={() => { setViewMode('rack'); cancelWire(); }} />
        <PixiButton label="Matrix" size="sm" active={viewMode === 'matrix'} onClick={() => { setViewMode('matrix'); cancelWire(); }} />
        <layoutContainer layout={{ width: 8 }} />
        <PixiButton label={browserOpen ? '- Module' : '+ Module'} size="sm" color="green" onClick={() => setBrowserOpen(!browserOpen)} />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiLabel text={`Poly: ${config.polyphony ?? 1}`} size="xs" font="mono" color="textMuted" />
        <PixiLabel text={`${config.modules.length}m ${config.connections.length}c`} size="xs" color="textMuted" />
      </layoutContainer>

      {/* Module browser with categories */}
      {browserOpen && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 2, height: 80, backgroundColor: theme.bgSecondary.color, borderRadius: 4, padding: 4 }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 2, height: 20, flexWrap: 'wrap' }}>
            <PixiButton label="All" size="sm" active={browserCategory === null} onClick={() => setBrowserCategory(null)} />
            {CATEGORY_ORDER.map((cat) => modulesByCategory[cat] ? (
              <PixiButton key={cat} label={CATEGORY_NAMES[cat]} size="sm" active={browserCategory === cat} onClick={() => setBrowserCategory(cat)} />
            ) : null)}
          </layoutContainer>
          <PixiScrollView width={width - 8} height={48} direction="horizontal">
            <layoutContainer layout={{ flexDirection: 'row', gap: 4, height: 44, padding: 2 }}>
              {filteredBrowserModules.map((desc) => (
                <PixiButton key={desc.id} label={desc.name} size="sm" onClick={() => addModule(desc.id)} />
              ))}
            </layoutContainer>
          </PixiScrollView>
        </layoutContainer>
      )}

      {/* View */}
      {viewMode === 'rack' ? (
        <RackView modules={config.modules} connections={config.connections} width={width} height={contentH} wiring={wiring} selectedModule={selectedModule} onSelect={setSelectedModule} onPort={portClick} onParam={setParam} onRemove={removeModule} />
      ) : (
        <MatrixView modules={config.modules} connections={config.connections} width={width} height={contentH} onToggle={toggleConn} onCycleAmount={cycleAmount} onParam={setParam} />
      )}
      {/* Wiring status */}
      {wiring && (
        <layoutContainer layout={{ height: 20, flexDirection: 'row', gap: 4, alignItems: 'center', padding: 4, backgroundColor: theme.accent.color }}>
          <PixiLabel text={`Wiring from ${wiring.moduleId}:${wiring.portId}`} size="xs" color="custom" customColor={0x000000} />
          <PixiButton label="Cancel" size="sm" onClick={cancelWire} />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ── Rack View ────────────────────────────────────────────────────────────

interface RackViewProps {
  modules: ModularModuleInstance[]; connections: ModularConnection[];
  width: number; height: number; wiring: PortRef | null;
  selectedModule: string | null;
  onSelect: (id: string | null) => void;
  onPort: (ref: PortRef, dir: 'input' | 'output') => void;
  onParam: (mid: string, pid: string, v: number) => void;
  onRemove: (mid: string) => void;
}

/** Height of a module strip depending on collapse and parameter count */
const getStripH = (mod: ModularModuleInstance, collapsed: boolean) => {
  if (collapsed) return 28;
  const desc = getDesc(mod.descriptorId);
  const paramRows = Math.ceil((desc?.parameters.length ?? 0) / 4);
  return Math.max(80, 28 + paramRows * 48 + 8);
};

const RackView: React.FC<RackViewProps> = ({ modules, connections, width, height, wiring, selectedModule, onSelect, onPort, onParam, onRemove }) => {
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

  const toggleCollapse = useCallback((moduleId: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId);
      return next;
    });
  }, []);

  const portPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    let y0 = 0;
    modules.forEach((mod) => {
      const d = getDesc(mod.descriptorId); if (!d) return;
      const collapsed = collapsedModules.has(mod.id);
      const stripH = getStripH(mod, collapsed);
      if (!collapsed) {
        d.ports.filter((p) => p.direction === 'input').forEach((p, i) => m.set(pk({ moduleId: mod.id, portId: p.id }), { x: width - 40, y: y0 + 28 + i * 16 }));
        d.ports.filter((p) => p.direction === 'output').forEach((p, i) => m.set(pk({ moduleId: mod.id, portId: p.id }), { x: width - 18, y: y0 + 28 + i * 16 }));
      }
      y0 += stripH + STRIP_GAP;
    });
    return m;
  }, [modules, width, collapsedModules]);

  // Orthogonal cable routing: source → down → horizontal → up → target
  const drawCables = useCallback((g: GraphicsType) => {
    g.clear();
    connections.forEach((cn) => {
      const s = portPos.get(pk(cn.source)), t = portPos.get(pk(cn.target)); if (!s || !t) return;
      const mod = modules.find((m) => m.id === cn.source.moduleId);
      const port = mod ? getDesc(mod.descriptorId)?.ports.find((p) => p.id === cn.source.portId) : undefined;
      const clr = SIG_CLR[port?.signal ?? 'audio'];
      const midY = (s.y + t.y) / 2;
      g.moveTo(s.x, s.y);
      g.lineTo(s.x, midY);
      g.lineTo(t.x, midY);
      g.lineTo(t.x, t.y);
      g.stroke({ color: clr, alpha: 0.8 * cn.amount, width: 2 });
    });
  }, [connections, portPos, modules]);

  const totalH = modules.reduce((acc, mod) => acc + getStripH(mod, collapsedModules.has(mod.id)) + STRIP_GAP, 10);

  return (
    <PixiScrollView width={width} height={height} contentHeight={totalH}>
      <layoutContainer layout={{ flexDirection: 'column', gap: STRIP_GAP, width }}>
        {modules.map((mod) => (
          <ModuleStrip
            key={mod.id} mod={mod} width={width} wiring={wiring}
            collapsed={collapsedModules.has(mod.id)}
            selected={selectedModule === mod.id}
            onToggleCollapse={toggleCollapse}
            onSelect={onSelect}
            onPort={onPort} onParam={onParam} onRemove={onRemove}
          />
        ))}
      </layoutContainer>
      <pixiGraphics draw={drawCables} layout={{ position: 'absolute', left: 0, top: 0 }} />
    </PixiScrollView>
  );
};

// ── Module Strip ─────────────────────────────────────────────────────────

const ModuleStrip: React.FC<{
  mod: ModularModuleInstance; width: number; wiring: PortRef | null;
  collapsed: boolean; selected: boolean;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onPort: (r: PortRef, d: 'input' | 'output') => void;
  onParam: (m: string, p: string, v: number) => void;
  onRemove: (m: string) => void;
}> = ({ mod, width, wiring, collapsed, selected, onToggleCollapse, onSelect, onPort, onParam, onRemove }) => {
  const theme = usePixiTheme();
  const desc = getDesc(mod.descriptorId); if (!desc) return null;
  const clr = desc.color ? parseInt(desc.color.replace('#', ''), 16) : theme.accent.color;
  const ins = desc.ports.filter((p) => p.direction === 'input');
  const outs = desc.ports.filter((p) => p.direction === 'output');
  const borderClr = selected ? theme.accent.color : theme.border.color;
  const paramRows = Math.ceil(desc.parameters.length / 4);
  const bodyH = collapsed ? 0 : Math.max(52, paramRows * 48 + 8);
  const stripH = collapsed ? 28 : 28 + bodyH;

  return (
    <layoutContainer
      layout={{ flexDirection: 'column', height: stripH, width, backgroundColor: theme.bgSecondary.color, borderRadius: 4, borderWidth: selected ? 2 : 1, borderColor: borderClr, overflow: 'hidden' }}
      eventMode="static" cursor="pointer" onPointerUp={() => onSelect(mod.id)}
    >
      {/* Header */}
      <layoutContainer layout={{ flexDirection: 'row', height: 28, alignItems: 'center', gap: 4, padding: 4, borderBottomWidth: collapsed ? 0 : 1, borderColor: theme.border.color, backgroundColor: clr }}>
        <PixiButton label={collapsed ? '+' : '-'} variant="ghost" width={24} onClick={() => onToggleCollapse(mod.id)} />
        <PixiLabel text={mod.label || desc.name} size="xs" weight="bold" color="custom" customColor={0xffffff} />
        <PixiLabel text={CATEGORY_NAMES[desc.category]} size="xs" color="custom" customColor={0xcccccc} />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiButton label="Del" size="sm" color="red" onClick={() => onRemove(mod.id)} />
      </layoutContainer>

      {/* Body (collapsible) — shows ALL parameters */}
      {!collapsed && (
        <layoutContainer layout={{ flexDirection: 'row', height: bodyH, padding: 6, gap: 6, alignItems: 'flex-start' }}>
          <layoutContainer layout={{ flexDirection: 'row', gap: 4, flex: 1, flexWrap: 'wrap' }}>
            {desc.parameters.map((p) => (
              <PixiKnob key={p.id} value={mod.parameters[p.id] ?? p.default} min={p.min} max={p.max} onChange={(v) => onParam(mod.id, p.id, v)} label={p.name.slice(0, 6)} size="sm" unit={p.unit} />
            ))}
          </layoutContainer>
          <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
            <PortColumn label="IN" ports={ins} moduleId={mod.id} wiring={wiring} onPort={onPort} />
            <PortColumn label="OUT" ports={outs} moduleId={mod.id} wiring={wiring} onPort={onPort} />
          </layoutContainer>
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

const PortColumn: React.FC<{ label: string; ports: ModulePortDef[]; moduleId: string; wiring: PortRef | null; onPort: (r: PortRef, d: 'input' | 'output') => void }> = ({ label, ports, moduleId, wiring, onPort }) => (
  <layoutContainer layout={{ flexDirection: 'column', gap: 3, alignItems: 'center' }}>
    <PixiLabel text={label} size="xs" color="textMuted" />
    {ports.map((p) => {
      const active = wiring?.moduleId === moduleId && wiring?.portId === p.id;
      return (
        <layoutContainer key={p.id} layout={{ width: 14, height: 14 }} eventMode="static" cursor="pointer" onPointerUp={() => onPort({ moduleId, portId: p.id }, p.direction)}>
          <pixiGraphics draw={useCallback((g: GraphicsType) => { g.clear(); g.circle(6, 6, PORT_R); g.fill({ color: SIG_CLR[p.signal], alpha: active ? 1 : 0.7 }); if (active) { g.circle(6, 6, PORT_R + 2); g.stroke({ color: 0xffffff, width: 1.5 }); } }, [active, p.signal])} layout={{}} />
        </layoutContainer>
      );
    })}
  </layoutContainer>
);

// ── Matrix View ──────────────────────────────────────────────────────────

const MatrixView: React.FC<{
  modules: ModularModuleInstance[]; connections: ModularConnection[];
  width: number; height: number;
  onToggle: (s: PortRef, t: PortRef) => void;
  onCycleAmount: (s: PortRef, t: PortRef) => void;
  onParam: (m: string, p: string, v: number) => void;
}> = ({ modules, connections, width, height, onToggle, onCycleAmount, onParam }) => {
  const theme = usePixiTheme();
  const [selMod, setSelMod] = useState<string | null>(null);

  const outs = useMemo(() => {
    const r: { ref: PortRef; label: string; sig: SignalType }[] = [];
    modules.forEach((m) => getDesc(m.descriptorId)?.ports.filter((p) => p.direction === 'output').forEach((p) => r.push({ ref: { moduleId: m.id, portId: p.id }, label: `${(m.label || m.id).slice(0, 6)}.${p.name}`, sig: p.signal })));
    return r;
  }, [modules]);

  const ins = useMemo(() => {
    const r: { ref: PortRef; label: string; sig: SignalType }[] = [];
    modules.forEach((m) => getDesc(m.descriptorId)?.ports.filter((p) => p.direction === 'input').forEach((p) => r.push({ ref: { moduleId: m.id, portId: p.id }, label: `${(m.label || m.id).slice(0, 6)}.${p.name}`, sig: p.signal })));
    return r;
  }, [modules]);

  const connMap = useMemo(() => {
    const m = new Map<string, ModularConnection>();
    connections.forEach((c) => m.set(`${pk(c.source)}|${pk(c.target)}`, c));
    return m;
  }, [connections]);
  const getConn = (s: PortRef, t: PortRef) => connMap.get(`${pk(s)}|${pk(t)}`);

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();
    for (let i = 0; i <= ins.length; i++) { g.moveTo(HDR + i * CELL, HDR); g.lineTo(HDR + i * CELL, HDR + outs.length * CELL); g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 }); }
    for (let j = 0; j <= outs.length; j++) { g.moveTo(HDR, HDR + j * CELL); g.lineTo(HDR + ins.length * CELL, HDR + j * CELL); g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 }); }
    outs.forEach((o, oi) => ins.forEach((inp, ii) => {
      const conn = getConn(o.ref, inp.ref);
      if (conn) {
        const r = 4 + 3 * conn.amount;
        g.circle(HDR + ii * CELL + CELL / 2, HDR + oi * CELL + CELL / 2, r);
        g.fill({ color: SIG_CLR[o.sig], alpha: 0.5 + 0.4 * conn.amount });
      }
    }));
  }, [ins, outs, connMap, theme]);

  const cW = HDR + ins.length * CELL + 10, cH = HDR + outs.length * CELL + 10;
  const sideW = 110, matW = width - sideW - 8;
  const selModule = modules.find((m) => m.id === selMod);
  const selDesc = selModule ? getDesc(selModule.descriptorId) : undefined;

  // Left-click empty cell → create, left-click connected cell → cycle amount
  const handleCellClick = useCallback((o: { ref: PortRef; sig: SignalType }, inp: { ref: PortRef; sig: SignalType }) => {
    const conn = getConn(o.ref, inp.ref);
    if (conn) onCycleAmount(o.ref, inp.ref);
    else onToggle(o.ref, inp.ref);
  }, [getConn, onCycleAmount, onToggle]);

  return (
    <layoutContainer layout={{ flexDirection: 'row', gap: 8, width, height }}>
      <PixiScrollView width={matW} height={height} contentWidth={cW} contentHeight={cH} direction="both">
        <layoutContainer layout={{ width: cW, height: cH }}>
          {ins.map((inp, i) => (
            <layoutContainer key={`c${i}`} layout={{ position: 'absolute', left: HDR + i * CELL, top: 2, width: CELL, height: HDR - 4 }} eventMode="static" cursor="pointer" onPointerUp={() => setSelMod(inp.ref.moduleId)}>
              <PixiLabel text={inp.label.slice(0, 8)} size="xs" color="custom" customColor={SIG_CLR[inp.sig]} />
            </layoutContainer>
          ))}
          {outs.map((out, i) => (
            <layoutContainer key={`r${i}`} layout={{ position: 'absolute', left: 2, top: HDR + i * CELL + 3, width: HDR - 4 }} eventMode="static" cursor="pointer" onPointerUp={() => setSelMod(out.ref.moduleId)}>
              <PixiLabel text={out.label.slice(0, 10)} size="xs" color="custom" customColor={SIG_CLR[out.sig]} />
            </layoutContainer>
          ))}
          <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', left: 0, top: 0 }} />
          {/* Cell hit areas + amount labels for connected cells */}
          {outs.map((o, oi) => ins.map((inp, ii) => {
            const conn = getConn(o.ref, inp.ref);
            return (
              <layoutContainer key={`${oi}-${ii}`} layout={{ position: 'absolute', left: HDR + ii * CELL, top: HDR + oi * CELL, width: CELL, height: CELL, justifyContent: 'center', alignItems: 'center' }} eventMode="static" cursor="pointer" onPointerUp={() => handleCellClick(o, inp)}>
                {conn && <PixiLabel text={conn.amount < 1 ? conn.amount.toFixed(2) : '1'} size="xs" color="custom" customColor={0xffffff} />}
              </layoutContainer>
            );
          }))}
        </layoutContainer>
      </PixiScrollView>
      <layoutContainer layout={{ width: sideW, flexDirection: 'column', gap: 6, padding: 6, backgroundColor: theme.bgSecondary.color, borderRadius: 4 }}>
        {selModule && selDesc ? (
          <>
            <PixiLabel text={selModule.label || selDesc.name} size="xs" weight="bold" color="text" />
            {selDesc.parameters.map((p) => (
              <PixiKnob key={p.id} value={selModule.parameters[p.id] ?? p.default} min={p.min} max={p.max} onChange={(v) => onParam(selModule.id, p.id, v)} label={p.name.slice(0, 8)} size="sm" unit={p.unit} />
            ))}
          </>
        ) : (
          <PixiLabel text="Click a label to edit params" size="xs" color="textMuted" />
        )}
      </layoutContainer>
    </layoutContainer>
  );
};
