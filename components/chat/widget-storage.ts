import type { LocalWindow, SchemaIndexConfig, SchemaStoreConfig } from "../bundle/local.d";
import type { IChatMessage, IThreadMeta } from "./widget";

const storageSelf: LocalWindow = self as unknown as any;

export class ChatStorageEngine
{
	private env: string;
	private dbName: string;
	private db: IDBDatabase | null = null;
	public static META_STORE = '_threads_meta';


	constructor(env = 'development')
	{
		this.env = env;
		this.dbName = `llm_chat_${this.env}`;
	}

	/**
	 * Initializes the IndexedDB instance using storageSelf.setupDatabase or storageSelf.getDB if available,
	 * otherwise falls back to a standard IndexedDB connection with META_STORE schema.
	 */
	public async init(plusOne?: boolean): Promise<void>
	{
		const installCheck = await storageSelf.needsInstall?.(this.dbName, defaultStores);
		const shouldInstall = installCheck?.item3;
		if(shouldInstall && typeof storageSelf.deleteOldDatabase === 'function')
		{
			await storageSelf.deleteOldDatabase(this.dbName);
		}

		if(shouldInstall && typeof storageSelf.setupDatabase === 'function')
		{
			await storageSelf.setupDatabase(this.dbName, defaultStores);
		}

		// Preference 2: Global getDB helper
		if(typeof storageSelf.getDB === 'function')
		{
			this.db = await storageSelf.getDB(this.dbName, installCheck?.item2);
			return;
		}

		const currentVersion = await this.getCurrentDBVersion();

		await new Promise<void>((resolve, reject) =>
		{
			const req = indexedDB.open(this.dbName, (plusOne ? 1 : 0) + currentVersion);

			req.onupgradeneeded = (e: IDBVersionChangeEvent) =>
			{
				const db = req.result;
				if(!db.objectStoreNames.contains(ChatStorageEngine.META_STORE))
				{
					db.createObjectStore(ChatStorageEngine.META_STORE, { keyPath: 'path' });
				}
			};

			req.onsuccess = () =>
			{
				this.db = req.result;
				resolve();
			};

			req.onerror = () => reject(req.error);
		});

		if(!plusOne && !this.db?.objectStoreNames.contains(ChatStorageEngine.META_STORE))
		{
			await this.init(true);
		}
	}

	/**
	 * Inspects current IndexedDB version cleanly without keeping temporary connections open.
	 */
	private async getCurrentDBVersion(): Promise<number>
	{
		return await new Promise((resolve) =>
		{
			const req = indexedDB.open(this.dbName);
			req.onsuccess = () =>
			{
				const db = req.result;
				const version = db.version;
				db.close();
				resolve(version || 1);
			};
			req.onerror = () => resolve(1);
		});
	}

	/**
	 * Increments the IndexedDB version dynamically to create dedicated thread stores on demand.
	 */
	public async ensureThreadStore(threadId: string): Promise<void>
	{
		const storeName = `thread_${threadId}`;

		if(this.db && this.db.objectStoreNames.contains(storeName))
		{
			return;
		}

		const currentVersion = this.db ? this.db.version : await this.getCurrentDBVersion();

		if(this.db)
		{
			this.db.close();
			this.db = null;
		}

		return await new Promise((resolve, reject) =>
		{
			const nextVersion = currentVersion + 1;
			const req = indexedDB.open(this.dbName, nextVersion);

			req.onupgradeneeded = () =>
			{
				const db = req.result;

				if(!db.objectStoreNames.contains(ChatStorageEngine.META_STORE))
				{
					db.createObjectStore(ChatStorageEngine.META_STORE, { keyPath: 'path' });
				}

				if(!db.objectStoreNames.contains(storeName))
				{
					db.createObjectStore(storeName, { keyPath: 'path' });
				}
			};

			req.onsuccess = () =>
			{
				this.db = req.result;
				resolve();
			};

			req.onerror = () => reject(req.error);
		});
	}

	// ============================================================================
	// Thread Metadata Operations
	// ============================================================================

	public async getAllThreads(): Promise<IThreadMeta[]>
	{
		if(typeof storageSelf.readAll === 'function')
		{
			try
			{
				const results = await storageSelf.queryIndex?.(ChatStorageEngine.META_STORE, 'parent', '', undefined, undefined, this.dbName);
				if(Array.isArray(results) && results.length > 0)
				{
					return (results as unknown[] as IThreadMeta[]).sort((a, b) => b.modified - a.modified);
				}
			}
			catch(_)
			{
				// Fall back to direct IDB read if readAll is scoped to another store
			}
		}

		if(!this.db) return [];

		return await new Promise((resolve, reject) =>
		{
			const tx = this.db!.transaction(ChatStorageEngine.META_STORE, 'readonly');
			const store = tx.objectStore(ChatStorageEngine.META_STORE);
			const req = store.getAll();

			req.onsuccess = () =>
			{
				const threads: IThreadMeta[] = req.result || [];
				threads.sort((a, b) => b.modified - a.modified);
				resolve(threads);
			};

			req.onerror = () => reject(req.error);
		});
	}

	public async saveThreadMeta(meta: IThreadMeta): Promise<void>
	{
		await this.ensureThreadStore(meta.path);

		if(typeof storageSelf.putRecord === 'function')
		{
			await storageSelf.putRecord(ChatStorageEngine.META_STORE, meta as any, this.dbName, true);
			return;
		}

		return await new Promise((resolve, reject) =>
		{
			if(!this.db) return reject(new Error('Database context unavailable'));
			const tx = this.db.transaction(ChatStorageEngine.META_STORE, 'readwrite');
			const store = tx.objectStore(ChatStorageEngine.META_STORE);
			const req = store.put(meta);

			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}

	public async deleteThread(threadId: string): Promise<void>
	{
		if(typeof storageSelf.deleteRecord === 'function')
		{
			await storageSelf.deleteRecord(ChatStorageEngine.META_STORE, threadId, this.dbName);
			return;
		}

		if(!this.db) return;

		return await new Promise((resolve, reject) =>
		{
			const tx = this.db!.transaction(ChatStorageEngine.META_STORE, 'readwrite');
			const store = tx.objectStore(ChatStorageEngine.META_STORE);
			const req = store.delete(threadId);

			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}

	// ============================================================================
	// Message Store Operations
	// ============================================================================

	public async getMessages(threadId: string): Promise<IChatMessage[]>
	{
		const storeName = `thread_${threadId}`;

		if(!this.db || !this.db.objectStoreNames.contains(storeName))
		{
			return [];
		}

		return await new Promise((resolve, reject) =>
		{
			const tx = this.db!.transaction(storeName, 'readonly');
			const store = tx.objectStore(storeName);
			const req = store.getAll();

			req.onsuccess = () =>
			{
				const msgs: IChatMessage[] = req.result || [];
				msgs.sort((a, b) => a.timestamp - b.timestamp);
				resolve(msgs);
			};

			req.onerror = () => reject(req.error);
		});
	}

	public async saveMessage(threadId: string, message: IChatMessage): Promise<void>
	{
		await this.ensureThreadStore(threadId);
		const storeName = `thread_${threadId}`;

		if(typeof storageSelf.putRecord === 'function')
		{
			await storageSelf.putRecord(storeName, message as any, this.dbName, true);
			return;
		}

		return await new Promise((resolve, reject) =>
		{
			if(!this.db) return reject(new Error('Database context unavailable'));
			const tx = this.db.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);
			const req = store.put(message);

			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}

	public async saveAllMessages(threadId: string, messages: IChatMessage[]): Promise<void>
	{
		await this.ensureThreadStore(threadId);
		const storeName = `thread_${threadId}`;

		return await new Promise((resolve, reject) =>
		{
			if(!this.db) return reject(new Error('Database context unavailable'));
			const tx = this.db.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);

			for(const m of messages)
			{
				store.put(m);
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	public async deleteMessage(threadId: string, messageId: string): Promise<void>
	{
		const storeName = `thread_${threadId}`;

		if(typeof storageSelf.deleteRecord === 'function')
		{
			await storageSelf.deleteRecord(storeName, messageId, this.dbName);
			return;
		}

		if(!this.db || !this.db.objectStoreNames.contains(storeName)) return;

		return await new Promise((resolve, reject) =>
		{
			const tx = this.db!.transaction(storeName, 'readwrite');
			const store = tx.objectStore(storeName);
			const req = store.delete(messageId);

			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}
}

const defaultStores: SchemaStoreConfig[] = [
	{
		key: ChatStorageEngine.META_STORE,
		value: {
			item1: 'path',
			item2: [
				{ key: 'timestamp', value: 'timestamp' },
				{ key: 'parent', value: 'parent' }
			] as SchemaIndexConfig[]
		}
	}
];
