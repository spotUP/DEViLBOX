/**
 * The AI panel's model picker and tool-call view, tested where the logic
 * lives: the store's pure helpers and actions, and the message component's
 * state word. The wiring through POST /api/ai/chat is proven once, in
 * server/src/ai/aiRoute.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultModel,
  modelOptionsFor,
  readPersistedAIPanel,
  useAIStore,
} from '../useAIStore';
import { toolCallState } from '@components/ai/AIMessage';

describe('readPersistedAIPanel', () => {
  it('reads a version 1 record (isOpen only) as the Free provider with no model choices', () => {
    expect(readPersistedAIPanel({ isOpen: true })).toEqual({ isOpen: true, provider: 'free', modelByProvider: {} });
  });

  it('reads nothing stored as a closed panel on the Free provider', () => {
    expect(readPersistedAIPanel(undefined)).toEqual({ isOpen: false, provider: 'free', modelByProvider: {} });
    expect(readPersistedAIPanel(null)).toEqual({ isOpen: false, provider: 'free', modelByProvider: {} });
  });

  it('keeps a valid provider and its model choices', () => {
    const saved = readPersistedAIPanel({
      isOpen: false,
      provider: 'anthropic',
      modelByProvider: { anthropic: 'claude-haiku-5-5', claude: 'opus' },
    });
    expect(saved.provider).toBe('anthropic');
    expect(saved.modelByProvider).toEqual({ anthropic: 'claude-haiku-5-5', claude: 'opus' });
  });

  it('drops an unknown provider and model entries that are not non-empty strings', () => {
    const saved = readPersistedAIPanel({
      isOpen: 'yes',
      provider: 'nobody',
      modelByProvider: { nobody: 'x', anthropic: '', openai: 7, claude: 'sonnet' },
    });
    expect(saved).toEqual({ isOpen: false, provider: 'free', modelByProvider: { claude: 'sonnet' } });
  });
});

describe('modelOptionsFor', () => {
  it('lists Automatic first, then the models the key can use', () => {
    const options = modelOptionsFor(
      'anthropic',
      { anthropic: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }] },
      'auto',
    );
    expect(options).toEqual([
      { value: 'auto', label: 'Automatic (Best model for your key)' },
      { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    ]);
  });

  it('never lists a model twice', () => {
    const options = modelOptionsFor('anthropic', { anthropic: [{ id: 'auto', label: 'Auto' }, { id: 'm', label: 'M' }] }, 'm');
    expect(options.map((o) => o.value)).toEqual(['auto', 'm']);
  });

  it('gives the chosen model an option before the key list arrives', () => {
    const options = modelOptionsFor('anthropic', {}, 'claude-haiku-5-5');
    expect(options.map((o) => o.value)).toEqual(['auto', 'claude-haiku-5-5']);
    expect(options[1].label).toBe('claude-haiku-5-5');
  });

  it('ignores vendor lists for a provider that has no key of its own', () => {
    const options = modelOptionsFor('claude', { anthropic: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' }] }, 'haiku');
    expect(options.map((o) => o.value)).toEqual(['haiku', 'sonnet', 'opus']);
  });
});

describe('useAIStore model choice', () => {
  beforeEach(() => {
    useAIStore.setState({
      provider: 'free',
      model: 'auto',
      modelByProvider: {},
      vendorModels: {},
      activeModel: null,
      conversationId: null,
      messages: [],
    });
  });

  it('keeps the model chosen for each provider across a provider switch', () => {
    const store = useAIStore.getState();
    store.setProvider('anthropic');
    store.setModel('claude-haiku-5-5');
    store.setProvider('claude');
    expect(useAIStore.getState().model).toBe(getDefaultModel('claude'));
    useAIStore.getState().setModel('opus');
    useAIStore.getState().setProvider('anthropic');
    expect(useAIStore.getState().model).toBe('claude-haiku-5-5');
    useAIStore.getState().setProvider('claude');
    expect(useAIStore.getState().model).toBe('opus');
  });

  it('starts a new conversation and forgets the answering model on a provider switch', () => {
    useAIStore.setState({ conversationId: 'c1', activeModel: 'claude-sonnet-5-5' });
    useAIStore.getState().setProvider('anthropic');
    expect(useAIStore.getState().conversationId).toBeNull();
    expect(useAIStore.getState().activeModel).toBeNull();
  });

  it('stores the key model list per vendor', () => {
    useAIStore.getState().setVendorModels('anthropic', [{ id: 'm', label: 'M' }]);
    expect(useAIStore.getState().vendorModels).toEqual({ anthropic: [{ id: 'm', label: 'M' }] });
  });
});

describe('tool calls of a chat turn', () => {
  beforeEach(() => {
    useAIStore.setState({ messages: [] });
  });

  it('shows Running until the result arrives, then Done; an empty result still finishes the call', () => {
    const store = useAIStore.getState();
    const id = store.addAssistantMessage();
    store.addToolCall(id, { tool: 'add_pattern', input: { length: 64 } });
    expect(toolCallState(useAIStore.getState().messages[0].toolCalls[0])).toBe('Running');
    store.addToolResult(id, 'add_pattern', '');
    const call = useAIStore.getState().messages[0].toolCalls[0];
    expect(call.result).toBe('');
    expect(toolCallState(call)).toBe('Done');
  });

  it('shows Failed for a call the tool reported as an error', () => {
    const store = useAIStore.getState();
    const id = store.addAssistantMessage();
    store.addToolCall(id, { tool: 'set_cell', input: {} });
    store.addToolResult(id, 'set_cell', 'Row out of range', true);
    expect(toolCallState(useAIStore.getState().messages[0].toolCalls[0])).toBe('Failed');
  });

  it('finishes calls of one tool in the order they started', () => {
    const store = useAIStore.getState();
    const id = store.addAssistantMessage();
    store.addToolCall(id, { tool: 'set_cells', input: { n: 1 } });
    store.addToolCall(id, { tool: 'set_cells', input: { n: 2 } });
    store.addToolResult(id, 'set_cells', 'first');
    const calls = useAIStore.getState().messages[0].toolCalls;
    expect(calls.map((c) => c.result)).toEqual(['first', undefined]);
    store.addToolResult(id, 'set_cells', 'second');
    expect(useAIStore.getState().messages[0].toolCalls.map((c) => c.result)).toEqual(['first', 'second']);
  });
});
