import { createMemoryCache, type PositionEval } from '@blocksuite/chess-engine';
import { type IDBPDatabase, openDB } from 'idb';

export interface AsyncEvalCache {
  get(key: string): Promise<PositionEval | undefined>;
  set(key: string, value: PositionEval): Promise<void>;
  clear(): Promise<void>;
}

export function createAsyncMemoryCache(limit = 256): AsyncEvalCache {
  const inner = createMemoryCache(limit);
  return {
    get: async key => inner.get(key),
    set: async (key, value) => {
      inner.set(key, value);
    },
    clear: async () => {
      inner.clear();
    },
  };
}

const DB_NAME = 'chess-engine-eval';
const STORE = 'evals';
const DB_VERSION = 1;
const MAX_ENTRIES = 2048;

type EvalRecord = {
  key: string;
  value: PositionEval;
  accessedAt: number;
};

export class IdbEvalCache implements AsyncEvalCache {
  private constructor(private readonly db: IDBPDatabase) {}

  static async open(): Promise<IdbEvalCache> {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'key' });
        }
      },
    });
    return new IdbEvalCache(db);
  }

  async get(key: string): Promise<PositionEval | undefined> {
    const record = (await this.db.get(STORE, key)) as EvalRecord | undefined;
    if (!record) return undefined;
    await this.db.put(STORE, { ...record, accessedAt: Date.now() });
    return record.value;
  }

  async set(key: string, value: PositionEval): Promise<void> {
    await this.db.put(STORE, { key, value, accessedAt: Date.now() });
    await this.evict();
  }

  async clear(): Promise<void> {
    await this.db.clear(STORE);
  }

  private async evict(): Promise<void> {
    const all = (await this.db.getAll(STORE)) as EvalRecord[];
    if (all.length <= MAX_ENTRIES) return;
    all.sort((a, b) => a.accessedAt - b.accessedAt);
    const extra = all.length - MAX_ENTRIES;
    const tx = this.db.transaction(STORE, 'readwrite');
    for (let i = 0; i < extra; i++) {
      await tx.store.delete(all[i].key);
    }
    await tx.done;
  }
}

/** Memory first; IDB when the browser has it. */
export async function createPersistentCache(): Promise<AsyncEvalCache> {
  const memory = createAsyncMemoryCache();
  if (typeof indexedDB === 'undefined') return memory;

  try {
    const idb = await IdbEvalCache.open();
    return {
      async get(key) {
        const hot = await memory.get(key);
        if (hot) return hot;
        const cold = await idb.get(key);
        if (cold) await memory.set(key, cold);
        return cold;
      },
      async set(key, value) {
        await memory.set(key, value);
        await idb.set(key, value);
      },
      async clear() {
        await memory.clear();
        await idb.clear();
      },
    };
  } catch {
    return memory;
  }
}
