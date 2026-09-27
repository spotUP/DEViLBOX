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

/**
 * WebSocket close code the relay sends a browser tab when another tab takes
 * over. The relay serves one browser at a time and keeps the newest. A tab
 * closed with this code must not reconnect on its own: if it did, two open
 * tabs would keep evicting each other, and every MCP call would land in
 * whichever tab reconnected last, often one nobody is looking at.
 */
export const RELAY_REPLACED_CLOSE_CODE = 4001;
