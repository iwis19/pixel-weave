import { normalizeName } from './model.js';
import { MAX_PROJECT_BYTES } from './project-file.js';

const storageError = error => new Error(error?.name === 'QuotaExceededError'
  ? 'Browser storage is full. Download a project file to keep your work.'
  : 'Could not access saved projects. Project file download is still available.');

export class ProjectStore {
  constructor(name = 'pixel-weave-projects') { this.name = name; this.connection = null; }

  open() {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(storageError()); return; }
      const request = indexedDB.open(this.name, 1);
      let rejected = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('documents', { keyPath: 'id' });
      };
      request.onerror = () => reject(storageError(request.error));
      request.onblocked = () => { rejected = true; reject(new Error('Close other Pixel Weave tabs, then try opening saved projects again.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.connection = null; };
        resolve(db);
      };
    }).catch(error => { this.connection = null; throw error; });
    return this.connection;
  }

  async transaction(stores, mode, action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(storageError(tx.error));
      tx.onerror = () => { /* onabort reports transaction failures once. */ };
      try { action(tx, value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }

  async save({ id = crypto.randomUUID(), name, file, thumbnail = null }) {
    if (!(file instanceof Blob) || file.size > MAX_PROJECT_BYTES) throw new Error('Invalid or oversized project.');
    if (thumbnail && (!(thumbnail instanceof Blob) || thumbnail.size > 512 * 1024 || !thumbnail.type.startsWith('image/'))) throw new Error('Invalid project preview.');
    return this.transaction(['projects', 'documents'], 'readwrite', (tx, done) => {
      const meta = tx.objectStore('projects');
      const request = meta.get(id);
      request.onsuccess = () => {
        const now = Date.now();
        const record = { id, name: normalizeName(name), createdAt: request.result?.createdAt ?? now, updatedAt: now, thumbnail };
        meta.put(record); tx.objectStore('documents').put({ id, file }); done(record);
      };
    });
  }

  async list() {
    const records = await this.transaction(['projects'], 'readonly', (tx, done) => {
      const request = tx.objectStore('projects').getAll(); request.onsuccess = () => done(request.result);
    });
    return records.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  }

  async get(id) {
    return this.transaction(['projects', 'documents'], 'readonly', (tx, done) => {
      const meta = tx.objectStore('projects').get(id), document = tx.objectStore('documents').get(id);
      const complete = () => { if (meta.readyState === 'done' && document.readyState === 'done' && !meta.error && !document.error) done(meta.result && document.result ? { ...meta.result, file: document.result.file } : null); };
      meta.onsuccess = document.onsuccess = complete;
    });
  }

  async rename(id, name) {
    return this.transaction(['projects'], 'readwrite', (tx, done) => {
      const store = tx.objectStore('projects'), request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) { done(null); return; }
        const record = { ...request.result, name: normalizeName(name), updatedAt: Date.now() };
        store.put(record); done(record);
      };
    });
  }

  async remove(id) {
    return this.transaction(['projects', 'documents'], 'readwrite', tx => {
      tx.objectStore('projects').delete(id); tx.objectStore('documents').delete(id);
    });
  }

  async close() { if (this.connection) (await this.connection).close(); this.connection = null; }
}
