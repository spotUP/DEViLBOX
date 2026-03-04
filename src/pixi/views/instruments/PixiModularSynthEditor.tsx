/**
 * PixiModularSynthEditor — GL-native modular synth patch editor.
 * Two view modes: Rack (module strips + cable lines) and Matrix (connection grid).
 * Uses configRef pattern for stale-state prevention per CLAUDE.md.
 */
import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PixiButton, PixiLabel, PixiKnob, PixiScrollView, PixiSelect, type SelectOption } from '../../components';
import { ModuleRegistry } from '../../../engine/modular/ModuleRegistry';
import { registerBuiltInModules } from '../../../engine/modular/modules';
import type { ModularPatchConfig, ModularModuleInstance, ModularConnection, ModulePortDef, SignalType, PortRef } from '../../../types/modular';

registerBuiltInModules();

const STRIP_H = 80, STRIP_GAP = 4, PORT_R = 5, CELL = 22, HDR = 56;
const SIG_CLR: Record<SignalType, number> = { audio: 0x44aaff, cv: 0xff8844, gate: 0x44ff44, trigger: 0xff4444 };
type ViewMode = 'rack' | 'matrix';

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
  const [addType, setAddType] = useState('VCO');
  const cfgRef = useRef(config);
  useEffect(() => { cfgRef.current = config; });

  const modOpts = useMemo<SelectOption[]>(() => ModuleRegistry.getAll().map((d) => ({ value: d.id, label: d.name })), []);

  const update = useCallback((p: Partial<ModularPatchConfig>) => onChange({ ...cfgRef.current, ...p }), [onChange]);

  const addModule = useCallback(() => {
    const desc = getDesc(addType);
    if (!desc) return;
    const id = `${addType.toLowerCase()}_${++_ctr}`;
    const params: Record<string, number> = {};
    desc.parameters.forEach((p) => { params[p.id] = p.default; });
    update({ modules: [...cfgRef.current.modules, { id, descriptorId: desc.id, label: `${desc.name} ${_ctr}`, parameters: params, rackSlot: cfgRef.current.modules.length }] });
  }, [addType, update]);

  const removeModule = useCallback((mid: string) => {
    const c = cfgRef.current;
    update({ modules: c.modules.filter((m) => m.id !== mid), connections: c.connections.filter((cn) => cn.source.moduleId !== mid && cn.target.moduleId !== mid) });
  }, [update]);

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

  const cancelWire = useCallback(() => setWiring(null), []);
  const contentH = height - 30 - (wiring ? 20 : 0);

  return (
    <layoutContainer layout={{ flexDirection: 'column', width, height }}>
      {/* Toolbar */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center', height: 30 }}>
        <PixiButton label="Rack" size="sm" active={viewMode === 'rack'} onClick={() => { setViewMode('rack'); cancelWire(); }} />
        <PixiButton label="Matrix" size="sm" active={viewMode === 'matrix'} onClick={() => { setViewMode('matrix'); cancelWire(); }} />
        <layoutContainer layout={{ flex: 1 }} />
        <PixiSelect options={modOpts} value={addType} onChange={setAddType} width={130} />
        <PixiButton label="Add" size="sm" color="green" onClick={addModule} />
        <PixiLabel text={`${config.modules.length}m ${config.connections.length}c`} size="xs" color="textMuted" />
      </layoutContainer>
      {/* View */}
      {viewMode === 'rack' ? (
        <RackView modules={config.modules} connections={config.connections} width={width} height={contentH} wiring={wiring} onPort={portClick} onParam={setParam} onRemove={removeModule} />
      ) : (
        <MatrixView modules={config.modules} connections={config.connections} width={width} height={contentH} onToggle={toggleConn} onParam={setParam} />
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
  onPort: (ref: PortRef, dir: 'input' | 'output') => void;
  onParam: (mid: string, pid: string, v: number) => void;
  onRemove: (mid: string) => void;
}

const RackView: React.FC<RackViewProps> = ({ modules, connections, width, height, wiring, onPort, onParam, onRemove }) => {
  const portPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    modules.forEach((mod, mi) => {
      const d = getDesc(mod.descriptorId); if (!d) return;
      const y0 = mi * (STRIP_H + STRIP_GAP);
      d.ports.filter((p) => p.direction === 'input').forEach((p, i) => m.set(pk({ moduleId: mod.id, portId: p.id }), { x: width - 40, y: y0 + 28 + i * 16 }));
      d.ports.filter((p) => p.direction === 'output').forEach((p, i) => m.set(pk({ moduleId: mod.id, portId: p.id }), { x: width - 18, y: y0 + 28 + i * 16 }));
    });
    return m;
  }, [modules, width]);

  const drawCables = useCallback((g: GraphicsType) => {
    g.clear();
    connections.forEach((cn) => {
      const s = portPos.get(pk(cn.source)), t = portPos.get(pk(cn.target)); if (!s || !t) return;
      const mod = modules.find((m) => m.id === cn.source.moduleId);
      const port = mod ? getDesc(mod.descriptorId)?.ports.find((p) => p.id === cn.source.portId) : undefined;
      const cx = Math.min(s.x, t.x) - 30;
      g.moveTo(s.x, s.y); g.bezierCurveTo(cx, s.y, cx, t.y, t.x, t.y);
      g.stroke({ color: SIG_CLR[port?.signal ?? 'audio'], alpha: 0.8, width: 2 });
    });
  }, [connections, portPos, modules]);

  return (
    <PixiScrollView width={width} height={height} contentHeight={modules.length * (STRIP_H + STRIP_GAP) + 10}>
      <layoutContainer layout={{ flexDirection: 'column', gap: STRIP_GAP, width }}>
        {modules.map((mod) => <ModuleStrip key={mod.id} mod={mod} width={width} wiring={wiring} onPort={onPort} onParam={onParam} onRemove={onRemove} />)}
      </layoutContainer>
      <pixiGraphics draw={drawCables} layout={{ position: 'absolute', left: 0, top: 0 }} />
    </PixiScrollView>
  );
};

// ── Module Strip ─────────────────────────────────────────────────────────

const ModuleStrip: React.FC<{
  mod: ModularModuleInstance; width: number; wiring: PortRef | null;
  onPort: (r: PortRef, d: 'input' | 'output') => void;
  onParam: (m: string, p: string, v: number) => void;
  onRemove: (m: string) => void;
}> = ({ mod, width, wiring, onPort, onParam, onRemove }) => {
  const theme = usePixiTheme();
  const desc = getDesc(mod.descriptorId); if (!desc) return null;
  const clr = desc.color ? parseInt(desc.color.replace('#', ''), 16) : theme.accent.color;
  const ins = desc.ports.filter((p) => p.direction === 'input');
  const outs = desc.ports.filter((p) => p.direction === 'output');

  return (
    <layoutContainer layout={{ flexDirection: 'row', height: STRIP_H, width, backgroundColor: theme.bgSecondary.color, borderRadius: 4, borderLeftWidth: 3, borderColor: clr, padding: 6, gap: 6, alignItems: 'flex-start' }}>
      <layoutContainer layout={{ flexDirection: 'column', width: 64, gap: 2 }}>
        <PixiLabel text={mod.label || desc.name} size="xs" weight="bold" color="custom" customColor={clr} />
        <PixiLabel text={desc.category} size="xs" color="textMuted" />
        <PixiButton label="Del" size="sm" color="red" onClick={() => onRemove(mod.id)} />
      </layoutContainer>
      <layoutContainer layout={{ flexDirection: 'row', gap: 4, flex: 1, flexWrap: 'wrap' }}>
        {desc.parameters.slice(0, 4).map((p) => (
          <PixiKnob key={p.id} value={mod.parameters[p.id] ?? p.default} min={p.min} max={p.max} onChange={(v) => onParam(mod.id, p.id, v)} label={p.name.slice(0, 6)} size="sm" unit={p.unit} />
        ))}
      </layoutContainer>
      <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
        <PortColumn label="IN" ports={ins} moduleId={mod.id} wiring={wiring} onPort={onPort} />
        <PortColumn label="OUT" ports={outs} moduleId={mod.id} wiring={wiring} onPort={onPort} />
      </layoutContainer>
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
  onParam: (m: string, p: string, v: number) => void;
}> = ({ modules, connections, width, height, onToggle, onParam }) => {
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

  const connSet = useMemo(() => { const s = new Set<string>(); connections.forEach((c) => s.add(`${pk(c.source)}|${pk(c.target)}`)); return s; }, [connections]);
  const has = (s: PortRef, t: PortRef) => connSet.has(`${pk(s)}|${pk(t)}`);

  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();
    for (let i = 0; i <= ins.length; i++) { g.moveTo(HDR + i * CELL, HDR); g.lineTo(HDR + i * CELL, HDR + outs.length * CELL); g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 }); }
    for (let j = 0; j <= outs.length; j++) { g.moveTo(HDR, HDR + j * CELL); g.lineTo(HDR + ins.length * CELL, HDR + j * CELL); g.stroke({ color: theme.border.color, alpha: 0.3, width: 1 }); }
    outs.forEach((o, oi) => ins.forEach((inp, ii) => { if (has(o.ref, inp.ref)) { g.circle(HDR + ii * CELL + CELL / 2, HDR + oi * CELL + CELL / 2, 6); g.fill({ color: SIG_CLR[o.sig], alpha: 0.9 }); } }));
  }, [ins, outs, connSet, theme]);

  const cW = HDR + ins.length * CELL + 10, cH = HDR + outs.length * CELL + 10;
  const sideW = 110, matW = width - sideW - 8;
  const selModule = modules.find((m) => m.id === selMod);
  const selDesc = selModule ? getDesc(selModule.descriptorId) : undefined;

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
          {outs.map((o, oi) => ins.map((inp, ii) => (
            <layoutContainer key={`${oi}-${ii}`} layout={{ position: 'absolute', left: HDR + ii * CELL, top: HDR + oi * CELL, width: CELL, height: CELL }} eventMode="static" cursor="pointer" onPointerUp={() => onToggle(o.ref, inp.ref)} />
          )))}
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
