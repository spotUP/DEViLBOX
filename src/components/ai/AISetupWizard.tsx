/**
 * AISetupWizard - one modal that walks a visitor to a working AI provider:
 * choose, paste a key, check it, finish. Nothing is saved until the check
 * passes. Open/close state lives in useAIWizardStore.
 */

import { useEffect, useState } from 'react';
import { Modal } from '@components/ui/Modal';
import { ModalHeader } from '@components/ui/ModalHeader';
import { ModalFooter } from '@components/ui/ModalFooter';
import { Button } from '@components/ui/Button';
import { useAIWizardStore } from '@stores/useAIWizardStore';
import { useAIStore } from '@stores/useAIStore';
import {
  useAIKeysStore,
  AI_KEY_VENDORS,
  PROVIDER_FOR_VENDOR,
  type AIKeyVendor,
} from '@stores/useAIKeysStore';
import { checkAIStatus, checkAIKey, describeKeyCheckFailure, type AIKeyCheck } from '@/services/aiChatService';

type Choice = 'free' | AIKeyVendor;
type Step = 'choose' | 'key' | 'check';

const VENDOR_CHOICES: { id: AIKeyVendor; label: string }[] = [
  { id: 'openrouter', label: 'Own OpenRouter Key' },
  { id: 'anthropic', label: 'Anthropic Key' },
  { id: 'openai', label: 'OpenAI Key' },
];

function focusPrompt() {
  document.querySelector<HTMLTextAreaElement>('[data-testid="ai-panel"] textarea')?.focus();
}

function WizardBody({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('choose');
  const [vendor, setVendor] = useState<AIKeyVendor>('openrouter');
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<AIKeyCheck | null>(null);
  const [freeAvailable, setFreeAvailable] = useState(false);

  useEffect(() => {
    let live = true;
    void checkAIStatus().then((s) => { if (live) setFreeAvailable(s.free?.available === true); });
    return () => { live = false; };
  }, []);

  const key = draft.trim();

  useEffect(() => {
    if (step !== 'check') return;
    let live = true;
    setResult(null);
    void checkAIKey(vendor, key).then((r) => { if (live) setResult(r); });
    return () => { live = false; };
  }, [step, vendor, key]);

  const finish = (choice: Choice) => {
    const ai = useAIStore.getState();
    if (choice === 'free') {
      ai.setProvider('free');
    } else {
      useAIKeysStore.getState().setKey(choice, key);
      ai.setProvider(PROVIDER_FOR_VENDOR[choice]);
    }
    ai.open();
    onClose();
    // The panel is already mounted; wait a frame so an expanding panel has its prompt in the DOM.
    requestAnimationFrame(focusPrompt);
  };

  const choose = (choice: Choice) => {
    if (choice === 'free') { finish('free'); return; }
    setVendor(choice);
    setDraft('');
    setStep('key');
  };

  const info = AI_KEY_VENDORS[vendor];

  return (
    <>
      <ModalHeader title="Set Up AI Help" subtitle="Pick how the assistant gets its answers" onClose={onClose} />

      <div className="p-4 flex flex-col gap-3 text-xs font-mono text-text-secondary">
        {step === 'choose' && (
          <>
            <p>Choose where the AI assistant should get its answers.</p>
            <div className="flex flex-col gap-2">
              {freeAvailable && (
                <Button variant="default" onClick={() => choose('free')}>Free Models (No Key)</Button>
              )}
              {VENDOR_CHOICES.map((c) => (
                <Button key={c.id} variant="default" onClick={() => choose(c.id)}>{c.label}</Button>
              ))}
            </div>
            {!freeAvailable && (
              <p className="text-text-muted">Free models are not offered by this server. Use your own key.</p>
            )}
          </>
        )}

        {step === 'key' && (
          <>
            <p>
              1. Open the {info.label} key page and create a key.{' '}
              <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="text-accent-primary">
                {info.keyUrl}
              </a>
            </p>
            <p>2. Paste the key below. It is checked first, then stored only in this browser.</p>
            <label htmlFor="ai-wizard-key" className="text-text-muted">{info.label} API Key</label>
            <input
              id="ai-wizard-key"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="px-2 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs"
            />
          </>
        )}

        {step === 'check' && (
          <>
            {result === null && <p>Checking your {info.label} key...</p>}
            {result?.ok === true && (
              <p className="text-accent-success">
                The key works. {result.models} {result.models === 1 ? 'model is' : 'models are'} available to it.
              </p>
            )}
            {result?.ok === false && <p className="text-accent-error">{describeKeyCheckFailure(result)}</p>}
          </>
        )}
      </div>

      <ModalFooter>
        {step === 'choose' && <Button variant="ghost" onClick={onClose}>Not Now</Button>}
        {step === 'key' && (
          <>
            <Button variant="ghost" onClick={() => setStep('choose')}>Back</Button>
            <Button variant="primary" disabled={!key} onClick={() => setStep('check')}>Check Key</Button>
          </>
        )}
        {step === 'check' && (
          <>
            <Button variant="ghost" onClick={() => setStep('key')}>Back</Button>
            <Button variant="primary" disabled={result?.ok !== true} onClick={() => finish(vendor)}>Finish</Button>
          </>
        )}
      </ModalFooter>
    </>
  );
}

export function AISetupWizard() {
  const isOpen = useAIWizardStore((s) => s.isOpen);
  const close = useAIWizardStore((s) => s.close);
  if (!isOpen) return null;
  return (
    <Modal isOpen onClose={close} size="md" closeOnEnter={false}>
      <WizardBody onClose={close} />
    </Modal>
  );
}
