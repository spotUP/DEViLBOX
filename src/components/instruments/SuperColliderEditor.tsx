import React, { useEffect, useRef, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { Play, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import type { SuperColliderConfig, SCParam } from '@typedefs/instrument';
import { superColliderLanguage } from '@engine/sc/scLanguage';

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
      const res = await fetch('/api/sc/compile', {
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

        onChange({
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
  }, [onChange]);

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
          <span className="flex items-center gap-1.5 text-xs text-accent-error">
            <AlertCircle size={12} />
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
        {config.synthDefName && (
          <span className="text-xs text-text-muted font-mono">
            \{config.synthDefName}
          </span>
        )}
      </div>

      {/* CodeMirror editor — grows to fill available space */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto min-h-0"
        style={{ minHeight: 0 }}
      />

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
    </div>
  );
};
