/**
 * GearmulatorHardware — Full hardware skin UI for gearmulator synths.
 * Loads RML/RCSS skin files, renders via GmSkinRenderer in a DOM overlay.
 * Integrates with the DEViLBOX HardwareUIWrapper pattern.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { GmSkinRenderer } from './GmSkinRenderer';
import { GmParameterMap } from './GmParameterMap';

export interface GearmulatorHardwareProps {
  /** Skin name (directory under /gearmulator/skins/) */
  skinName?: string;
  /** Synth handle from WASM */
  synthHandle?: number;
  /** Current part (0-15) */
  part?: number;
  /** External param change callback (sends to worklet) */
  onSendSysex?: (data: Uint8Array) => void;
  /** Container width for auto-scaling */
  containerWidth?: number;
}

export const GearmulatorHardware: React.FC<GearmulatorHardwareProps> = ({
  skinName = 'virus-trancy',
  synthHandle: _synthHandle,
  part = 0,
  onSendSysex,
  containerWidth,
}) => {
  const [paramMap, setParamMap] = useState<GmParameterMap | null>(null);
  const [rmlContent, setRmlContent] = useState<string | null>(null);
  const [rcssContent, setRcssContent] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // Load skin files
  useEffect(() => {
    const skinBase = `/gearmulator/skins/${skinName}`;
    Promise.all([
      GmParameterMap.load(),
      fetch(`${skinBase}/VirusC_Trancy.rml`).then(r => r.text()),
      fetch(`${skinBase}/VirusC_Trancy.rcss`).then(r => r.text()),
    ]).then(([pm, rml, rcss]) => {
      setParamMap(pm);
      setRmlContent(rml);
      setRcssContent(rcss);

      // Initialize param values to defaults (midpoint)
      const defaults: Record<string, number> = {};
      for (const p of pm.params) {
        if (p.isPublic !== false) {
          defaults[p.name] = p.isBool ? 0 : Math.round((p.min + p.max) / 2);
        }
      }
      setParamValues(defaults);
    }).catch(err => {
      setError(`Failed to load skin: ${err.message}`);
    });
  }, [skinName]);

  // Handle param changes from skin UI
  const handleParamChange = useCallback((paramName: string, value: number) => {
    setParamValues(prev => ({ ...prev, [paramName]: value }));

    // Build and send sysex
    if (paramMap && onSendSysex) {
      const sysex = paramMap.buildParamChange(paramName, value, part);
      if (sysex) onSendSysex(sysex);
    }
  }, [paramMap, onSendSysex, part]);

  // Auto-scale to fit container
  const skinNativeWidth = 1250; // 2501 * 0.5
  const scale = containerWidth ? Math.min(1, containerWidth / skinNativeWidth) : 1;

  if (error) {
    return <div style={{ color: '#f44', padding: 16 }}>{error}</div>;
  }

  if (!paramMap || !rmlContent || !rcssContent) {
    return <div style={{ color: '#888', padding: 16 }}>Loading skin...</div>;
  }

  return (
    <div
      className="gearmulator-hardware"
      style={{
        transform: scale < 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }}
    >
      <GmSkinRenderer
        rmlContent={rmlContent}
        rcssContent={rcssContent}
        paramMap={paramMap}
        paramValues={paramValues}
        onParamChange={handleParamChange}
        skinBase={`/gearmulator/skins/${skinName}`}
      />
    </div>
  );
};

export default GearmulatorHardware;
