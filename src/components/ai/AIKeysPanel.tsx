/**
 * AIKeysPanel - lets a visitor paste their own OpenRouter API key.
 * The key lives in useAIKeysStore (this browser only).
 */

import { useState } from 'react';
import { useAIKeysStore } from '@stores/useAIKeysStore';
import { Button } from '@components/ui/Button';

export function AIKeysPanel() {
  const saved = useAIKeysStore((s) => s.keys.openrouter);
  const setKey = useAIKeysStore((s) => s.setKey);
  const clearKey = useAIKeysStore((s) => s.clearKey);
  const [draft, setDraft] = useState('');

  const save = () => {
    setKey('openrouter', draft);
    setDraft('');
  };
  const clear = () => {
    clearKey('openrouter');
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-1 px-3 py-2 bg-dark-bgSecondary border-b border-dark-border">
      <label htmlFor="ai-openrouter-key" className="text-[10px] font-mono text-text-secondary">
        OpenRouter API Key
      </label>
      <input
        id="ai-openrouter-key"
        type="password"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="px-2 py-0.5 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={save} disabled={!draft.trim()}>Save</Button>
        <Button variant="default" onClick={clear} disabled={!saved && !draft}>Clear</Button>
        {saved && (
          <span className="text-[10px] font-mono text-accent-success">
            Key saved (ends in {saved.slice(-4)})
          </span>
        )}
      </div>
      <div className="text-[10px] font-mono text-text-muted">
        Stored only in this browser. Used for free models with your own quota.{' '}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-primary"
        >
          Get a key
        </a>
      </div>
    </div>
  );
}
