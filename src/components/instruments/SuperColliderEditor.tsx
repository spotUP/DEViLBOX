import React, { useEffect, useRef, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import { Play, CheckCircle, AlertCircle, Loader, Download, Upload, Plus, X, Copy } from 'lucide-react';
import type { SuperColliderConfig, SCParam } from '@typedefs/instrument';
import { superColliderLanguage } from '@engine/sc/scLanguage';

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
  const [status, setStatus] = React.useState<CompileStatus>({ state: 'idle' });

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
        setStatus({ state: 'compiled' });
      } else {
        setStatus({ state: 'error', message: data.error, line: data.line, rawOutput: data.rawOutput });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setStatus({ state: 'error', message });
    }
  }, []);

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
      case 'error':
        return (
          <span className="flex items-center gap-1.5 text-xs text-accent-error select-text cursor-text">
            <AlertCircle size={12} className="shrink-0" />
            {status.line !== undefined ? `Line ${status.line}: ` : ''}
            {status.message}
          </span>
        );
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-dark-bg rounded-lg border border-dark-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bgSecondary border-b border-dark-border shrink-0">
        <span className="text-xs font-semibold text-text-primary font-mono tracking-wide">
          SuperCollider
        </span>
        <div className="flex items-center gap-2">
          {config.synthDefName && (
            <span className="text-xs text-text-muted font-mono mr-2">
              \{config.synthDefName}
            </span>
          )}
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
        </div>
      </div>

      {/* Body: editor (left) + param panel (right, always visible) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* CodeMirror editor */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto min-h-0"
          style={{ minHeight: 0 }}
        />

        {/* Param panel — always visible */}
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
            /* Empty state */
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
            /* Param rows */
            <div className="flex flex-col p-3 gap-4">
              {config.params.map((param) => {
                const step = (param.max - param.min) / 200;
                return (
                  <div key={param.name} className="flex flex-col gap-1.5">
                    {/* Name + value + remove */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="text-xs text-text-secondary font-mono truncate flex-1"
                        title={param.name}
                      >
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
                    {/* Slider */}
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
                    {/* Min / max range inputs */}
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

              {/* Add param button */}
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
