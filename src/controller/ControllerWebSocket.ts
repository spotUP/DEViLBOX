/**
 * ControllerWebSocket — lightweight WebSocket client for the iPhone controller.
 *
 * Connects to the DEViLBOX WS relay at ws://<host>:4003/controller
 * and sends BridgeRequest commands, receives BridgeResponse results.
 */

let ws: WebSocket | null = null;
let connectPromise: Promise<void> | null = null;
const pending = new Map<string, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
let onStatusChange: ((connected: boolean) => void) | null = null;

let msgId = 0;
function nextId(): string {
  return `ctrl-${++msgId}-${Date.now().toString(36)}`;
}

export function setStatusCallback(cb: (connected: boolean) => void): void {
  onStatusChange = cb;
}

export function connect(host: string, port = 4003): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
  if (connectPromise) return connectPromise;

  connectPromise = new Promise<void>((resolve, reject) => {
    const url = `ws://${host}:${port}/controller`;
    console.log(`[Controller] Connecting to ${url}`);
    const socket = new WebSocket(url);

    socket.onopen = () => {
      ws = socket;
      connectPromise = null;
      onStatusChange?.(true);
      console.log('[Controller] Connected');
      resolve();
    };

    socket.onclose = () => {
      ws = null;
      connectPromise = null;
      onStatusChange?.(false);
      // Reject all pending
      for (const [, p] of pending) {
        p.reject(new Error('WebSocket closed'));
      }
      pending.clear();
    };

    socket.onerror = () => {
      connectPromise = null;
      reject(new Error('WebSocket connection failed'));
    };

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          if (msg.type === 'error') {
            p.reject(new Error(msg.error));
          } else {
            p.resolve(msg.data);
          }
        }
      } catch { /* ignore parse errors */ }
    };
  });

  return connectPromise;
}

export function disconnect(): void {
  ws?.close();
  ws = null;
}

export function isConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

/**
 * Call a bridge method on the desktop DEViLBOX instance.
 * Returns the result data or throws on error.
 */
export function call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected'));
      return;
    }

    const id = nextId();
    pending.set(id, { resolve, reject });

    ws.send(JSON.stringify({ id, type: 'call', method, params }));

    // Timeout after 5s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 5000);
  });
}
