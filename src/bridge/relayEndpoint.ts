/**
 * Where the MCP relay lives, spelled once.
 *
 * The relay (`server/`, port 4003) runs on the developer's machine next to
 * Vite; nothing serves it on the live host. Two places spelled its address
 * their own way: `MCPBridge` connected to `ws://localhost:4003`, while the
 * status badges probed `ws://${location.hostname}:4003/probe` — on the HTTPS
 * live page that is an insecure WebSocket to a public host, and the browser
 * refused it with a "Mixed Content" error every 15 s (40+ lines per session,
 * ledger F17). `localhost` is a potentially trustworthy origin, so a
 * `ws://localhost` connection from an HTTPS page is allowed; a public
 * hostname over `ws://` is not.
 */
export const RELAY_PORT = 4003;
export const RELAY_WS_URL = `ws://localhost:${RELAY_PORT}`;
/** Health probe path: the relay answers without claiming the single browser slot. */
export const RELAY_PROBE_URL = `${RELAY_WS_URL}/probe`;
