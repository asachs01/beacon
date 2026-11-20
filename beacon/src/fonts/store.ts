/**
 * Uploaded `.woff2` files live in IndexedDB, not in the settings JSON.
 * A 2 MB face would blow past localStorage and the add-on settings payload.
 */

const DB_NAME = 'beacon-fonts';
const DB_VERSION = 1;
const STORE = 'faces';

export interface StoredFontFile {
  id: string;
  fileName: string;
  data: ArrayBuffer;
}

export interface FontFileStore {
  get(id: string): Promise<StoredFontFile | null>;
  put(file: StoredFontFile): Promise<void>;
  delete(id: string): Promise<void>;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export const idbFontStore: FontFileStore = {
  async get(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const result = await requestToPromise(tx.objectStore(STORE).get(id));
      await transactionDone(tx);
      return (result as StoredFontFile | undefined) ?? null;
    } finally {
      db.close();
    }
  },
  async put(file) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      await requestToPromise(tx.objectStore(STORE).put(file));
      await transactionDone(tx);
    } finally {
      db.close();
    }
  },
  async delete(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      await requestToPromise(tx.objectStore(STORE).delete(id));
      await transactionDone(tx);
    } finally {
      db.close();
    }
  },
};
