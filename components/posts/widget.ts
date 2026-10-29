import { Widget } from '@lumino/widgets';
import type { IMainpanelOptions, WidgetExtensionsWindow } from '../bundle/widget-extensions';
import type { GlobalToolbarsWindow } from '../bundle/menu.d';
import type { LuminoLayoutWindow } from '../bundle/lumino.d';
import { BuddyListWidget, BuddyNode } from './widget-buddy';

export interface ChatMessage
{
	type: 'incoming' | 'outgoing' | 'system';
	sender: string;
	displaySender: string;
	text: string;
	timestamp: string;
	medium: string;
}

export interface ChatSession
{
	medium: string;
	toUser: string;
	fromUser: string;
	startTime?: string;
	messages: ChatMessage[];
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
					this.parseAndRenderLog(content);
				}
			};
			reader.readAsText(file);
		}
	}


	public parseAndRenderLog(rawContent: string): void
	{
		const lines = rawContent.split(/\r?\n/);
		const session: ChatSession = {
			medium: 'IM',
			toUser: '',
			fromUser: '',
			messages: []
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
					medium: session.medium
				});
			}
		}

		this.currentSession = session;
		this.filterAndRender();
	}

	private _extractAttr(tagString: string, attrName: string): string | null
	{
		const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
		const match = tagString.match(regex);
		return match ? match[1] : null;
	}

	private _safeDecode(val: string): string
	{
		try
		{
			return decodeURIComponent(val.replace(/\+/g, ' '));
		} catch
		{
			return val;
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
