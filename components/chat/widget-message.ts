
// ============================================================================
// Main Coordinator / Split Dock Coordinator Component
// ============================================================================

import type { ChatStorageEngine } from "./widget-storage";
import type { IChatMessage, IChatWidgetOptions, IThreadMeta } from "./widget";
import { Widget } from '@lumino/widgets';
import { Message } from '@lumino/messaging';
import { Signal } from '@lumino/signaling';
import { CreateWebWorkerMLCEngine, type MLCEngineInterface } from '@mlc-ai/web-llm';

// ============================================================================
// Lumino Main ChatWidget Component
// ============================================================================

export class ChatMessageWidget extends Widget
{
	public readonly threadUpdated = new Signal<this, IThreadMeta>(this);

	private storage: ChatStorageEngine;
	private engine: MLCEngineInterface | null = null;
	private modelName: string;
	private workerUrl: string;

	private currentThread: IThreadMeta | null = null;
	private messages: IChatMessage[] = [];
	private isGenerating = false;

	// DOM Elements
	private messagesContainer?: HTMLDivElement;
	private inputTextArea?: HTMLTextAreaElement;
	private sendButton?: HTMLButtonElement;
	private statusBanner?: HTMLDivElement;

	constructor(storage: ChatStorageEngine, options: IChatWidgetOptions = {})
	{
		super();
		this.storage = storage;
		this.modelName = options.modelName ?? 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC'; //?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
		this.workerUrl = options.workerUrl ?? '/components/chat/chat-worker.mjs';

		this.id = 'lumino-chat-widget';
		this.title.label = 'Chat';
		this.title.closable = true;

		this.addClass('lm-ChatWidget');
		this.buildDOM();
		this.initEngine();
	}

	private buildDOM(): void
	{
		this.node.style.display = 'flex';
		this.node.style.flexDirection = 'column';
		this.node.style.height = '100%';
		this.node.style.width = '100%';
		this.node.style.backgroundColor = '#1e1e1e';
		this.node.style.color = '#d4d4d4';
		this.node.style.fontFamily = 'system-ui, -apple-system, sans-serif';

		// Status / Progress Banner
		this.statusBanner = document.createElement('div');
		this.statusBanner.style.padding = '6px 12px';
		this.statusBanner.style.backgroundColor = '#252526';
		this.statusBanner.style.fontSize = '12px';
		this.statusBanner.style.color = '#007acc';
		this.statusBanner.style.borderBottom = '1px solid #333';
		this.statusBanner.innerText = 'Initializing WebLLM Engine...';
		this.node.appendChild(this.statusBanner);

		// Messages Area
		this.messagesContainer = document.createElement('div');
		this.messagesContainer.style.flex = '1';
		this.messagesContainer.style.overflowY = 'auto';
		this.messagesContainer.style.padding = '16px';
		this.messagesContainer.style.display = 'flex';
		this.messagesContainer.style.flexDirection = 'column';
		this.messagesContainer.style.gap = '12px';
		this.node.appendChild(this.messagesContainer);

		// Input Control Dock
		const inputDock = document.createElement('div');
		inputDock.style.padding = '12px';
		inputDock.style.borderTop = '1px solid #333';
		inputDock.style.display = 'flex';
		inputDock.style.gap = '8px';
		inputDock.style.backgroundColor = '#252526';

		this.inputTextArea = document.createElement('textarea');
		this.inputTextArea.rows = 2;
		this.inputTextArea.placeholder = 'Type your message (Shift+Enter for newline)...';
		this.inputTextArea.style.flex = '1';
		this.inputTextArea.style.backgroundColor = '#3c3c3c';
		this.inputTextArea.style.color = '#fff';
		this.inputTextArea.style.border = '1px solid #555';
		this.inputTextArea.style.borderRadius = '4px';
		this.inputTextArea.style.padding = '8px';
		this.inputTextArea.style.resize = 'none';
		this.inputTextArea.style.fontFamily = 'inherit';

		this.inputTextArea.onkeydown = (e) =>
		{
			if(e.key === 'Enter' && !e.shiftKey)
			{
				e.preventDefault();
				this.handleSend();
			}
		};

		this.sendButton = document.createElement('button');
		this.sendButton.innerText = 'Send';
		this.sendButton.style.padding = '0 16px';
		this.sendButton.style.backgroundColor = '#0e639c';
		this.sendButton.style.color = '#fff';
		this.sendButton.style.border = 'none';
		this.sendButton.style.borderRadius = '4px';
		this.sendButton.style.cursor = 'pointer';
		this.sendButton.onclick = () => this.handleSend();

		inputDock.appendChild(this.inputTextArea);
		inputDock.appendChild(this.sendButton);
		this.node.appendChild(inputDock);
	}

	private async initEngine(): Promise<void>
	{
		try
		{
			const worker = new Worker(this.workerUrl, { type: 'module' });
			this.engine = await CreateWebWorkerMLCEngine(worker, this.modelName, {
				initProgressCallback: (report) =>
				{
					if(this.statusBanner)
					{
						this.statusBanner.innerText = `Engine: ${report.text}`;
						if(report.progress === 1)
						{
							this.statusBanner.style.display = 'none';
						}
					}
				},
			});
			if(this.statusBanner)
			{
				this.statusBanner.style.display = 'none';
			}
		} catch(err: any)
		{
			if(this.statusBanner)
			{
				this.statusBanner.innerText = `Failed to load WebLLM Worker: ${err.message || err}`;
				this.statusBanner.style.color = '#f48771';
			}
		}
	}

	public async loadThread(threadId: string): Promise<void>
	{
		const threads = await this.storage.getAllThreads();
		let meta = threads.find((t) => t.path === threadId);

		if(!meta)
		{
			meta = {
				mode: (0o100000 | 0o666),
				path: threadId,
				contents: 'New Conversation',
				timestamp: Date.now(),
				modified: Date.now(),
				size: 0,
				parent: ''
			};
			await this.storage.saveThreadMeta(meta);
		}

		this.currentThread = meta;
		this.title.label = meta.contents;
		this.messages = await this.storage.getMessages(threadId);
		this.renderMessages();
	}

	public async createNewThread(): Promise<string>
	{
		const id = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
		await this.loadThread(id);
		this.threadUpdated.emit(this.currentThread!);
		return id;
	}

	// --- Message Render Logic ---

	private renderMessages(): void
	{
		if(this.messagesContainer)
		{
			this.messagesContainer.innerHTML = '';
		}

		for(let i = 0; i < this.messages.length; i++)
		{
			const msg = this.messages[i];
			const bubble = document.createElement('div');
			bubble.style.display = 'flex';
			bubble.style.flexDirection = 'column';
			bubble.style.alignSelf = msg.role === 'user' ? 'flex-end' : 'flex-start';
			bubble.style.maxWidth = '80%';
			bubble.style.backgroundColor = msg.role === 'user' ? '#04395e' : '#2d2d30';
			bubble.style.padding = '10px 14px';
			bubble.style.borderRadius = '8px';
			bubble.style.position = 'relative';

			// Text Header
			const header = document.createElement('div');
			header.style.fontSize = '11px';
			header.style.color = '#aaa';
			header.style.marginBottom = '4px';
			header.style.display = 'flex';
			header.style.justifyContent = 'space-between';
			header.innerText = msg.role === 'user' ? 'You' : 'Assistant';

			// Body Content
			const body = document.createElement('div');
			body.style.whiteSpace = 'pre-wrap';
			body.style.wordBreak = 'break-word';
			body.style.fontSize = '14px';
			body.innerText = msg.contents;

			// Action Bar
			const actions = document.createElement('div');
			actions.style.marginTop = '8px';
			actions.style.display = 'flex';
			actions.style.gap = '8px';
			actions.style.fontSize = '11px';

			const copyBtn = this.createActionButton('Copy', () => navigator.clipboard.writeText(msg.contents));
			const editBtn = this.createActionButton('Edit', () => this.handleEditMessage(i));
			const deleteBtn = this.createActionButton('Delete', () => this.handleDeleteMessage(i));

			actions.appendChild(copyBtn);
			actions.appendChild(editBtn);
			actions.appendChild(deleteBtn);

			if(msg.role === 'user')
			{
				const retryBtn = this.createActionButton('Retry', () => this.handleRetry(i));
				actions.appendChild(retryBtn);
			}

			bubble.appendChild(header);
			bubble.appendChild(body);
			bubble.appendChild(actions);

			this.messagesContainer?.appendChild(bubble);
		}

		if(this.messagesContainer)
		{
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	private createActionButton(label: string, onClick: () => void): HTMLButtonElement
	{
		const btn = document.createElement('button');
		btn.innerText = label;
		btn.style.background = 'none';
		btn.style.border = 'none';
		btn.style.color = '#007acc';
		btn.style.cursor = 'pointer';
		btn.style.padding = '0';
		btn.onclick = onClick;
		return btn;
	}

	// --- Handlers & Actions ---

	private async handleSend(): Promise<void>
	{
		const text = this.inputTextArea?.value.trim();
		if(!text || this.isGenerating) return;

		if(!this.currentThread)
		{
			await this.createNewThread();
		}

		if(this.inputTextArea)
		{
			this.inputTextArea.value = '';
		}

		const userMsg: IChatMessage = {
			mode: (0o100000 | 0o666),
			path: `msg_${Date.now()}`,
			role: 'user',
			contents: text,
			timestamp: Date.now(),
			parent: this.currentThread?.path
		};

		this.messages.push(userMsg);
		await this.storage.saveMessage(this.currentThread!.path, userMsg);
		await this.updateMetadata();

		this.renderMessages();
		await this.generateAssistantResponse();
	}

	private async generateAssistantResponse(): Promise<void>
	{
		if(!this.engine || !this.currentThread)
		{
			return;
		}

		await this.engine;

		this.isGenerating = true;
		if(this.sendButton)
		{
			this.sendButton.disabled = true;
		}

		const assistantMsg: IChatMessage = {
			mode: (0o100000 | 0o666),
			path: `msg_${Date.now()}`,
			role: 'assistant',
			contents: '',
			timestamp: Date.now(),
			parent: this.currentThread?.path
		};

		this.messages.push(assistantMsg);
		this.renderMessages();

		try
		{
			const apiMessages = this.messages
				.filter((m) => m.contents.length > 0)
				.map((m) => ({ role: m.role, content: m.contents }));

			const chunks = await this.engine.chat.completions.create({
				messages: apiMessages,
				stream: true,
			});

			for await(const chunk of chunks)
			{
				const delta = chunk.choices[0]?.delta?.content || '';
				assistantMsg.contents += delta;
				this.renderMessages();
			}

			// Save complete message instantly to IDB
			await this.storage.saveMessage(this.currentThread.path, assistantMsg);
			await this.updateMetadata();

			// Trigger parallel Title Generation if thread title is default
			if(this.currentThread.contents === 'New Conversation' || this.currentThread.contents === 'Untitled Thread')
			{
				this.generateTitleQuickly();
			}
		} catch(err: any)
		{
			assistantMsg.contents += `\n[Error: ${err.message || err}]`;
			await this.storage.saveMessage(this.currentThread.path, assistantMsg);
		} finally
		{
			this.isGenerating = false;
			if(this.sendButton)
			{
				this.sendButton.disabled = false;
			}
		}
	}

	private async generateTitleQuickly(): Promise<void>
	{
		if(!this.engine || !this.currentThread || this.messages.length === 0) return;

		try
		{
			const firstUserMsg = this.messages.find((m) => m.role === 'user')?.contents || '';
			const response = await this.engine.chat.completions.create({
				messages: [
					{
						role: 'system',
						content: 'Be quick: summarize the following prompt into a concise 3-5 word title. Return ONLY the title text.',
					},
					{ role: 'user', content: firstUserMsg },
				],
				stream: false,
			});

			const title = response.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
			if(title)
			{
				this.currentThread.contents = title;
				this.title.label = title;
				await this.storage.saveThreadMeta(this.currentThread);
				this.threadUpdated.emit(this.currentThread);
			}
		} catch(e)
		{
			// Ignore title generation errors
		}
	}

	private async handleEditMessage(index: number): Promise<void>
	{
		const msg = this.messages[index];
		const updated = prompt('Edit message:', msg.contents);
		if(updated !== null && updated.trim() !== msg.contents)
		{
			msg.contents = updated.trim();
			await this.storage.saveMessage(this.currentThread!.path, msg);
			this.renderMessages();
		}
	}

	private async handleDeleteMessage(index: number): Promise<void>
	{
		const msg = this.messages[index];
		this.messages.splice(index, 1);
		await this.storage.deleteMessage(this.currentThread!.path, msg.path);
		await this.updateMetadata();
		this.renderMessages();
	}

	private async handleRetry(index: number): Promise<void>
	{
		if(this.isGenerating) return;
		// Truncate messages down to the selected user message
		const truncated = this.messages.slice(0, index + 1);
		this.messages = truncated;
		await this.storage.saveAllMessages(this.currentThread!.path, this.messages);
		await this.updateMetadata();
		this.renderMessages();
		await this.generateAssistantResponse();
	}

	private async updateMetadata(): Promise<void>
	{
		if(!this.currentThread) return;
		this.currentThread.size = this.messages.length;
		this.currentThread.modified = Date.now();
		await this.storage.saveThreadMeta(this.currentThread);
		this.threadUpdated.emit(this.currentThread);
	}

	// --- Lumino Widget Lifecycle Overrides ---

	protected onResize(msg: Widget.ResizeMessage): void
	{
		super.onResize(msg);
		if(this.messagesContainer)
		{
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	protected onActivateRequest(msg: Message): void
	{
		super.onActivateRequest(msg);
		if(this.inputTextArea)
		{
			this.inputTextArea.focus();
		}
	}
}
