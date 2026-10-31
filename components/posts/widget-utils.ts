import type { GithubWindow } from "../bundle/github.d";
import type { SchemaIndexConfig, SchemaStoreConfig } from "../bundle/local.d";
import type { FileSystemWindow, LuminoLayoutWindow } from "../bundle/lumino.d";
import type { ChatMessage, ChatSession } from "./widget";


const widgetSelf: LuminoLayoutWindow & FileSystemWindow & GithubWindow = self as unknown as any;


export class BuddyUtilities
{
	public static META_STORE = '_logs_meta';
	public static MESSAGE_STORE = '_logs_message';
	private static db: IDBDatabase | null = null;


	/**
	 * Inspects current IndexedDB version cleanly without keeping temporary connections open.
	 */
	private static async getCurrentDBVersion(dbName: string): Promise<number>
	{
		return await new Promise((resolve) =>
		{
			const req = indexedDB.open(dbName);
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
	public static async ensureThreadStore(threadId: string, dbName: string): Promise<void>
	{
		if(this.db && this.db.objectStoreNames.contains(BuddyUtilities.MESSAGE_STORE)
			&& this.db.objectStoreNames.contains(BuddyUtilities.META_STORE))
		{
			return;
		}

		const currentVersion = this.db ? this.db.version : await this.getCurrentDBVersion(dbName);

		if(this.db)
		{
			this.db.close();
			this.db = null;
		}

		return await new Promise((resolve, reject) =>
		{
			const nextVersion = currentVersion + 1;
			const req = indexedDB.open(dbName, nextVersion);

			req.onupgradeneeded = () =>
			{
				const db = req.result;

				if(!db.objectStoreNames.contains(BuddyUtilities.META_STORE))
				{
					db.createObjectStore(BuddyUtilities.META_STORE, { keyPath: 'path' });
				}

				if(!db.objectStoreNames.contains(BuddyUtilities.MESSAGE_STORE))
				{
					db.createObjectStore(BuddyUtilities.MESSAGE_STORE, { keyPath: 'path' });
				}
			};

			req.onsuccess = () =>
			{
				this.db = req.result;
				resolve();
			};

			req.onerror = () => reject(req.error);

			// CRITICAL: Prevent infinite hangs if another connection/tab has the database open
			req.onblocked = () =>
			{
				reject(new Error(`IndexedDB upgrade to version ${nextVersion} blocked. Close other open tabs or connections to '${dbName}'.`));
			};
		});
	}


	public static async saveAllMessages(threadId: string, messages: ChatMessage[], dbName: string): Promise<void>
	{
		if(messages.length === 0)
		{
			return;
		}

		try
		{
			await this.ensureThreadStore(threadId, dbName);
		}
		catch(e)
		{
			console.error(e);
		}

		return await new Promise((resolve, reject) =>
		{
			if(!this.db) return reject(new Error('Database context unavailable'));
			const tx = this.db.transaction(BuddyUtilities.MESSAGE_STORE, 'readwrite');
			const store = tx.objectStore(BuddyUtilities.MESSAGE_STORE);

			for(const m of messages)
			{
				store.put(m);
			}

			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}


	public static parseAndRenderLog(threadId: string, rawContent: string): ChatSession
	{
		const lines = rawContent.split(/\r?\n/);
		const session: ChatSession = {
			medium: 'IM',
			toUser: '',
			fromUser: '',
			messages: [],
			path: threadId
		};

		// Regex matchers matching your python logic
		const sessionXmlPattern = /<session\s+([^>]+)>/i;
		const messageXmlPattern = /<message\s+([^>]+)>/i;

		for(const line of lines)
		{
			const trimmed = line.trim();
			if(!trimmed) continue;

			if(sessionXmlPattern.test(trimmed))
			{
				session.medium = this._extractAttr(trimmed, 'medium') || 'IM';
				session.toUser = this._safeDecode(this._extractAttr(trimmed, 'to') || '');
				session.fromUser = this._safeDecode(this._extractAttr(trimmed, 'from') || '');
				const timeVal = this._extractAttr(trimmed, 'time');
				if(timeVal)
				{
					const ts = parseInt(timeVal, 10);
					if(!isNaN(ts))
					{
						session.startTime = new Date(ts * 1000).toLocaleString();
					}
				}
			} else if(messageXmlPattern.test(trimmed))
			{
				const msgType = this._extractAttr(trimmed, 'type') || 'incoming_privateMessage';
				const timeVal = this._extractAttr(trimmed, 'time');
				const textVal = this._extractAttr(trimmed, 'text') || '';
				const fromVal = this._extractAttr(trimmed, 'from') || '';
				const displayVal = this._extractAttr(trimmed, 'from_display') || fromVal;

				let timestampStr = '';
				if(timeVal)
				{
					const ts = parseInt(timeVal, 10);
					if(!isNaN(ts))
					{
						timestampStr = new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
					}
				}

				const isOutgoing = msgType.includes('outgoing');
				session.messages.push({
					type: isOutgoing ? 'outgoing' : 'incoming',
					sender: this._safeDecode(fromVal),
					displaySender: this._safeDecode(displayVal),
					text: this._safeDecode(textVal),
					timestamp: timestampStr,
					medium: session.medium,
					path: threadId + timestampStr,
					parent: threadId
				});
			}
		}

		return session;

	}



	private static _extractAttr(tagString: string, attrName: string): string | null
	{
		const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
		const match = tagString.match(regex);
		return match ? match[1] : null;
	}


	private static _safeDecode(val: string): string
	{
		try
		{
			return decodeURIComponent(val.replace(/\+/g, ' '));
		} catch
		{
			return val;
		}
	}


	public static async saveThreadMeta(meta: ChatSession, dbName: string): Promise<void>
	{
		if(!meta.path)
		{
			return;
		}

		await this.ensureThreadStore(meta.path, dbName);

		if(typeof widgetSelf.putRecord === 'function')
		{
			await widgetSelf.putRecord(BuddyUtilities.META_STORE, meta as any, dbName, true);
			return;
		}

		return await new Promise((resolve, reject) =>
		{
			if(!this.db) return reject(new Error('Database context unavailable'));
			const tx = this.db.transaction(BuddyUtilities.META_STORE, 'readwrite');
			const store = tx.objectStore(BuddyUtilities.META_STORE);
			const req = store.put(meta);

			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}

}

const defaultStores: SchemaStoreConfig[] = [
	{
		key: BuddyUtilities.META_STORE,
		value: {
			item1: 'path',
			item2: [
				{ key: 'timestamp', value: 'timestamp' },
				{ key: 'parent', value: 'parent' }
			] as SchemaIndexConfig[]
		}
	}
];
