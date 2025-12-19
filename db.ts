
export class RapidCutDB {
  private dbName = 'RapidCutStorage';
  private storeName = 'assets'; 
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 3); // 升級版本以觸發 schema 變更
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

  async saveAsset(id: string, data: Blob): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(data, id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject('Save asset failed');
    });
  }

  async getAsset(id: string): Promise<Blob | null> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject('Get asset failed');
    });
  }

  async deleteAsset(id: string): Promise<void> {
    if (!this.db) await this.init();
    const transaction = this.db!.transaction([this.storeName], 'readwrite');
    transaction.objectStore(this.storeName).delete(id);
  }
}

export const assetDB = new RapidCutDB();
