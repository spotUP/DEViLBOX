import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { Play, CheckCircle, AlertCircle, Loader, Download, Upload, Plus, X, Copy, RefreshCw, BookOpen, ChevronDown } from 'lucide-react';
import type { SuperColliderConfig, SCParam } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { superColliderLanguage } from '@engine/sc/scLanguage';
import { parseSCGui, type SCGuiParseResult, type SCRoutinePattern } from '@engine/sc/scGuiParser';
import { SCGuiRenderer } from './SCGuiRenderer';
import { SC_PRESETS, SC_PRESET_CATEGORIES, type SCPreset } from '@constants/scPresets';
import { getToneEngine } from '@engine/ToneEngine';

const API_URL = import.meta.env.VITE_API_URL as string | undefined ?? 'https://devilbox.uprough.net/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CompileStatus =
  | { state: 'idle' }
  | { state: 'compiling' }
  | { state: 'compiled' }
  | { state: 'error'; message: string; line?: number; rawOutput?: string };

interface Props {
  config: SuperColliderConfig;
  onChange: (config: SuperColliderConfig) => void;
}

interface CompileSuccess {
  success: true;
  synthDefName: string;
  binary: string;
  params: Array<{ name: string; default: number; min: number; max: number }>;
}

interface CompileFailure {
  success: false;
  error: string;
  line?: number;
  rawOutput?: string;
}

type CompileResponse = CompileSuccess | CompileFailure;

// ---------------------------------------------------------------------------
// CodeMirror: error-line decoration
// ---------------------------------------------------------------------------

const setErrorLineEffect = StateEffect.define<number | null>();

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorLineEffect)) {
        if (e.value === null) {
          deco = Decoration.none;
        } else {
          try {
            const line = tr.state.doc.line(e.value);
            deco = Decoration.set([
              Decoration.line({ class: 'cm-error-line' }).range(line.from),
            ]);
          } catch {
            deco = Decoration.none;
          }
        }
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------------------------------------------------------------------------
// EditorView theme — VS Code dark-like, matches DEViLBOX palette
// ---------------------------------------------------------------------------

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--color-bg)',
    color: '#d4d4d4',
    height: '100%',
    fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, monospace",
    fontSize: '13px',
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: '#aeafad',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '.cm-line': {
    padding: '0 8px 0 8px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-bg-secondary)',
    color: '#6e7681',
    border: 'none',
    borderRight: '1px solid var(--color-border)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  '.cm-cursor': {
    borderLeftColor: '#aeafad',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#264f78',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#264f78',
  },
  '.cm-error-line': {
    backgroundColor: 'rgba(255, 70, 70, 0.13)',
    borderLeft: '2px solid rgba(255, 90, 90, 0.55)',
  },
}, { dark: true });

// ---------------------------------------------------------------------------
// SuperColliderEditor
// ---------------------------------------------------------------------------

export const SuperColliderEditor: React.FC<Props> = ({ config, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const configRef = useRef(config);
  const onChangeRef = useRef(onChange);
  const importInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const handleCompileRef = useRef<() => Promise<void>>(async () => { /* set below */ });
  const [status, setStatus] = React.useState<CompileStatus>({ state: 'idle' });
  const [progress, setProgress] = React.useState(0);
  const [showProgress, setShowProgress] = React.useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [presetCategory, setPresetCategory] = useState<string>('All');
  const [presetSearch, setPresetSearch] = useState('');
  const [scTab, setScTab] = useState<'script' | 'controls'>('script');
  const presetSearchRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parse SC GUI from source
  const guiResult = useMemo<SCGuiParseResult>(() => parseSCGui(config.source), [config.source]);

  const startProgress = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    setShowProgress(true);
    progressIntervalRef.current = setInterval(() => {
      // Ease toward 88% — never quite reaches it, giving a "waiting" feel
      progressRef.current += (88 - progressRef.current) * 0.04;
      setProgress(progressRef.current);
    }, 60);
  }, []);

  const finishProgress = useCallback((success: boolean) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setProgress(success ? 100 : progressRef.current);
    if (success) {
      setTimeout(() => setShowProgress(false), 500);
    } else {
      // On error leave bar at current position briefly, then hide
      setTimeout(() => setShowProgress(false), 800);
    }
  }, []);

  // Keep refs in sync
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // -------------------------------------------------------------------------
  // Build & mount the CodeMirror editor (once)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: config.source,
      extensions: [
        ...superColliderLanguage,
        editorTheme,
        errorLineField,
        EditorView.lineWrapping,
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              void handleCompileRef.current();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newSource = update.state.doc.toString();
            if (newSource !== configRef.current.source) {
              onChangeRef.current({ ...configRef.current, source: newSource });
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount once
  }, []);

  // -------------------------------------------------------------------------
  // Sync editor content when config.source changes externally
  // -------------------------------------------------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === config.source) return;
    view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: config.source } });
  }, [config.source]);

  // -------------------------------------------------------------------------
  // Highlight error line in editor when status changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const line = status.state === 'error' ? (status.line ?? null) : null;
    view.dispatch({ effects: [setErrorLineEffect.of(line)] });
  }, [status]);

  // Auto-scroll log to bottom when new output arrives
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [status]);

  // -------------------------------------------------------------------------
  // Compile
  // -------------------------------------------------------------------------
  const handleCompile = useCallback(async () => {
    setStatus({ state: 'compiling' });
    startProgress();
    const source = viewRef.current?.state.doc.toString() ?? configRef.current.source;

    try {
      const res = await fetch(`${API_URL}/sc/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });

      const data = await res.json() as CompileResponse;

      if (data.success) {
        const newParams: SCParam[] = data.params.map((p) => ({
          name: p.name,
          default: p.default,
          min: p.min,
          max: p.max,
          value: p.default,
        }));

        onChangeRef.current({
          ...configRef.current,
          source,
          synthDefName: data.synthDefName,
          binary: data.binary,
          params: newParams,
        });
        finishProgress(true);
        setStatus({ state: 'compiled' });

        // Cache result on server for instant future loading
        fetch(`${API_URL}/sc/presets/cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.synthDefName, result: data }),
        }).catch(() => {});
      } else {
        finishProgress(false);
        setStatus({ state: 'error', message: data.error, line: data.line, rawOutput: data.rawOutput });
      }
    } catch (err) {
      finishProgress(false);
      const raw = err instanceof Error ? err.message : 'Network error';
      // "Failed to fetch" means the server isn't reachable at all — give actionable context.
      const isConnectionError = raw === 'Failed to fetch' || raw.toLowerCase().includes('networkerror');
      const message = isConnectionError ? 'Compile server unreachable' : raw;
      const rawOutput = isConnectionError
        ? `Could not connect to the compile server:\n  ${API_URL}/sc/compile\n\nStart the backend with:\n  cd server && npm run dev\n\nOr set VITE_API_URL in your .env.local to point at a running instance.`
        : undefined;
      setStatus({ state: 'error', message, rawOutput });
    }
  }, [startProgress, finishProgress]);

  // Keep handleCompileRef in sync so the Cmd+Enter keymap always calls the latest version.
  useEffect(() => { handleCompileRef.current = handleCompile; }, [handleCompile]);

  // -------------------------------------------------------------------------
  // Param handlers
  // -------------------------------------------------------------------------

  const handleParamChange = useCallback((name: string, value: number) => {
    onChangeRef.current({
      ...configRef.current,
      params: configRef.current.params.map((p) =>
        p.name === name ? { ...p, value } : p
      ),
    });
  }, []);

  const handleParamRangeChange = useCallback((name: string, field: 'min' | 'max', raw: string) => {
    const num = parseFloat(raw);
    if (!isFinite(num)) return;
    onChangeRef.current({
      ...configRef.current,
      params: configRef.current.params.map((p) => {
        if (p.name !== name) return p;
        const updated = { ...p, [field]: num };
        // Clamp value into new range
        updated.value = Math.min(Math.max(updated.value, updated.min), updated.max);
        return updated;
      }),
    });
  }, []);

  const handleAddParam = useCallback(() => {
    const cfg = configRef.current;
    const idx = cfg.params.length + 1;
    const newParam: SCParam = {
      name: `param${idx}`,
      value: 0,
      default: 0,
      min: 0,
      max: 1,
    };
    onChangeRef.current({ ...cfg, params: [...cfg.params, newParam] });
  }, []);

  const handleRemoveParam = useCallback((name: string) => {
    onChangeRef.current({
      ...configRef.current,
      params: configRef.current.params.filter((p) => p.name !== name),
    });
  }, []);

  // GUI widget action → update param + send to live scsynth
  const handleGuiParamChange = useCallback((param: string, value: number) => {
    const cfg = configRef.current;
    const existingParam = cfg.params.find(p => p.name === param);
    if (existingParam) {
      onChangeRef.current({
        ...cfg,
        params: cfg.params.map(p => p.name === param ? { ...p, value } : p),
      });
    }
    // Send to live scsynth via ToneEngine → SuperColliderSynth.set()
    try {
      const instrumentId = useInstrumentStore.getState().currentInstrumentId;
      if (instrumentId != null) {
        const engine = getToneEngine();
        const synth = engine.instruments.get(instrumentId) as any;
        if (synth && typeof synth.set === 'function') {
          synth.set(param, value);
        }
      }
    } catch { /* engine not ready or no active synth */ }
  }, []);

  // Generate tracker pattern from SC Routine data
  const handleGeneratePattern = useCallback((routine: SCRoutinePattern) => {
    import('@stores/useTrackerStore').then(({ useTrackerStore }) => {
      const store = useTrackerStore.getState();
      const instrumentId = useInstrumentStore.getState().currentInstrumentId ?? 1;
      const { pitches, gates, rootNote } = routine;
      const root = rootNote ?? 60;
      const steps = pitches.length;

      // Create a new pattern
      store.addPattern(steps);
      const patternIdx = store.patterns.length - 1;
      const pattern = store.patterns[patternIdx];
      if (!pattern || pattern.channels.length === 0) return;

      // Fill channel 0 with routine data
      useTrackerStore.setState(state => {
        const ch = state.patterns[patternIdx].channels[0];
        for (let i = 0; i < steps && i < ch.rows.length; i++) {
          const midi = root + pitches[i];
          const xmNote = Math.max(1, Math.min(96, midi - 11));
          const gate = gates[i] ?? 1;
          if (gate < 0.01) {
            // Rest — leave empty
            ch.rows[i] = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
          } else {
            ch.rows[i] = {
              note: xmNote,
              instrument: instrumentId,
              volume: Math.round(gate * 0x40) + 0x10,
              effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
            };
          }
        }
        ch.instrumentId = instrumentId;
      });

      // Navigate to the new pattern
      store.setCurrentPattern(patternIdx);

      import('@stores/useUIStore').then(({ useUIStore }) => {
        useUIStore.getState().setStatusMessage(`Pattern generated: ${steps} steps from SC Routine`);
      });
    });
  }, []);

  // -------------------------------------------------------------------------
  // Export / Import
  // -------------------------------------------------------------------------

  const handleExport = useCallback(() => {
    const cfg = configRef.current;
    const preset = {
      version: 1,
      name: cfg.synthDefName || 'untitled',
      synthDefName: cfg.synthDefName,
      source: cfg.source,
      binary: cfg.binary,
      params: cfg.params,
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cfg.synthDefName || 'preset'}.scpreset`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const preset = JSON.parse(evt.target?.result as string) as {
          version: number;
          synthDefName?: string;
          source?: string;
          binary?: string;
          params?: SCParam[];
        };
        if (preset.version !== 1 || !preset.synthDefName || !preset.source) {
          alert('Invalid .scpreset file');
          return;
        }
        onChangeRef.current({
          synthDefName: preset.synthDefName,
          source: preset.source,
          binary: preset.binary ?? '',
          params: preset.params ?? [],
        });
      } catch {
        alert('Failed to parse .scpreset file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  // -------------------------------------------------------------------------
  // Save as new instrument
  // -------------------------------------------------------------------------
  const createInstrument = useInstrumentStore((s) => s.createInstrument);
  const setCurrentInstrument = useInstrumentStore((s) => s.setCurrentInstrument);

  const handleSaveAsNewInstrument = useCallback(() => {
    const cfg = configRef.current;
    if (!cfg.binary) {
      alert('Compile the SynthDef first before saving as a new instrument.');
      return;
    }
    const name = (cfg.synthDefName || 'SC Synth').slice(0, 22);
    const newId = createInstrument({
      name,
      synthType: 'SuperCollider' as const,
      superCollider: {
        synthDefName: cfg.synthDefName,
        source: cfg.source,
        binary: cfg.binary,
        params: cfg.params.map(p => ({ ...p })),
      },
    });
    setCurrentInstrument(newId);
  }, [createInstrument, setCurrentInstrument]);

  // -------------------------------------------------------------------------
  // Load community preset
  // -------------------------------------------------------------------------
  const handleLoadPreset = useCallback(async (preset: SCPreset) => {
    // Set source immediately
    onChangeRef.current({
      ...configRef.current,
      source: preset.source,
      synthDefName: preset.name,
      binary: '',
      params: [],
    });
    setShowPresets(false);

    // Try cached pre-compiled version
    try {
      const cacheRes = await fetch(`${API_URL}/sc/presets/${encodeURIComponent(preset.name)}`);
      if (cacheRes.ok) {
        const cached = await cacheRes.json();
        if (cached.success && cached.binary) {
          onChangeRef.current({
            ...configRef.current,
            source: preset.source,
            synthDefName: cached.synthDefName,
            binary: cached.binary,
            params: (cached.params ?? []).map((p: any) => ({
              name: p.name, value: p.default ?? 0, min: p.min ?? 0, max: p.max ?? 1,
            })),
          });
          setStatus({ state: 'success' as any, message: `Loaded pre-compiled: ${cached.synthDefName}` });
          return;
        }
      }
    } catch { /* no cache, user will need to compile */ }

    setStatus({ state: 'idle' });
  }, []);

  const filteredPresets = useMemo(() => {
    let list = presetCategory === 'All' ? SC_PRESETS : SC_PRESETS.filter(p => p.category === presetCategory);
    if (presetSearch.trim()) {
      const q = presetSearch.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.credit.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [presetCategory, presetSearch]);

  // -------------------------------------------------------------------------
  // Status bar
  // -------------------------------------------------------------------------
  const renderStatus = () => {
    switch (status.state) {
      case 'idle':
        return (
          <span className="text-text-muted text-xs">
            {config.binary ? `\\${config.synthDefName}` : '⚠ Not compiled'}
          </span>
        );
      case 'compiling':
        return (
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Loader size={12} className="animate-spin" />
            Compiling...
          </span>
        );
      case 'compiled':
        return (
          <span className="flex items-center gap-1.5 text-xs text-accent-success">
            <CheckCircle size={12} />
            Compiled — \{config.synthDefName}
          </span>
        );
      case 'error': {
        const errorText = (status.line !== undefined ? `Line ${status.line}: ` : '') + status.message;
        const copyText = status.rawOutput ? `${errorText}\n\n${status.rawOutput}` : errorText;
        return (
          <span className="flex items-center gap-1.5 text-xs text-accent-error min-w-0">
            <AlertCircle size={12} className="shrink-0" />
            <span className="truncate select-text cursor-text" title={errorText}>{errorText}</span>
            <button
              onClick={() => { void navigator.clipboard.writeText(copyText); }}
              className="shrink-0 ml-0.5 text-accent-error hover:opacity-70 transition-opacity"
              title="Copy error to clipboard"
            >
              <Copy size={11} />
            </button>
          </span>
        );
      }
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-dark-bg rounded-lg border border-dark-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0">
        {/* Tab bar */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setScTab('script')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              scTab === 'script'
                ? 'bg-accent-primary/15 text-accent-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Script
          </button>
          <button
            onClick={() => setScTab('controls')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              scTab === 'controls'
                ? 'bg-accent-primary/15 text-accent-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Controls
          </button>
        </div>
        <div className="flex items-center gap-2">
          {config.synthDefName && (
            <span className="text-xs text-text-muted font-mono mr-2">
              \{config.synthDefName}
            </span>
          )}
          <button
            onClick={() => { void handleCompile(); }}
            disabled={status.state === 'compiling'}
            title="Compile & reload SynthDef (Cmd+Enter)"
            className={[
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              status.state === 'compiling'
                ? 'text-text-muted cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgTertiary',
            ].join(' ')}
          >
            <RefreshCw size={11} className={status.state === 'compiling' ? 'animate-spin' : ''} />
            Reload
          </button>
          <button
            onClick={() => setShowPresets(p => !p)}
            title="Browse community SynthDef presets"
            className={[
              'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
              showPresets
                ? 'text-accent-primary bg-dark-bgTertiary'
                : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgTertiary',
            ].join(' ')}
          >
            <BookOpen size={11} />
            Presets
            <ChevronDown size={9} />
          </button>
          <button
            onClick={() => { importInputRef.current?.click(); }}
            title="Import .scpreset"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-dark-bgTertiary transition-colors"
          >
            <Upload size={11} />
            Import
          </button>
          <button
            onClick={handleExport}
            title="Export .scpreset"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-dark-bgTertiary transition-colors"
          >
            <Download size={11} />
            Export
          </button>
          <button
            onClick={handleSaveAsNewInstrument}
            title="Save as new instrument in the tracker"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-lime-400 hover:text-lime-300 hover:bg-dark-bgTertiary transition-colors"
          >
            <Plus size={11} />
            Save as Instrument
          </button>
        </div>
      </div>

      {/* Progress bar — appears during compile, fades out on completion */}
      <div
        className="shrink-0 overflow-hidden transition-all duration-300"
        style={{ height: showProgress ? 3 : 0 }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${progress}%`,
            background: status.state === 'error'
              ? 'var(--color-accent-error, #e06c75)'
              : 'var(--color-accent-primary, #7c3aed)',
            transitionDuration: progress === 100 ? '200ms' : '600ms',
            transitionTimingFunction: 'ease-out',
            boxShadow: `0 0 6px ${status.state === 'error' ? 'rgba(224,108,117,0.6)' : 'rgba(124,58,237,0.6)'}`,
          }}
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Preset browser overlay — shared across tabs */}
        {showPresets && (
          <div className="absolute inset-0 z-10 bg-dark-bgPrimary/95 backdrop-blur-sm flex flex-col overflow-hidden" style={{ background: 'rgba(10,10,10,0.97)' }}>
            {/* Search + category tabs */}
            <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-dark-border shrink-0">
              <input
                ref={presetSearchRef}
                type="text"
                value={presetSearch}
                onChange={e => setPresetSearch(e.target.value)}
                placeholder="Search presets..."
                autoFocus
                className="w-40 px-2 py-0.5 rounded text-xs bg-dark-bgTertiary border border-dark-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 mr-2"
              />
              <button
                onClick={() => setPresetCategory('All')}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  presetCategory === 'All' ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                All ({SC_PRESETS.length})
              </button>
              {SC_PRESET_CATEGORIES.map(cat => {
                const count = SC_PRESETS.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setPresetCategory(cat)}
                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                      presetCategory === cat ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
            {/* Preset grid */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {filteredPresets.map((preset, i) => (
                  <button
                    key={`${preset.category}-${preset.name}-${i}`}
                    onClick={() => handleLoadPreset(preset)}
                    className="text-left px-3 py-2 rounded border border-dark-border hover:border-accent-primary/40 hover:bg-dark-bgTertiary transition-colors group"
                  >
                    <div className="text-xs font-medium text-text-primary group-hover:text-accent-primary truncate">
                      {preset.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-text-muted">{preset.category}</span>
                      {preset.credit && (
                        <span className="text-[10px] text-text-muted truncate">· {preset.credit}</span>
                      )}
                    </div>
                    {preset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {preset.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] px-1 rounded bg-dark-bgSecondary text-text-muted">{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {/* Attribution footer */}
            <div className="shrink-0 px-3 py-1.5 border-t border-dark-border text-[10px] text-text-muted flex justify-between">
              <span>Community presets from <a href="https://github.com/SCLOrkHub/SCLOrkSynths" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">SCLOrkSynths</a> (GPL-3.0). Click a preset to load its source, then Compile.</span>
              <span>{filteredPresets.length} of {SC_PRESETS.length} presets</span>
            </div>
          </div>
        )}

        {/* ── Script tab: CodeMirror editor ─────────────────────────── */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto min-h-0"
          style={{ minHeight: 0, display: scTab === 'script' ? 'block' : 'none' }}
        />

        {/* ── Controls tab: SC GUI + Params side by side ──────────── */}
        {scTab === 'controls' && (
          <>
            {/* SC GUI panel */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {guiResult.hasGui ? (
                <SCGuiRenderer
                  gui={guiResult}
                  onParamChange={handleGuiParamChange}
                  onGeneratePattern={handleGeneratePattern}
                  className="h-full"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-xs p-4 text-center">
                  {config.binary
                    ? 'No GUI widgets detected in this SynthDef.\nUse the param sliders on the right.'
                    : 'Compile a SynthDef first to see controls.'}
                </div>
              )}
            </div>

            {/* Param panel */}
            <div className="w-52 shrink-0 border-l border-dark-border bg-dark-bgSecondary overflow-y-auto flex flex-col">
              <div className="px-3 py-2 border-b border-dark-border shrink-0 flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Parameters
                </span>
                <span className="text-xs text-text-muted">
                  {config.params.length > 0 ? config.params.length : ''}
                </span>
              </div>

              {config.params.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 p-4 gap-3 text-center">
                  <p className="text-xs text-text-muted leading-relaxed">
                    Compile to auto-extract params, or add manually.
                  </p>
                  <button
                    onClick={handleAddParam}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-text-secondary border border-dark-border hover:text-text-primary hover:border-text-muted transition-colors"
                  >
                    <Plus size={11} />
                    Add param
                  </button>
                </div>
              ) : (
                <div className="flex flex-col p-3 gap-4">
                  {config.params.map((param) => {
                    const step = (param.max - param.min) / 200;
                    return (
                      <div key={param.name} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs text-text-secondary font-mono truncate flex-1" title={param.name}>
                            {param.name}
                          </span>
                          <span className="text-xs text-text-muted font-mono shrink-0">
                            {Number(param.value.toPrecision(3))}
                          </span>
                          <button
                            onClick={() => handleRemoveParam(param.name)}
                            className="shrink-0 ml-1 text-text-muted hover:text-accent-error transition-colors"
                            title={`Remove ${param.name}`}
                          >
                            <X size={10} />
                          </button>
                        </div>
                        <input
                          type="range"
                          min={param.min}
                          max={param.max}
                          step={step}
                          value={param.value}
                          onChange={(e) => handleParamChange(param.name, Number(e.target.value))}
                          className="w-full h-1.5 appearance-none rounded cursor-pointer"
                          style={{ accentColor: 'var(--color-accent-primary, #7c3aed)' }}
                        />
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="number"
                            value={param.min}
                            onChange={(e) => handleParamRangeChange(param.name, 'min', e.target.value)}
                            className="w-0 flex-1 bg-dark-bgTertiary border border-dark-border rounded px-1 py-0.5 text-xs text-text-muted font-mono text-center focus:outline-none focus:border-text-muted"
                            title="Min"
                          />
                          <span className="text-text-muted text-xs shrink-0">—</span>
                          <input
                            type="number"
                            value={param.max}
                            onChange={(e) => handleParamRangeChange(param.name, 'max', e.target.value)}
                            className="w-0 flex-1 bg-dark-bgTertiary border border-dark-border rounded px-1 py-0.5 text-xs text-text-muted font-mono text-center focus:outline-none focus:border-text-muted"
                            title="Max"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={handleAddParam}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded text-xs text-text-muted border border-dashed border-dark-border hover:text-text-secondary hover:border-text-muted transition-colors mt-1"
                  >
                    <Plus size={11} />
                    Add param
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Compiler output log — visible only on error */}
      {status.state === 'error' && (
        <div className="shrink-0 border-t border-dark-border bg-[#0d1117] flex flex-col" style={{ maxHeight: 200 }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-border bg-dark-bgSecondary shrink-0">
            <span className="text-xs font-semibold text-accent-error uppercase tracking-wider">
              sclang output
            </span>
            {status.rawOutput && (
              <button
                onClick={() => { void navigator.clipboard.writeText(status.rawOutput ?? ''); }}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
                title="Copy to clipboard"
              >
                <Copy size={10} />
                Copy
              </button>
            )}
          </div>
          <pre
            ref={logRef}
            className="overflow-y-auto flex-1 px-3 py-2 text-xs font-mono leading-relaxed select-text"
            style={{ color: '#e06c75', minHeight: 60 }}
          >
            {status.rawOutput
              ? status.rawOutput
              : status.message}
          </pre>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-t border-dark-border shrink-0">
        <div className="flex-1 min-w-0 overflow-hidden">
          {renderStatus()}
        </div>
        <button
          onClick={() => { void handleCompile(); }}
          disabled={status.state === 'compiling'}
          title="Compile & load SynthDef (Cmd+Enter)"
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors shrink-0 ml-3',
            status.state === 'compiling'
              ? 'bg-dark-bgTertiary text-text-muted cursor-not-allowed'
              : 'bg-accent-primary text-dark-bg hover:opacity-90',
          ].join(' ')}
        >
          {status.state === 'compiling'
            ? <Loader size={12} className="animate-spin" />
            : <Play size={12} />
          }
          Compile &amp; Load
        </button>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".scpreset"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
    </div>
  );
};
