import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './mcpServer';

// Reachability: the MCP tools reach the Express route paths and the browser load_file call.
describe('search_modarchive / load_modarchive', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('search_modarchive calls /api/modarchive/search; load_modarchive downloads then load_file in the browser', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      return String(url).includes('/search')
        ? new Response(JSON.stringify({ results: [{ id: 7 }] }))
        : new Response(new Uint8Array([1, 2, 3]));
    }));
    const callBrowser = vi.fn(async () => ({ ok: true }));
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer({ callBrowser }).connect(b);
    const client = new Client({ name: 't', version: '1' });
    await client.connect(a);

    await client.callTool({ name: 'search_modarchive', arguments: { query: 'jester' } });
    expect(urls.some((u) => u.includes('/api/modarchive/search?') && u.includes('q=jester'))).toBe(true);

    await client.callTool({ name: 'load_modarchive', arguments: { id: 7, filename: 'other.xm' } });
    expect(urls.some((u) => u.includes('/api/modarchive/download?id=7'))).toBe(true);
    expect(callBrowser).toHaveBeenCalledWith('load_file', expect.objectContaining({ filename: 'other.xm', data: 'AQID' }));
  });
});
