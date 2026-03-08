/**
 * MCP Bridge Protocol — shared types (browser-side copy).
 * Must stay in sync with server/src/mcp/protocol.ts.
 */

export interface BridgeRequest {
  id: string;
  type: 'call';
  method: string;
  params: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  type: 'result' | 'error';
  data?: unknown;
  error?: string;
}
