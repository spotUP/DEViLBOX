/**
 * AIKeysPanel - lets a visitor paste their own OpenRouter, Anthropic or OpenAI
 * API key. Keys live in useAIKeysStore (this browser only).
 */

import { useState } from 'react';
import { useAIKeysStore, AI_KEY_VENDORS, type AIKeyVendor } from '@stores/useAIKeysStore';
import { useAIWizardStore } from '@stores/useAIWizardStore';
import { Button } from '@components/ui/Button';

const VENDORS = Object.keys(AI_KEY_VENDORS) as AIKeyVendor[];

function KeyField({ vendor }: { vendor: AIKeyVendor }) {
  const saved = useAIKeysStore((s) => s.keys[vendor]);
  const setKey = useAIKeysStore((s) => s.setKey);
  const clearKey = useAIKeysStore((s) => s.clearKey);
  const [draft, setDraft] = useState('');
  const { label, keyUrl } = AI_KEY_VENDORS[vendor];

  const save = () => {
    setKey(vendor, draft);
    setDraft('');
  };
  const clear = () => {
    clearKey(vendor);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-1" data-testid={`ai-key-${vendor}`}>
      <label htmlFor={`ai-${vendor}-key`} className="text-[10px] font-mono text-text-secondary">
        {label} API Key
      </label>
      <input
        id={`ai-${vendor}-key`}
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
        <a
          href={keyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-mono text-accent-primary"
        >
          Get a key
        </a>
      </div>
    </div>
  );
}

export function AIKeysPanel() {
  const openWizard = useAIWizardStore((s) => s.open);
  return (
    <div className="flex flex-col gap-3 px-3 py-2 bg-dark-bgSecondary border-b border-dark-border">
      {VENDORS.map((v) => <KeyField key={v} vendor={v} />)}
      <div className="text-[10px] font-mono text-text-muted">
        Keys are stored only in this browser and sent only to the provider they belong to.
      </div>
      <div>
        <Button variant="default" onClick={openWizard}>Set Up AI Help</Button>
      </div>
    </div>
  );
}
