import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { watchConnection, isConnectionLive } from '../idbConnection';

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('s');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

describe('idbConnection', () => {
  it('lets go on versionchange so the database can be deleted, and drops the handle', async () => {
    const conn = await open('idbConnTest');
    let dropped = false;
    watchConnection(conn, () => { dropped = true; });
    expect(isConnectionLive(conn)).toBe(true);
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase('idbConnTest');
      del.onsuccess = () => resolve();
      del.onblocked = () => reject(new Error('blocked'));
    });
    expect(dropped).toBe(true);
    expect(isConnectionLive(conn)).toBe(false);
  });
});
