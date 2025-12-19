
export class RapidCutDB {
  private dbName = 'RapidCutStorage';
  private storeName = 'asset_handles'; // 改名以區分舊版
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2); // 升級版本
      request.onerror = () => reject('IndexedDB failed');
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async saveHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(handle, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Save handle failed');
    });
  }

  async getHandle(id: string): Promise<FileSystemFileHandle | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject('Get handle failed');
    });
  }

  async deleteHandle(id: string): Promise<void> {
    if (!this.db) await this.init();
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    transaction.objectStore(this.storeName).delete(id);
  }
}

export const assetDB = new RapidCutDB();
