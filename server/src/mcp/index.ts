#!/usr/bin/env node
/**
 * DEViLBOX MCP Server Entry Point
 *
 * Starts the WebSocket relay (port 4003) and MCP stdio transport.
 * Run: npx tsx server/src/mcp/index.ts
 *
 * Phase timing is logged to stderr (captured by Claude Code) so the
 * tool-discovery race documented in MCP_DEBUGGING_GUIDE.md can be
 * diagnosed without ad-hoc logging: if "MCP server running on stdio"
 * lands more than ~2 s after spawn, the harness may have already
 * cached an empty tools/list result.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startRelay } from './wsRelay';
import { createMcpServer } from './mcpServer';

// Earliest possible ready-marker — lets the harness know we're alive
// before the 163 tool registrations or any async I/O runs.
console.error(`[mcp] subprocess spawned (pid=${process.pid})`);
const spawnedAt = Date.now();

async function main(): Promise<void> {
  // Start the WS relay for browser communication (non-fatal if port is busy).
  try {
    startRelay();
  } catch (err) {
    console.error('[mcp] WS relay failed to start (port busy?), MCP will work without browser bridge');
  }
  console.error(`[mcp] +${Date.now() - spawnedAt}ms relay started`);

  // Register all tools synchronously (163 server.tool() calls).
  const mcpServer = createMcpServer();
  console.error(`[mcp] +${Date.now() - spawnedAt}ms tools registered`);

  // Open stdio transport — from here the MCP SDK can answer tools/list.
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error(`[mcp] +${Date.now() - spawnedAt}ms ready — DEViLBOX MCP server running on stdio`);
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});
