/**
 * Fil4EqEditor — visual effect editor for Fil4EQ master FX slot.
 * Delegates entirely to Fil4EqPanel, which owns the frequency curve
 * and band controls. The live Fil4EqEffect node is retrieved directly
 * via ToneEngine so all param writes bypass the generic store path.
 */

import React, { useState, useEffect } from 'react';
import type { VisualEffectEditorProps } from './shared';
import { Fil4EqPanel } from '../Fil4EqPanel';
import { Fil4EqEffect } from '@engine/effects/Fil4EqEffect';
import { getToneEngine } from '@engine/ToneEngine';

export const Fil4EqEditor: React.FC<VisualEffectEditorProps> = ({ effect }) => {
  const [node, setNode] = useState<Fil4EqEffect | null>(null);

  // The ToneEngine may not have the node at mount time (it's created during
  // the master FX chain rebuild which happens asynchronously). Poll for it
  // once on mount — and whenever effect.id changes — so the panel appears as
  // soon as the node is ready.
  useEffect(() => {
    const tryResolve = () => {
      const n = getToneEngine().getMasterEffectNode(effect.id);
      if (n instanceof Fil4EqEffect) {
        setNode(n);
        return true;
      }
      return false;
    };

    if (tryResolve()) return;

    // Node not ready yet — retry for up to ~1 second (chain rebuild is fast)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryResolve() || attempts >= 20) clearInterval(interval);
    }, 50);

    return () => clearInterval(interval);
  }, [effect.id]);

  if (!node) {
    return (
      <div className="flex items-center justify-center py-8 text-text-muted text-xs font-mono">
        Initialising EQ…
      </div>
    );
  }

  return <Fil4EqPanel effect={node} />;
};
