// Scratch: call one bridge method over the MCP relay (new tools not yet visible to this session).
import WebSocket from 'ws';
const [method, json] = process.argv.slice(2);
const ws = new WebSocket('ws://localhost:4003/mcp');
ws.on('open', () => {
  const id = `zz-${Date.now()}`;
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id !== id) return; console.log(JSON.stringify(m.result?.data ?? m.data ?? m.result ?? m, null, 1)); ws.close(); });
  ws.send(JSON.stringify({ id, type: 'call', method, params: json ? JSON.parse(json) : {} }));
});
