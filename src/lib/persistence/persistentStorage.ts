/**
 * Ask the browser to keep this origin's storage (models, stem caches, rendered
 * DJ audio). Without it storage is "best-effort" and the browser may evict an
 * 84 MB model under pressure, so the next stem separation downloads it again.
 * Asked once per page; the browser decides (Chrome grants it to engaged or
 * installed sites without a prompt).
 */
let request: Promise<boolean> | null = null;

export function requestPersistentStorage(): Promise<boolean> {
  if (!request) {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    request = storage?.persist
      ? storage.persisted().then((already) => already || storage.persist()).catch(() => false)
      : Promise.resolve(false);
  }
  return request;
}

/** Tests only: forget the cached request. */
export function resetPersistentStorageRequestForTests(): void {
  request = null;
}
