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
  // Start the WS relay for browser communication
  startRelay();

  // Create and start the MCP server on stdio
  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  console.error('[mcp] DEViLBOX MCP server running (stdio + ws://localhost:4003)');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});
