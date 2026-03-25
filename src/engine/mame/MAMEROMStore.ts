/**
 * MAMEROMStore — IndexedDB persistence for MAME chip ROMs.
 *
 * ROMs are stored per chipName. When a synth needs a ROM:
 * 1. Try fetch from /public/roms/{chipName}/ (disk)
 * 2. If fails, try IndexedDB
 * 3. If not found, show upload prompt
 */

const DB_NAME = 'devilbox-roms';
const STORE_NAME = 'roms';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save a ROM to IndexedDB, keyed by chipName.
 */
export async function saveROM(chipName: string, data: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(data, chipName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Load a ROM from IndexedDB by chipName. Returns null if not found.
 */
export async function loadROM(chipName: string): Promise<Uint8Array | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(chipName);
    req.onsuccess = () => {
      db.close();
      const result = req.result as Uint8Array | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Check whether a ROM exists in IndexedDB for the given chipName.
 */
export async function hasROM(chipName: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getKey(chipName);
    req.onsuccess = () => {
      db.close();
      resolve(req.result !== undefined);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Delete a ROM from IndexedDB by chipName.
 */
export async function deleteROM(chipName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(chipName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
