import React, { useEffect, useRef, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { Play, CheckCircle, AlertCircle, Loader, Download, Upload } from 'lucide-react';
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
  | { state: 'error'; message: string; line?: number };

interface Props {
  config: SuperColliderConfig;
  onChange: (config: SuperColliderConfig) => void;
}

// API response shapes
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
}

type CompileResponse = CompileSuccess | CompileFailure;

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
  const [status, setStatus] = React.useState<CompileStatus>({ state: 'idle' });

  // Keep configRef in sync so callbacks don't capture stale config
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Keep onChangeRef in sync so the mount-once update listener uses current onChange
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // -------------------------------------------------------------------------
  // Build & mount the CodeMirror editor
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: config.source,
      extensions: [
        ...superColliderLanguage,
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newSource = update.state.doc.toString();
            // Only call onChange if source actually changed to avoid loops
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
  // Keep editor content in sync when config.source changes externally
  // (e.g. preset load from parent)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc === config.source) return;

    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: config.source },
    });
  }, [config.source]);

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
        setStatus({ state: 'error', message: data.error, line: data.line });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setStatus({ state: 'error', message });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Param panel — change handler
  // -------------------------------------------------------------------------
  const handleParamChange = useCallback((name: string, value: number) => {
    onChangeRef.current({
      ...configRef.current,
      params: configRef.current.params.map((p) =>
        p.name === name ? { ...p, value } : p
      ),
    });
  }, []);

  // -------------------------------------------------------------------------
  // Preset export
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

  // -------------------------------------------------------------------------
  // Preset import
  // -------------------------------------------------------------------------
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
    // Reset so the same file can be re-imported
    e.target.value = '';
  }, []);

  // -------------------------------------------------------------------------
  // Status bar content
  // -------------------------------------------------------------------------
  const renderStatus = () => {
    switch (status.state) {
      case 'idle':
        return (
          <span className="text-text-muted text-xs">
            Ready
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
            Compiled — {config.synthDefName || 'unnamed'}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 text-xs text-accent-error select-text cursor-text">
            <AlertCircle size={12} className="shrink-0" />
            {status.line !== undefined ? `Error on line ${status.line}: ` : 'Error: '}
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

      {/* Body: editor (left) + param panel (right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* CodeMirror editor */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto min-h-0"
          style={{ minHeight: 0 }}
        />

        {/* Param panel — only shown when there are params */}
        {config.params.length > 0 && (
          <div className="w-56 shrink-0 border-l border-dark-border bg-dark-bgSecondary overflow-y-auto flex flex-col">
            <div className="px-3 py-2 border-b border-dark-border shrink-0">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Parameters
              </span>
            </div>
            <div className="flex flex-col gap-3 p-3">
              {config.params.map((param) => {
                const step = (param.max - param.min) / 200;
                return (
                  <div key={param.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-mono truncate" title={param.name}>
                        {param.name}
                      </span>
                      <span className="text-xs text-text-muted font-mono ml-2 shrink-0">
                        {Number(param.value.toPrecision(3))}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={step}
                      value={param.value}
                      onChange={(e) => {
                        handleParamChange(param.name, Number(e.target.value));
                      }}
                      className="w-full h-1.5 appearance-none rounded cursor-pointer"
                      style={{ accentColor: 'var(--color-accent-primary, #7c3aed)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
