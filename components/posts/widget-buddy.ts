import { Widget } from '@lumino/widgets';
import type { FileSystemWindow, LuminoLayoutWindow } from '../bundle/lumino.d';
import type { GlobalToolbarsWindow } from '../bundle/menu.d';
import type { IMainpanelOptions, WidgetExtensionsWindow } from '../bundle/widget-extensions';
import type { PostsWidget } from './widget';
import type { FileWidgetWindow } from '../filelist/widget.d';
import type { FileListWidget } from '../filelist/widget';
import type { NestedTreeNode } from '../bundle/github-tools';
import { BuddyUtilities } from './widget-utils';
import type { LocalWindow } from '../bundle/local.d';

export interface BuddyNode
{
	type: 'buddy';
	name: string;
	uri?: string;
	protocol?: string;
	lastSeen?: string;
}

export interface GroupNode
{
	type: 'group' | 'section';
	title: string;
	expanded: boolean;
	children: (GroupNode | BuddyNode)[];
}

const widgetSelf: LuminoLayoutWindow & GlobalToolbarsWindow & WidgetExtensionsWindow & FileWidgetWindow
	& FileSystemWindow & LocalWindow = self as unknown as any;

export class BuddyListWidget extends widgetSelf.SidebarChangeWidget<PostsWidget, BuddyNode>
{
	private _treeContainer: HTMLDivElement;
	private allNodes?: (BuddyNode | GroupNode)[];

	static EMPTY_TEXT = `
		<div class="bl-content-container">
			<div class="bl-dropzone-overlay visible">
				<i class="bx bx-cloud-upload"></i>
				<p>Drag & Drop <code>.xml</code> Buddy List File</p>
			</div>
			<div class="bl-tree-view"></div>
		</div>`;
	static EMPTY_FILES_TEXT = `
		<div class="bl-content-container">
			<div class="bl-dropzone-overlay visible">
				<i class="bx bx-cloud-upload"></i>
				<p>Open a Folder of <code>.xml</code> or <code>.log</code> Files.</p>
			</div>
			<div class="bl-tree-view"></div>
		</div>`;
	private _dropZone: HTMLDivElement;
	private fileList?: FileListWidget;
	private _dropContainer: HTMLDivElement;

	constructor(title?: string, options?: IMainpanelOptions<PostsWidget, BuddyNode[]>)
	{
		super(BuddyListWidget.name, title ?? 'Buddy List', options);
		this.addClass('lm-BuddyListWidget');
		this.title.iconClass = 'bx bx-user';
		this.title.closable = true;

		// Outer UI setup
		this.node.innerHTML = BuddyListWidget.EMPTY_TEXT;

		this._dropContainer = this.node.querySelector('.bl-content-container') as HTMLDivElement;
		this._treeContainer = this.node.querySelector('.bl-tree-view') as HTMLDivElement;
		this._dropZone = this.node.querySelector('.bl-dropzone-overlay') as HTMLDivElement;
	}


	public dropFiles(files: FileList)
	{
		for(const file of files)
		{
			this._readFile(file);
		}
	}


	private _readFile(file: File): void
	{
		const reader = new FileReader();
		reader.onload = (event: ProgressEvent<FileReader>) =>
		{
			const xmlString = event.target?.result as string;
			if(xmlString)
			{
				this.parseAndRender(xmlString);
			}
		};
		reader.readAsText(file);
	}

	public parseAndRender(xmlString: string): void
	{
		const parser = new DOMParser();
		const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

		// Check for parse errors
		const parserError = xmlDoc.querySelector('parsererror');
		if(parserError)
		{
			this._treeContainer.innerHTML = `<div class="bl-error">Error parsing XML document.</div>`;
			return;
		}

		const titleEl = xmlDoc.querySelector('buddies > title');
		if(titleEl && titleEl.textContent)
		{
			const headerTitle = this.node.querySelector('.bl-title-text');
			if(headerTitle) headerTitle.textContent = titleEl.textContent;
		}

		const rootNodes: (GroupNode | BuddyNode)[] = [];

		const sections = xmlDoc.querySelectorAll('buddies > section');
		if(sections.length > 0)
		{
			sections.forEach(sec => rootNodes.push(this._parseGroupOrSection(sec, 'section')));
		} else
		{
			const directGroups = xmlDoc.querySelectorAll('buddies > group');
			directGroups.forEach(grp => rootNodes.push(this._parseGroupOrSection(grp, 'group')));
		}

		this.allNodes = rootNodes;
		this.filterAndRender();
	}

	private _parseGroupOrSection(element: Element, defaultType: 'group' | 'section'): GroupNode
	{
		const rawTitle = element.querySelector(':scope > title')?.textContent || element.getAttribute('name') || 'Group';
		const expandedAttr = element.getAttribute('expanded');

		// Decode title strings (e.g. Y%21 -> Y!)
		const title = this._safeDecode(rawTitle);
		const expanded = expandedAttr === '1' || expandedAttr === null;

		const children: (GroupNode | BuddyNode)[] = [];

		element.childNodes.forEach(child =>
		{
			if(child.nodeType !== Node.ELEMENT_NODE) return;
			const childEl = child as Element;
			const tagName = childEl.tagName.toLowerCase();

			if(tagName === 'group' || tagName === 'section')
			{
				children.push(this._parseGroupOrSection(childEl, tagName as 'group' | 'section'));
			} else if(tagName === 'buddy')
			{
				const rawName = childEl.textContent || '';
				const uri = childEl.getAttribute('uri') || undefined;
				const lastSeenRaw = childEl.getAttribute('last_seen') || undefined;

				let protocol: string | undefined = undefined;
				if(uri)
				{
					protocol = uri.split(':')[0].toUpperCase();
				}

				let lastSeen: string | undefined = undefined;
				if(lastSeenRaw)
				{
					const timestamp = parseInt(lastSeenRaw, 10);
					if(!isNaN(timestamp))
					{
						lastSeen = new Date(timestamp * 1000).toLocaleString();
					}
				}

				children.push({
					type: 'buddy',
					name: this._safeDecode(rawName),
					uri: uri ? this._safeDecode(uri) : undefined,
					protocol,
					lastSeen
				});
			}
		});

		return {
			type: defaultType,
			title,
			expanded,
			children
		};
	}

	protected async filterAndRender(): Promise<void>
	{
		if(this.viewMode === this.VIEW_2)
		{
			if(!this.fileList && widgetSelf.FileListWidget)
			{
				this.fileList = new BuddyLogsWidget;
			}
			if(this.fileList && !this.fileList.isAttached)
			{
				Widget.attach(this.fileList, this.node);
			}
			if(this.fileList)
			{
				this.fileList.show();
			}
			this._dropContainer.style.display = 'none';
			this._dropZone.classList.remove('visible');

		} else
		{
			if(this.fileList)
			{
				this.fileList.hide();
			}
			if(!this.allNodes || this.allNodes.length === 0)
			{
				this._dropContainer.style.display = 'block';
				this._dropZone.classList.add('visible');
			}
		}


		this._treeContainer.innerHTML = '';
		if(this.allNodes && this.allNodes.length > 0)
		{
			this._dropZone.classList.remove('visible');
		}

		const fragment = document.createDocumentFragment();

		this.allNodes?.forEach(node =>
		{
			fragment.appendChild(this._buildNodeDOM(node));
		});

		this._treeContainer.appendChild(fragment);
	}

	private _buildNodeDOM(node: GroupNode | BuddyNode): HTMLElement
	{
		if(node.type === 'buddy')
		{
			const item = document.createElement('div');
			item.className = 'bl-buddy-item';

			const protoClass = node.protocol ? `proto-${node.protocol.toLowerCase()}` : 'proto-generic';

			item.innerHTML = `
				<span class="bl-protocol-badge ${protoClass}">${node.protocol || 'IM'}</span>
				<span class="bl-buddy-name" title="${node.uri || ''}">${node.name}</span>
				${node.lastSeen ? `<span class="bl-buddy-lastseen" title="Last Seen">${node.lastSeen}</span>` : ''}
				`;
			return item;
		} else
		{
			const groupContainer = document.createElement('div');
			groupContainer.className = `bl-group-node ${node.expanded ? 'expanded' : 'collapsed'}`;

			const header = document.createElement('div');
			header.className = 'bl-group-header';
			header.innerHTML = `
				<i class="bl-toggle-icon bx ${node.expanded ? 'bx-chevron-down' : 'bx-chevron-right'}"></i>
				<i class="bl-folder-icon bx ${node.type === 'section' ? 'bx-layer' : 'bx-folder'}"></i>
				<span class="bl-group-title">${node.title}</span>
				<span class="bl-group-count">(${node.children.length})</span>
				`;

			const childrenContainer = document.createElement('div');
			childrenContainer.className = 'bl-group-children';

			node.children.forEach(child =>
			{
				childrenContainer.appendChild(this._buildNodeDOM(child));
			});

			header.addEventListener('click', () =>
			{
				const isExpanded = groupContainer.classList.contains('expanded');
				if(isExpanded)
				{
					groupContainer.classList.remove('expanded');
					groupContainer.classList.add('collapsed');
					header.querySelector('.bl-toggle-icon')?.replaceWith(this._createIcon('bx-chevron-right'));
				} else
				{
					groupContainer.classList.remove('collapsed');
					groupContainer.classList.add('expanded');
					header.querySelector('.bl-toggle-icon')?.replaceWith(this._createIcon('bx-chevron-down'));
				}
			});

			groupContainer.appendChild(header);
			groupContainer.appendChild(childrenContainer);
			return groupContainer;
		}
	}

	private _createIcon(iconClass: string): HTMLElement
	{
		const i = document.createElement('i');
		i.className = `bl-toggle-icon bx ${iconClass}`;
		return i;
	}

	private _safeDecode(val: string): string
	{
		try
		{
			return decodeURIComponent(val);
		} catch
		{
			return val;
		}
	}
}


if(!widgetSelf.FileListWidget)
{
	await widgetSelf.preloadDependencies?.(['/components/filelist/widget.ts']);
}


export class BuddyLogsWidget extends widgetSelf.FileListWidget!
{
	protected nodes: NestedTreeNode[] | undefined;

	protected async initializeFiletrees(): Promise<void>
	{
		if(this.handle)
		{
			this.bindMutationObserver();
			this.nodes = await this.fetchLocalFiles();
			this.showFileTree(undefined, this.nodes);
			this.loadLogs();
		} else if(this._treeContainer)
		{
			this._treeContainer.innerHTML = BuddyListWidget.EMPTY_FILES_TEXT;
		}
	}


	protected async loadLogs()
	{
		if(!this.handle)
		{
			return;
		}

		const dirs = [this.handle];
		let current: FileSystemDirectoryHandle | undefined = undefined;
		while((current = dirs.pop()))
		{
			const list = await widgetSelf.listDirectory(current);
			for(const f of Object.values(list))
			{
				if(f.contents instanceof FileSystemFileHandle
					&& (f.path.endsWith('.xml') || f.path.endsWith('.log'))
				)
				{
					const contents = await (await (f.contents as FileSystemFileHandle).getFile()).arrayBuffer();
					const session = BuddyUtilities.parseAndRenderLog(new TextDecoder().decode(contents));
					const name = f.path.split('/').pop() ?? f.path;
					await BuddyUtilities.saveThreadMeta(session, this.defaultRepository);
					await BuddyUtilities.saveAllMessages(name, session.messages, this.defaultRepository);
				}
				else if((f.mode >> 12) & (widgetSelf.FS_DIR ?? (0o040000 | 0o755))
					&& f.contents instanceof FileSystemDirectoryHandle
				)
				{
					dirs.push(f.contents);
				}
			}
		}

	}

}
