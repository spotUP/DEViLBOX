/**
 * AUPluginPicker — Embeddable AU plugin browser for the Add Instrument dialog.
 *
 * Connects to the native AU bridge (ws://localhost:4009), enumerates installed
 * AudioUnit plugins, and lets the user pick one. Selecting a plugin creates a
 * Kontakt-type instrument routed through the bridge.
 */

import React, { useCallback } from 'react';
import { Button } from '@components/ui/Button';
import { useKontaktStore } from '@stores/useKontaktStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import { Plug, Wifi, Loader2 } from 'lucide-react';
import type { InstrumentConfig } from '@typedefs/instrument';

interface AUPluginPickerProps {
  onClose: () => void;
}

export const AUPluginPicker: React.FC<AUPluginPickerProps> = ({ onClose }) => {
  const bridgeStatus = useKontaktStore((s) => s.bridgeStatus);
  const plugins = useKontaktStore((s) => s.plugins);
  const pluginName = useKontaktStore((s) => s.pluginName);
  const error = useKontaktStore((s) => s.error);
  const connect = useKontaktStore((s) => s.connect);
  const loadPlugin = useKontaktStore((s) => s.loadPlugin);
  const createInstrument = useInstrumentStore((s) => s.createInstrument);

  const isReady = bridgeStatus === 'ready';

  const handleConnect = useCallback(async () => {
    try {
      await connect();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Bridge connection failed');
    }
  }, [connect]);

  const handleSelectPlugin = useCallback((name: string) => {
    loadPlugin(name);
    createInstrument({
      name,
      synthType: 'Kontakt' as InstrumentConfig['synthType'],
    });
    notify.success(`Loaded AU plugin: ${name}`);
    onClose();
  }, [loadPlugin, createInstrument, onClose]);

  // Not connected — show setup instructions
  if (!isReady) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-16 h-16 rounded-full bg-dark-bgSecondary border border-dark-border flex items-center justify-center">
          {bridgeStatus === 'connecting' ? (
            <Loader2 size={28} className="text-accent-primary animate-spin" />
          ) : (
            <Plug size={28} className="text-text-muted" />
          )}
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h3 className="text-base font-semibold text-text-primary">Native Plugin Bridge</h3>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            Host AudioUnit, VST3, and CLAP plugins natively on your Mac.
            The bridge streams audio and MIDI over WebSocket.
          </p>
        </div>

        {error && (
          <div className="rounded border border-accent-error/30 bg-accent-error/10 px-3 py-2 text-[10px] text-accent-error max-w-md text-center">
            {error}
          </div>
        )}

        <Button variant="primary" onClick={handleConnect}>
          <Wifi size={14} />
          Connect to Bridge
        </Button>

        <div className="bg-dark-bgSecondary border border-dark-border rounded p-4 max-w-md w-full">
          <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2">Start the bridge first</div>
          <pre className="bg-dark-bgTertiary border border-dark-borderLight rounded p-2 text-[9px] font-mono text-text-secondary whitespace-pre-wrap">
{`cd tools/kontakt-bridge/build
cmake .. && make
./kontakt-bridge`}
          </pre>
        </div>
      </div>
    );
  }

  // Connected — show plugin list
  return (
    <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wifi size={14} className="text-accent-success" />
          <span className="text-[11px] font-mono text-accent-success">Bridge Connected</span>
          {pluginName && (
            <span className="text-[10px] text-text-muted">• Active: {pluginName}</span>
          )}
        </div>
        <span className="text-[10px] text-text-muted">{plugins.length} plugins found</span>
      </div>

      {error && (
        <div className="rounded border border-accent-error/30 bg-accent-error/10 px-3 py-2 text-[10px] text-accent-error flex-shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start">
        {plugins.map((plugin) => {
          const isActive = pluginName === plugin.name;
          return (
            <button
              key={plugin.name}
              type="button"
              onClick={() => handleSelectPlugin(plugin.name)}
              className={[
                'text-left px-3 py-3 rounded border transition-colors',
                isActive
                  ? 'bg-accent-primary/10 border-accent-primary/40 text-accent-primary'
                  : 'bg-dark-bgSecondary border-dark-border hover:bg-dark-bgHover hover:border-dark-borderLight text-text-primary',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <Plug size={14} className={isActive ? 'text-accent-primary' : 'text-text-muted'} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono truncate">{plugin.name}</div>
                  {plugin.manufacturer && (
                    <div className="text-[9px] text-text-muted truncate">{plugin.manufacturer}</div>
                  )}
                </div>
                {isActive && (
                  <span className="text-[8px] font-mono bg-accent-primary/20 text-accent-primary px-1.5 py-0.5 rounded flex-shrink-0">
                    Active
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
