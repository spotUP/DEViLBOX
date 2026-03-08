#!/usr/bin/env node
/**
 * DEViLBOX MCP Server Entry Point
 *
 * Starts the WebSocket relay (port 4003) and MCP stdio transport.
 * Run: npx tsx server/src/mcp/index.ts
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startRelay } from './wsRelay';
import { createMcpServer } from './mcpServer';

async function main(): Promise<void> {
  // Start the WS relay for browser communication (non-fatal if port is busy)
  try {
    startRelay();
  } catch (err) {
    console.error('[mcp] WS relay failed to start (port busy?), MCP will work without browser bridge');
  }

  // Create and start the MCP server on stdio
  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error('[mcp] DEViLBOX MCP server running on stdio');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});
