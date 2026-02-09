/**
 * Project Library - IndexedDB storage for persistent project management
 * Stores .dbx files locally in the browser with full CRUD operations
 */

const DB_NAME = 'devilbox-library';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export interface StoredProject {
  id: string;
  name: string;
  data: string; // JSON stringified project data
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  thumbnail?: string; // Base64 encoded thumbnail
}

export interface ProjectMetadata {
  id: string;
  name: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  thumbnail?: string;
}

class ProjectLibrary {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[ProjectLibrary] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[ProjectLibrary] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('modifiedAt', 'modifiedAt', { unique: false });
          console.log('[ProjectLibrary] Object store created');
        }
      };
    });

    return this.initPromise;
  }

  private async ensureDb(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /**
   * Save a project to the library
   */
  async saveProject(name: string, data: object, id?: string): Promise<string> {
    const db = await this.ensureDb();
    const projectId = id || `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const jsonData = JSON.stringify(data);

    const project: StoredProject = {
      id: projectId,
      name,
      data: jsonData,
      size: jsonData.length,
      createdAt: id ? (await this.getProject(id))?.createdAt || new Date() : new Date(),
      modifiedAt: new Date(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(project);

      request.onsuccess = () => {
        console.log('[ProjectLibrary] Project saved:', name);
        resolve(projectId);
      };

      request.onerror = () => {
        console.error('[ProjectLibrary] Failed to save project:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a project by ID
   */
  async getProject(id: string): Promise<StoredProject | null> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Load project data by ID
   */
  async loadProject(id: string): Promise<object | null> {
    const project = await this.getProject(id);
    if (!project) return null;

    try {
      return JSON.parse(project.data);
    } catch (error) {
      console.error('[ProjectLibrary] Failed to parse project data:', error);
      return null;
    }
  }

  /**
   * Delete a project by ID
   */
  async deleteProject(id: string): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log('[ProjectLibrary] Project deleted:', id);
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * List all projects (metadata only, not full data)
   */
  async listProjects(): Promise<ProjectMetadata[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const projects = (request.result as StoredProject[]).map(p => ({
          id: p.id,
          name: p.name,
          size: p.size,
          createdAt: p.createdAt,
          modifiedAt: p.modifiedAt,
          thumbnail: p.thumbnail,
        }));
        // Sort by modified date, newest first
        projects.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
        resolve(projects);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Rename a project
   */
  async renameProject(id: string, newName: string): Promise<void> {
    const project = await this.getProject(id);
    if (!project) throw new Error('Project not found');

    project.name = newName;
    project.modifiedAt = new Date();

    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(project);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Duplicate a project
   */
  async duplicateProject(id: string): Promise<string> {
    const project = await this.getProject(id);
    if (!project) throw new Error('Project not found');

    const data = JSON.parse(project.data);
    return this.saveProject(`${project.name} (Copy)`, data);
  }

  /**
   * Export project as downloadable file
   */
  async exportProject(id: string): Promise<Blob> {
    const project = await this.getProject(id);
    if (!project) throw new Error('Project not found');

    return new Blob([project.data], { type: 'application/json' });
  }

  /**
   * Import project from file data
   */
  async importProject(name: string, fileContent: string): Promise<string> {
    const data = JSON.parse(fileContent);
    return this.saveProject(name, data);
  }

  /**
   * Get total storage used
   */
  async getStorageUsed(): Promise<number> {
    const projects = await this.listProjects();
    return projects.reduce((total, p) => total + p.size, 0);
  }

  /**
   * Clear all projects
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[ProjectLibrary] All projects cleared');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

// Singleton instance
export const projectLibrary = new ProjectLibrary();
