import { Widget, PanelLayout } from '@lumino/widgets';
import { Message } from '@lumino/messaging';
import { ChatStorageEngine } from './widget-storage';
import { ThreadListWidget } from "./widget-threads";
import { ChatMessageWidget } from './widget-message';
import type { LuminoLayoutWindow } from '../bundle/lumino.d';
import type { GlobalToolbarsWindow } from "../bundle/menu.d";
import type { WidgetExtensionsWindow } from '../bundle/widget-extensions';


// ============================================================================
// Types & Interfaces
// ============================================================================

const widgetSelf: LuminoLayoutWindow & GlobalToolbarsWindow & WidgetExtensionsWindow = self as unknown as any;

export type MessageRole = 'user' | 'assistant' | 'system';

export interface IChatMessage
{
	mode: number;
	path: string;
	role: MessageRole;
	contents: string;
	timestamp: number;
	parent?: string;
}

export interface IThreadMeta
{
	mode: number;
	path: string;
	contents: string;
	timestamp: number;
	modified: number;
	size: number;
	parent?: string;
}

export interface IChatWidgetOptions
{
	environment?: string;
	modelName?: string;
	workerUrl?: string;
}

// ============================================================================
// Main Container Widget
// ============================================================================

export class ChatWidget extends widgetSelf.AutoSidebarWidget<ThreadListWidget>
{
	private chatWidget: ChatMessageWidget;
	private storage: ChatStorageEngine;

	constructor(env?: string, options: IChatWidgetOptions = {})
	{
		super();
		this.id = 'lumino-chat-manager-panel';
		this.addClass('lm-ChatManagerPanel');

		// Lumino Title properties for tab managers (DockPanel, TabBar, etc.)
		this.title.label = env ?? 'Chat';
		this.title.iconClass = 'fa fa-comments';
		this.title.closable = true;

		// Set top-level PanelLayout to hold the inner SplitPanel
		const layout = new PanelLayout();
		this.layout = layout;

		this.storage = new ChatStorageEngine(env);

		this._sidebarWidget = new ThreadListWidget(this.storage);
		this.chatWidget = new ChatMessageWidget(this.storage, options);

		this.bindSignals();
	}


	/**
	 * Lumino Lifecycle Hook: Triggered once the widget is attached to the DOM.
	 */
	protected onAfterAttach(msg: Message): void
	{
		super.onAfterAttach(msg);
		if(!this.chatWidget.isAttached)
		{
			Widget.attach(this.chatWidget, this.node);
		}

		// Initialize storage & state asynchronously after attach
		this.init().catch((err) =>
		{
			console.error('Failed to initialize ChatManagerPanel:', err);
		});
	}

	/**
	 * Lumino Lifecycle Hook: Ensures internal split layouts recalculate on resize.
	 */
	protected onResize(msg: Widget.ResizeMessage): void
	{
		super.onResize(msg);

	}

	private async init(): Promise<void>
	{
		await this.storage.init();
		const threads = await this.storage.getAllThreads();

		if(threads.length > 0)
		{
			await this.chatWidget.loadThread(threads[0].path);
			await this._sidebarWidget?.refresh(threads[0].path);
		}
		else
		{
			const newId = await this.chatWidget.createNewThread();
			await this._sidebarWidget?.refresh(newId);
		}
	}

	private bindSignals(): void
	{
		// Select Thread
		this._sidebarWidget?.threadSelected.connect(async (_, threadId) =>
		{
			await this.chatWidget.loadThread(threadId);
		});

		// New Thread Request
		this._sidebarWidget?.newThreadRequested.connect(async () =>
		{
			const newId = await this.chatWidget.createNewThread();
			await this._sidebarWidget?.refresh(newId);
		});

		// Delete Thread
		this._sidebarWidget?.threadDeleted.connect(async (_, threadId) =>
		{
			await this.storage.deleteThread(threadId);
			const threads = await this.storage.getAllThreads();
			if(threads.length > 0)
			{
				await this.chatWidget.loadThread(threads[0].path);
				await this._sidebarWidget?.refresh(threads[0].path);
			}
			else
			{
				const newId = await this.chatWidget.createNewThread();
				await this._sidebarWidget?.refresh(newId);
			}
		});

		// Chat Updates -> Refresh List
		this.chatWidget.threadUpdated.connect(async (_, meta) =>
		{
			await this._sidebarWidget?.refresh(meta.path);
		});
	}
}
