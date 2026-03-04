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
type ViewMode = 'rack' | 'matrix' | 'canvas';

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
  const updateModules = useCallback((mods: ModularModuleInstance[]) => update({ modules: mods }), [update]);

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
          setViewMode(prev => prev === 'rack' ? 'matrix' : prev === 'matrix' ? 'canvas' : 'rack');
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

  const contentH = height - 30 - (wiring ? 20 : 0) - (browserOpen ? 200 : 0);

  return (
    <layoutContainer layout={{ flexDirection: 'column', width, height }}>
      {/* Toolbar */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center', height: 30 }}>
        <PixiButton label="Rack" size="sm" active={viewMode === 'rack'} onClick={() => { setViewMode('rack'); cancelWire(); }} />
        <PixiButton label="Matrix" size="sm" active={viewMode === 'matrix'} onClick={() => { setViewMode('matrix'); cancelWire(); }} />
        <PixiButton label="Canvas" size="sm" active={viewMode === 'canvas'} onClick={() => { setViewMode('canvas'); cancelWire(); }} />
        <layoutContainer layout={{ width: 8 }} />
        <PixiButton label={browserOpen ? '- Module' : '+ Module'} size="sm" color="green" onClick={() => setBrowserOpen(!browserOpen)} />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiLabel text={`Poly: ${config.polyphony ?? 1}`} size="xs" font="mono" color="textMuted" />
        <PixiLabel text={`${config.modules.length}m ${config.connections.length}c`} size="xs" color="textMuted" />
      </layoutContainer>

      {/* Module browser — dropdown panel with categories */}
      {browserOpen && (
        <layoutContainer layout={{ flexDirection: 'column', gap: 4, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.border?.color ?? 0x444444, backgroundColor: theme.bgSecondary?.color ?? 0x1a1a1a, width: width, maxHeight: 200 }}>
          {/* Category tabs */}
          <layoutContainer layout={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            <PixiButton label="All" size="sm" active={browserCategory === null} onClick={() => setBrowserCategory(null)} />
            {CATEGORY_ORDER.map((cat) => modulesByCategory[cat] ? (
              <PixiButton key={cat} label={CATEGORY_NAMES[cat]} size="sm" active={browserCategory === cat} onClick={() => setBrowserCategory(cat)} />
            ) : null)}
          </layoutContainer>
          {/* Module list */}
          <PixiScrollView width={width - 16} height={148} direction="vertical">
            <layoutContainer layout={{ flexDirection: 'column', gap: 2 }}>
              {filteredBrowserModules.map((desc) => (
                <layoutContainer key={desc.id} layout={{ flexDirection: 'row', gap: 6, alignItems: 'center', padding: 4, borderRadius: 3 }}
                  eventMode="static" cursor="pointer" onPointerUp={() => { addModule(desc.id); setBrowserOpen(false); }}>
                  <PixiLabel text={desc.name} size="xs" weight="bold" color="text" />
                  <PixiLabel text={CATEGORY_NAMES[desc.category]} size="xs" color="textMuted" />
                </layoutContainer>
              ))}
            </layoutContainer>
          </PixiScrollView>
        </layoutContainer>
      )}

      {/* View */}
      {viewMode === 'rack' ? (
        <RackView modules={config.modules} connections={config.connections} width={width} height={contentH} wiring={wiring} selectedModule={selectedModule} onSelect={setSelectedModule} onPort={portClick} onParam={setParam} onRemove={removeModule} onReorder={updateModules} />
      ) : viewMode === 'matrix' ? (
        <MatrixView modules={config.modules} connections={config.connections} width={width} height={contentH} onToggle={toggleConn} onCycleAmount={cycleAmount} onParam={setParam} />
      ) : (
        <CanvasView modules={config.modules} connections={config.connections} width={width} height={contentH} wiring={wiring} selectedModule={selectedModule} onSelect={setSelectedModule} onPort={portClick} onParam={setParam} onRemove={removeModule} onUpdateModules={updateModules} />
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
  onReorder: (modules: ModularModuleInstance[]) => void;
}

/** Height of a module strip depending on collapse and parameter count */
const getStripH = (mod: ModularModuleInstance, collapsed: boolean) => {
  if (collapsed) return 28;
  const desc = getDesc(mod.descriptorId);
  const paramRows = Math.ceil((desc?.parameters.length ?? 0) / 4);
  return Math.max(80, 28 + paramRows * 48 + 8);
};

const RackView: React.FC<RackViewProps> = ({ modules, connections, width, height, wiring, selectedModule, onSelect, onPort, onParam, onRemove, onReorder }) => {
  const theme = usePixiTheme();
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);

  const toggleCollapse = useCallback((moduleId: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId);
      return next;
    });
  }, []);

  // Rack drag reorder state
  const [dragReorderIdx, setDragReorderIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleReorderEnd = useCallback(() => {
    if (dragReorderIdx !== null && dragOverIdx !== null && dragReorderIdx !== dragOverIdx) {
      const newModules = [...modules];
      const [moved] = newModules.splice(dragReorderIdx, 1);
      newModules.splice(dragOverIdx, 0, moved);
      onReorder(newModules);
    }
    setDragReorderIdx(null);
    setDragOverIdx(null);
  }, [dragReorderIdx, dragOverIdx, modules, onReorder]);

  useEffect(() => {
    if (dragReorderIdx === null) return;
    const handler = () => handleReorderEnd();
    window.addEventListener('pointerup', handler);
    return () => window.removeEventListener('pointerup', handler);
  }, [dragReorderIdx, handleReorderEnd]);

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
    connections.forEach((cn, ci) => {
      const s = portPos.get(pk(cn.source)), t = portPos.get(pk(cn.target)); if (!s || !t) return;
      const mod = modules.find((m) => m.id === cn.source.moduleId);
      const port = mod ? getDesc(mod.descriptorId)?.ports.find((p) => p.id === cn.source.portId) : undefined;
      const clr = SIG_CLR[port?.signal ?? 'audio'];
      const laneOffset = (ci % 8 - 3.5) * 6;
      const midY = (s.y + t.y) / 2 + laneOffset;
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
        {modules.map((mod, idx) => {
          const showBefore = dragOverIdx === idx && dragReorderIdx !== null && dragReorderIdx > idx;
          const showAfter = dragOverIdx === idx && dragReorderIdx !== null && dragReorderIdx < idx;
          return (
            <layoutContainer key={mod.id} layout={{ flexDirection: 'column', width }}>
              {showBefore && <layoutContainer layout={{ height: 3, width, backgroundColor: theme.accent.color, borderRadius: 1 }} />}
              <ModuleStrip
                mod={mod} width={width} wiring={wiring}
                collapsed={collapsedModules.has(mod.id)}
                selected={selectedModule === mod.id}
                hovered={hoveredModule === mod.id}
                isDragging={dragReorderIdx === idx}
                isDropTarget={dragOverIdx === idx && dragReorderIdx !== null && dragReorderIdx !== idx}
                onToggleCollapse={toggleCollapse}
                onSelect={onSelect}
                onPort={onPort} onParam={onParam} onRemove={onRemove}
                onReorderStart={() => setDragReorderIdx(idx)}
                onReorderOver={() => { if (dragReorderIdx !== null) setDragOverIdx(idx); }}
                onHover={setHoveredModule}
              />
              {showAfter && <layoutContainer layout={{ height: 3, width, backgroundColor: theme.accent.color, borderRadius: 1 }} />}
            </layoutContainer>
          );
        })}
      </layoutContainer>
      <pixiGraphics draw={drawCables} layout={{ position: 'absolute', left: 0, top: 0 }} />
    </PixiScrollView>
  );
};

// ── Module Strip ─────────────────────────────────────────────────────────

const ModuleStrip: React.FC<{
  mod: ModularModuleInstance; width: number; wiring: PortRef | null;
  collapsed: boolean; selected: boolean; hovered: boolean;
  isDragging?: boolean; isDropTarget?: boolean;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onPort: (r: PortRef, d: 'input' | 'output') => void;
  onParam: (m: string, p: string, v: number) => void;
  onRemove: (m: string) => void;
  onReorderStart?: () => void;
  onReorderOver?: () => void;
  onHover?: (id: string | null) => void;
}> = ({ mod, width, wiring, collapsed, selected, hovered, isDragging, isDropTarget, onToggleCollapse, onSelect, onPort, onParam, onRemove, onReorderStart, onReorderOver, onHover }) => {
  const theme = usePixiTheme();
  const desc = getDesc(mod.descriptorId); if (!desc) return null;
  const clr = desc.color ? parseInt(desc.color.replace('#', ''), 16) : theme.accent.color;
  const ins = desc.ports.filter((p) => p.direction === 'input');
  const outs = desc.ports.filter((p) => p.direction === 'output');
  const borderClr = isDropTarget ? theme.accent.color : selected ? theme.accent.color : theme.border.color;
  const paramRows = Math.ceil(desc.parameters.length / 4);
  const bodyH = collapsed ? 0 : Math.max(52, paramRows * 48 + 8);
  const stripH = collapsed ? 28 : 28 + bodyH;

  const stripBg = hovered && !selected ? 0x222222 : theme.bgSecondary.color;

  return (
    <layoutContainer
      layout={{ flexDirection: 'column', height: stripH, width, backgroundColor: stripBg, borderRadius: 4, borderWidth: selected || isDropTarget ? 2 : 1, borderColor: borderClr, overflow: 'hidden' }}
      alpha={isDragging ? 0.5 : 1}
      eventMode="static" cursor="pointer"
      onPointerUp={() => onSelect(mod.id)}
      onPointerOver={() => { if (onReorderOver) onReorderOver(); if (onHover) onHover(mod.id); }}
      onPointerOut={() => { if (onHover) onHover(null); }}
    >
      {/* Header — drag handle for reorder */}
      <layoutContainer layout={{ flexDirection: 'row', height: 28, alignItems: 'center', gap: 4, padding: 4, borderBottomWidth: collapsed ? 0 : 1, borderColor: theme.border.color, backgroundColor: clr }}
        eventMode="static" cursor="grab"
        onPointerDown={(e: any) => { if (e.button === 0 && onReorderStart) onReorderStart(); }}
      >
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
          <pixiGraphics eventMode="none" draw={useCallback((g: GraphicsType) => { g.clear(); g.circle(6, 6, PORT_R); g.fill({ color: SIG_CLR[p.signal], alpha: active ? 1 : 0.7 }); if (active) { g.circle(6, 6, PORT_R + 2); g.stroke({ color: 0xffffff, width: 1.5 }); } }, [active, p.signal])} layout={{}} />
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

// ── Canvas View ──────────────────────────────────────────────────────────

const CANVAS_MODULE_W = 180, CANVAS_HDR_H = 24, CANVAS_PORT_SP = 16;

interface CanvasViewProps {
  modules: ModularModuleInstance[]; connections: ModularConnection[];
  width: number; height: number; wiring: PortRef | null;
  selectedModule: string | null;
  onSelect: (id: string | null) => void;
  onPort: (ref: PortRef, dir: 'input' | 'output') => void;
  onParam: (mid: string, pid: string, v: number) => void;
  onRemove: (mid: string) => void;
  onUpdateModules: (modules: ModularModuleInstance[]) => void;
}

const CanvasView: React.FC<CanvasViewProps> = ({ modules, connections, width, height, wiring, selectedModule, onSelect, onPort, onParam, onRemove, onUpdateModules }) => {
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const draggingModuleRef = useRef<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const canvasOffsetRef = useRef({ x: 0, y: 0 });
  const canvasZoomRef = useRef(1);
  const modulesRef = useRef(modules);

  useEffect(() => { canvasOffsetRef.current = canvasOffset; }, [canvasOffset]);
  useEffect(() => { canvasZoomRef.current = canvasZoom; }, [canvasZoom]);
  useEffect(() => { modulesRef.current = modules; }, [modules]);

  // Auto-layout modules without positions
  useEffect(() => {
    if (!modules.some(m => !m.position)) return;
    onUpdateModules(modules.map((m, i) => m.position ? m : { ...m, position: { x: 20 + (i % 4) * 200, y: 20 + Math.floor(i / 4) * 160 } }));
  }, [modules.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit to view
  const fitToView = useCallback(() => {
    if (modules.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    modules.forEach(m => {
      const px = m.position?.x ?? 0, py = m.position?.y ?? 0;
      minX = Math.min(minX, px); minY = Math.min(minY, py);
      maxX = Math.max(maxX, px + CANVAS_MODULE_W); maxY = Math.max(maxY, py + 200);
    });
    const cw = maxX - minX + 60, ch = maxY - minY + 60;
    const z = Math.max(0.25, Math.min(3, Math.min(width / cw, height / ch)));
    setCanvasZoom(z);
    setCanvasOffset({ x: width / 2 - ((minX + maxX) / 2) * z, y: height / 2 - ((minY + maxY) / 2) * z });
  }, [modules, width, height]);

  // F key for fit-to-view
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        const el = document.activeElement;
        if (!el || el.tagName === 'BODY' || el.tagName === 'CANVAS') fitToView();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fitToView]);

  // Global pointerup safety
  useEffect(() => {
    const handler = () => { isPanningRef.current = false; draggingModuleRef.current = null; };
    window.addEventListener('pointerup', handler);
    return () => window.removeEventListener('pointerup', handler);
  }, []);

  const handleBgDown = useCallback((e: any) => {
    if (e.button === 1 || e.button === 2) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.global.x - canvasOffsetRef.current.x, y: e.global.y - canvasOffsetRef.current.y };
    } else if (e.button === 0) {
      onSelect(null);
    }
  }, [onSelect]);

  const handleBgMove = useCallback((e: any) => {
    if (isPanningRef.current) {
      setCanvasOffset({ x: e.global.x - panStartRef.current.x, y: e.global.y - panStartRef.current.y });
    } else if (draggingModuleRef.current) {
      const off = canvasOffsetRef.current, z = canvasZoomRef.current;
      const newX = (e.global.x - off.x) / z - dragOffsetRef.current.x;
      const newY = (e.global.y - off.y) / z - dragOffsetRef.current.y;
      const newModules = modulesRef.current.map(m => m.id === draggingModuleRef.current ? { ...m, position: { x: newX, y: newY } } : m);
      modulesRef.current = newModules;
      onUpdateModules(newModules);
    }
  }, [onUpdateModules]);

  const handleBgUp = useCallback(() => {
    isPanningRef.current = false;
    draggingModuleRef.current = null;
  }, []);

  const handleWheel = useCallback((e: any) => {
    const dy = e.deltaY ?? 0;
    setCanvasZoom(z => Math.max(0.25, Math.min(3, z * (dy > 0 ? 0.9 : 1.1))));
  }, []);

  const handleModuleDragStart = useCallback((moduleId: string, e: any) => {
    draggingModuleRef.current = moduleId;
    const pos = modulesRef.current.find(m => m.id === moduleId)?.position || { x: 0, y: 0 };
    const off = canvasOffsetRef.current, z = canvasZoomRef.current;
    dragOffsetRef.current = { x: (e.global.x - off.x) / z - pos.x, y: (e.global.y - off.y) / z - pos.y };
    onSelect(moduleId);
  }, [onSelect]);

  // Port positions in world space for cable drawing
  const getPortPos = useCallback((ref: PortRef): { x: number; y: number } | null => {
    const mod = modules.find(m => m.id === ref.moduleId);
    if (!mod) return null;
    const desc = getDesc(mod.descriptorId); if (!desc) return null;
    const pos = mod.position || { x: 0, y: 0 };
    const port = desc.ports.find(p => p.id === ref.portId); if (!port) return null;
    const sameDir = desc.ports.filter(p => p.direction === port.direction);
    const idx = sameDir.indexOf(port);
    return port.direction === 'input'
      ? { x: pos.x + 8, y: pos.y + CANVAS_HDR_H + 8 + idx * CANVAS_PORT_SP }
      : { x: pos.x + CANVAS_MODULE_W - 8, y: pos.y + CANVAS_HDR_H + 8 + idx * CANVAS_PORT_SP };
  }, [modules]);

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();
    const baseGrid = 40;
    const gridSize = baseGrid * canvasZoom;
    if (gridSize < 4) return;
    const majorEvery = 4;
    const ox = ((canvasOffset.x % gridSize) + gridSize) % gridSize;
    const oy = ((canvasOffset.y % gridSize) + gridSize) % gridSize;
    // Minor grid lines
    for (let x = ox; x < width; x += gridSize) {
      const worldX = (x - canvasOffset.x) / canvasZoom;
      const isMajor = Math.abs(Math.round(worldX / baseGrid) % majorEvery) === 0;
      if (!isMajor) g.moveTo(x, 0).lineTo(x, height).stroke({ color: 0x222222, width: 0.5 });
    }
    for (let y = oy; y < height; y += gridSize) {
      const worldY = (y - canvasOffset.y) / canvasZoom;
      const isMajor = Math.abs(Math.round(worldY / baseGrid) % majorEvery) === 0;
      if (!isMajor) g.moveTo(0, y).lineTo(width, y).stroke({ color: 0x222222, width: 0.5 });
    }
    // Major grid lines
    for (let x = ox; x < width; x += gridSize) {
      const worldX = (x - canvasOffset.x) / canvasZoom;
      if (Math.abs(Math.round(worldX / baseGrid) % majorEvery) === 0) {
        g.moveTo(x, 0).lineTo(x, height).stroke({ color: 0x333333, width: 1 });
      }
    }
    for (let y = oy; y < height; y += gridSize) {
      const worldY = (y - canvasOffset.y) / canvasZoom;
      if (Math.abs(Math.round(worldY / baseGrid) % majorEvery) === 0) {
        g.moveTo(0, y).lineTo(width, y).stroke({ color: 0x333333, width: 1 });
      }
    }
  }, [canvasOffset, canvasZoom, width, height]);

  const drawCables = useCallback((g: GraphicsType) => {
    g.clear();
    connections.forEach((cn, ci) => {
      const s = getPortPos(cn.source), t = getPortPos(cn.target); if (!s || !t) return;
      const mod = modules.find(m => m.id === cn.source.moduleId);
      const port = mod ? getDesc(mod.descriptorId)?.ports.find(p => p.id === cn.source.portId) : undefined;
      const clr = SIG_CLR[port?.signal ?? 'audio'];
      const laneOffset = (ci % 8 - 3.5) * 6;
      const midY = (s.y + t.y) / 2 + laneOffset;
      g.moveTo(s.x, s.y).lineTo(s.x + 20, s.y).lineTo(s.x + 20, midY).lineTo(t.x - 20, midY).lineTo(t.x - 20, t.y).lineTo(t.x, t.y);
      g.stroke({ color: clr, alpha: 0.8 * cn.amount, width: 2 });
    });
  }, [connections, modules, getPortPos]);

  return (
    <layoutContainer layout={{ width, height, overflow: 'hidden' }} eventMode="static"
      onPointerDown={handleBgDown} onPointerMove={handleBgMove} onPointerUp={handleBgUp} onWheel={handleWheel}>
      <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', left: 0, top: 0 }} />
      <pixiContainer x={canvasOffset.x} y={canvasOffset.y} scale={canvasZoom}>
        <pixiGraphics draw={drawCables} />
        {modules.map(mod => (
          <CanvasModuleCard key={mod.id} mod={mod} selectedModule={selectedModule} wiring={wiring}
            onDragStart={handleModuleDragStart} onSelect={onSelect} onPort={onPort} onParam={onParam} onRemove={onRemove} />
        ))}
      </pixiContainer>
      {modules.length === 0 && (
        <layoutContainer layout={{ position: 'absolute', left: 0, top: 0, width, height, justifyContent: 'center', alignItems: 'center' }}>
          <PixiLabel text="No modules. Click +Module to start." size="xs" color="textMuted" />
        </layoutContainer>
      )}
    </layoutContainer>
  );
};

// ── Canvas Module Card ───────────────────────────────────────────────────

const CanvasModuleCard: React.FC<{
  mod: ModularModuleInstance; selectedModule: string | null; wiring: PortRef | null;
  onDragStart: (id: string, e: any) => void;
  onSelect: (id: string) => void;
  onPort: (ref: PortRef, dir: 'input' | 'output') => void;
  onParam: (mid: string, pid: string, v: number) => void;
  onRemove: (mid: string) => void;
}> = ({ mod, selectedModule, wiring, onDragStart, onSelect: _onSelect, onPort, onParam, onRemove: _onRemove }) => {
  const theme = usePixiTheme();
  const desc = getDesc(mod.descriptorId); if (!desc) return null;
  const pos = mod.position || { x: 0, y: 0 };
  const clr = desc.color ? parseInt(desc.color.replace('#', ''), 16) : theme.accent.color;
  const ins = desc.ports.filter(p => p.direction === 'input');
  const outs = desc.ports.filter(p => p.direction === 'output');
  const sel = selectedModule === mod.id;
  const portCount = Math.max(ins.length, outs.length);
  const keyParams = desc.parameters.slice(0, 3);
  const cardH = CANVAS_HDR_H + Math.max(portCount * CANVAS_PORT_SP + 8, 40) + (keyParams.length > 0 ? 44 : 0);

  return (
    <pixiContainer x={pos.x} y={pos.y}>
      <layoutContainer
        layout={{ width: CANVAS_MODULE_W, height: cardH, flexDirection: 'column', backgroundColor: theme.bgSecondary.color, borderRadius: 4, borderWidth: sel ? 2 : 1, borderColor: sel ? theme.accent.color : theme.border.color, overflow: 'hidden' }}
        eventMode="static" cursor="move"
        onPointerDown={(e: any) => { if (e.button === 0) { e.stopPropagation(); onDragStart(mod.id, e); } }}
      >
        {/* Header */}
        <layoutContainer layout={{ height: CANVAS_HDR_H, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, backgroundColor: clr }}>
          <PixiLabel text={mod.label || desc.name} size="xs" weight="bold" color="custom" customColor={0xffffff} />
          <layoutContainer layout={{ flex: 1 }} />
          <PixiLabel text={desc.category.slice(0, 3).toUpperCase()} size="xs" color="custom" customColor={0xdddddd} />
        </layoutContainer>
        {/* Ports */}
        <layoutContainer layout={{ flexDirection: 'row', flex: 1, padding: 4, justifyContent: 'space-between' }}>
          <PortColumn label="IN" ports={ins} moduleId={mod.id} wiring={wiring} onPort={onPort} />
          <PortColumn label="OUT" ports={outs} moduleId={mod.id} wiring={wiring} onPort={onPort} />
        </layoutContainer>
        {/* Key parameters */}
        {keyParams.length > 0 && (
          <layoutContainer layout={{ flexDirection: 'row', gap: 4, padding: 4, height: 44 }}>
            {keyParams.map(p => (
              <PixiKnob key={p.id} value={mod.parameters[p.id] ?? p.default} min={p.min} max={p.max} onChange={(v) => onParam(mod.id, p.id, v)} label={p.name.slice(0, 5)} size="sm" />
            ))}
          </layoutContainer>
        )}
      </layoutContainer>
    </pixiContainer>
  );
};
