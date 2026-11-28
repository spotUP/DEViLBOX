/**
 * Shared IndexedDB connection recovery. A cached connection goes dead when its database is
 * deleted or upgraded elsewhere (another tab, DevTools): every transaction then throws
 * InvalidStateError until a page reload. Caches call watchConnection on open and
 * isConnectionLive before reusing a cached handle.
 */

/** On versionchange close the connection and on close, call `drop` so the cache forgets its handle. */
export function watchConnection(conn: IDBDatabase, drop: () => void): void {
  conn.onversionchange = () => { conn.close(); drop(); };
  conn.onclose = drop;
}

/** False when the connection closed without an event (a transaction throws InvalidStateError); other errors rethrow. */
export function isConnectionLive(conn: IDBDatabase): boolean {
  const store = conn.objectStoreNames[0];
  if (!store) return true;
  try { conn.transaction(store, 'readonly'); return true; } catch (err) {
    if (err instanceof DOMException && err.name === 'InvalidStateError') return false;
    throw err;
  }
}
