import type { IMainpanelOptions, WidgetExtensionsWindow } from '../bundle/widget-extensions';
import type { GlobalToolbarsWindow } from '../bundle/menu.d';
import type { LuminoLayoutWindow } from '../bundle/lumino.d';
import { BuddyListWidget, BuddyNode } from './widget-buddy';
import { BuddyUtilities } from './widget-utils';

export interface ChatMessage
{
	type: 'incoming' | 'outgoing' | 'system';
	sender: string;
	displaySender: string;
	text: string;
	timestamp: string;
	medium: string;
	parent?: string;
	path?: string;
}

export interface ChatSession
{
	medium: string;
	toUser: string;
	fromUser: string;
	startTime?: string;
	messages: ChatMessage[];
	parent?: string;
	path?: string;
}


const widgetSelf: LuminoLayoutWindow & GlobalToolbarsWindow & WidgetExtensionsWindow = self as unknown as any;


export class PostsWidget extends widgetSelf.WithChangingWidget<PostsWidget, BuddyNode>
{
	private _chatContainer: HTMLDivElement;
	private currentSession?: ChatSession;

	static EMPTY_TEXT = `
		<div class="tc-content-wrapper">
			<div class="tc-dropzone-overlay">
				<i class="bx bx-file-find"></i>
				<p>Drop Chat Log File</p>
			</div>
			<div class="tc-messages-scroll">
				<div class="tc-welcome-state">
				<i class="bx bx-message-dots"></i>
				<p>No chat log loaded. Drop an exported XML chat log to parse and view transcript.</p>
				<div class="tc-meta-row">Drop a <code>.xml</code> or <code>.log</code> Trillian file here</div>
				</div>
			</div>
		</div>`;

	constructor(title?: string, options?: IMainpanelOptions<PostsWidget, BuddyNode[]>)
	{
		super(title ?? 'Chat Viewer', options);
		this.addClass('lm-TrillianChatWidget');
		this.title.iconClass = 'bx bx-chat';
		this.title.closable = true;

		this.node.innerHTML = PostsWidget.EMPTY_TEXT;

		this._chatContainer = this.node.querySelector('.tc-messages-scroll') as HTMLDivElement;
		this._sidebarWidget = new BuddyListWidget;
	}


	public dropFiles(files: FileList)
	{
		for(const file of files)
		{
			const reader = new FileReader();
			reader.onload = (event: ProgressEvent<FileReader>) =>
			{
				const content = event.target?.result as string;
				if(content)
				{
					this.currentSession = BuddyUtilities.parseAndRenderLog(file.name, content);
					this.filterAndRender();
				}
			};
			reader.readAsText(file);
		}
	}


	protected filterAndRender(): void
	{
		if(!this.currentSession)
		{
			this.node.innerHTML = PostsWidget.EMPTY_TEXT;
			return;
		}

		// badgeEl.textContent = this.currentSession.medium;
		// badgeEl.className = `tc-medium-badge proto-${this.currentSession.medium.toLowerCase()}`;
		// metaRow.innerHTML = `Chat with <strong>${this.currentSession.toUser || this.currentSession.fromUser}</strong> &bull; <span>${this.currentSession.startTime || 'Unknown Date'}</span>`;

		this._chatContainer.innerHTML = '';
		const fragment = document.createDocumentFragment();

		this.currentSession.messages.forEach(msg =>
		{
			const bubble = document.createElement('div');
			bubble.className = `tc-message-row ${msg.type}`;

			bubble.innerHTML = `
				<div class="tc-message-bubble">
					<div class="tc-msg-header">
					<span class="tc-msg-sender">${msg.displaySender}</span>
					<span class="tc-msg-time">${msg.timestamp}</span>
					</div>
					<div class="tc-msg-text">${this._escapeHtml(msg.text)}</div>
				</div>`;
			fragment.appendChild(bubble);
		});

		this._chatContainer.appendChild(fragment);
		this._chatContainer.scrollTop = this._chatContainer.scrollHeight;
	}

	private _escapeHtml(str: string): string
	{
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}
