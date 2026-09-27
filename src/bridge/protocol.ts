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

/**
 * WebSocket close code the relay sends a browser tab when another tab takes
 * over. The relay serves one browser at a time and keeps the newest. A tab
 * closed with this code must not reconnect on its own: if it did, two open
 * tabs would keep evicting each other, and every MCP call would land in
 * whichever tab reconnected last, often one nobody is looking at.
 */
export const RELAY_REPLACED_CLOSE_CODE = 4001;

/**
 * Message the relay sends a browser tab when an MCP session (a Claude agent)
 * is attached - on the tab's connect if one already is, and when one
 * attaches later. The tab uses it to answer its crash-recovery prompt with
 * Restore straight away: every reload during an agent session (HMR from an
 * edit, hard_reload) brings the prompt up, and an agent that did not notice
 * left it blocking the user's screen.
 */
export const RELAY_AGENT_ATTACHED = 'agent-attached';
