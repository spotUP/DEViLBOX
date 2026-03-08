/**
 * MCP Bridge Protocol — shared types between MCP server and browser bridge.
 */

/** Request sent from MCP server to browser via WebSocket */
export interface BridgeRequest {
  id: string;
  type: 'call';
  method: string;
  params: Record<string, unknown>;
}

/** Response sent from browser to MCP server via WebSocket */
export interface BridgeResponse {
  id: string;
  type: 'result' | 'error';
  data?: unknown;
  error?: string;
}
