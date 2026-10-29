import { Widget } from "@lumino/widgets";
import type { LuminoLayoutWindow } from "../bundle/lumino.d";

export interface DropCapableWidget
{
	dropFiles(files: FileList): void | Promise<void>;
	node: HTMLElement;
}

const dragSelf: LuminoLayoutWindow = self as unknown as any;

export class GlobalDropManager
{
	private static instance: GlobalDropManager | null = null;
	private isInitialized: boolean = false;
	private overlayEl: HTMLElement | null = null;
	private dragCounter: number = 0;
	private mouseX: number = 0;
	private mouseY: number = 0;
	private dragLeave?: NodeJS.Timeout;

	private constructor() { }

	public static init(): GlobalDropManager
	{
		if(!GlobalDropManager.instance)
		{
			GlobalDropManager.instance = new GlobalDropManager();
		}
		GlobalDropManager.instance.setupGlobalListeners();
		return GlobalDropManager.instance;
	}

	private setupGlobalListeners(): void
	{
		if(this.isInitialized) return;
		this.isInitialized = true;

		// Create coverall overlay element
		this.overlayEl = document.createElement('div');
		this.overlayEl.className = 'global-drop-overlay';
		this.overlayEl.innerHTML = `
            <div class="global-drop-card">
                <i class="bx bx-cloud-upload global-drop-icon"></i>
                <h2>Drop Files to Import</h2>
                <p>Release anywhere over a panel to send files to its target zone.</p>
            </div>
        `;
		document.body.appendChild(this.overlayEl);

		document.addEventListener('mousemove', (e: MouseEvent) =>
		{
			this.mouseX = e.clientX;
			this.mouseY = e.clientY;
		});

		window.addEventListener('dragover', (e) =>
		{
			e.preventDefault();
			e.stopPropagation();
			this.mouseX = e.clientX;
			this.mouseY = e.clientY;
			this.showOverlay();
			if(this.dragLeave)
			{
				clearTimeout(this.dragLeave);
				this.dragLeave = undefined;
			}
		}, false);

		window.addEventListener('dragenter', (e: DragEvent) =>
		{
			e.preventDefault();
			e.stopPropagation();
			this.showOverlay();
			if(this.dragLeave)
			{
				clearTimeout(this.dragLeave);
				this.dragLeave = undefined;
			}
		});

		window.addEventListener('dragleave', (e: DragEvent) =>
		{
			e.preventDefault();
			e.stopPropagation();
			this.dragCounter = 0;
			const that = this;
			this.dragLeave = setTimeout(() => that.hideOverlay(), 1000);
		});

		window.addEventListener('drop', async (e: DragEvent) =>
		{
			e.preventDefault();
			e.stopPropagation();
			this.dragCounter = 0;
			this.hideOverlay();

			const files = e.dataTransfer?.files;
			if(!files || files.length === 0) return;

			// Find all visible Lumino panels from mainDock
			const widgets = this.getVisibleWidgets();
			let handled = false;

			for(const widget of widgets)
			{
				if(this.isPointInsideWidget(widget, this.mouseX, this.mouseY))
				{
					if('dropFiles' in widget && typeof (widget as any).dropFiles === 'function')
					{
						try
						{
							await (widget as DropCapableWidget).dropFiles(files);
							handled = true;
							break;
						}
						catch(err)
						{
							console.error('Error processing dropped files in widget:', err);
						}
					}
				}
			}

			if(!handled)
			{
				console.warn('GlobalDropManager: Files dropped, but no valid drop target widget was found under the cursor.');
			}
		});
	}

	private getVisibleWidgets(): Widget[]
	{
		if(!dragSelf.mainDock || typeof dragSelf.mainDock.widgets !== 'function')
		{
			return [];
		}
		try
		{
			// Filter down to widgets currently active/visible in the dock layout
			const allWidgets = Array.from(dragSelf.mainDock.widgets());
			return allWidgets.filter(w => w && w.node && w.node.isConnected && w.node.offsetParent !== null);
		}
		catch(err)
		{
			console.error('GlobalDropManager: Failed to retrieve dock widgets:', err);
			return [];
		}
	}

	private isPointInsideWidget(widget: Widget, x: number, y: number): boolean
	{
		if(!widget.node) return false;
		const rect = widget.node.getBoundingClientRect();
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
	}

	private showOverlay(): void
	{
		document.body.classList.add('dragging');
		const widgets = this.getVisibleWidgets();
		let matchedWidget: Widget | null = null;

		// Check if mouse is over any drop-capable widget
		for(const widget of widgets)
		{
			if(this.isPointInsideWidget(widget, this.mouseX, this.mouseY))
			{
				if('dropFiles' in widget && typeof (widget as DropCapableWidget).dropFiles === 'function')
				{
					matchedWidget = widget;
					break;
				}
			}
		}

		if(matchedWidget && matchedWidget.node)
		{
			// Size and snap indicator to the matched panel's exact size/position
			const rect = matchedWidget.node.getBoundingClientRect();
			if(this.overlayEl)
			{
				this.overlayEl.style.top = `${rect.top}px`;
				this.overlayEl.style.left = `${rect.left}px`;
				this.overlayEl.style.width = `${rect.width}px`;
				this.overlayEl.style.height = `${rect.height}px`;
				this.overlayEl.classList.add('active', 'panel-matched');
			}

			// Also flag internal dropzones if present
			const zone = matchedWidget.node.querySelector('[class*="dropzone"]') as HTMLElement;
			if(zone) zone.classList.add('active');
		}
		else
		{
			// Fallback to full screen/viewport dimensions if not over a specific panel
			if(this.overlayEl)
			{
				this.overlayEl.style.top = '0px';
				this.overlayEl.style.left = '0px';
				this.overlayEl.style.width = '100vw';
				this.overlayEl.style.height = '100vh';
				this.overlayEl.classList.add('active');
				this.overlayEl.classList.remove('panel-matched');
			}
		}
	}

	private hideOverlay(): void
	{
		document.body.classList.remove('dragging');

		// Clean up any active dropzone classes on widgets
		const widgets = this.getVisibleWidgets();
		for(const widget of widgets)
		{
			if(widget.node)
			{
				const zone = widget.node.querySelector('[class*="dropzone"]') as HTMLElement;
				if(zone) zone.classList.remove('active');
			}
		}

		if(this.overlayEl)
		{
			this.overlayEl.classList.remove('active', 'panel-matched');
			// Reset inline styles back to default
			this.overlayEl.style.top = '';
			this.overlayEl.style.left = '';
			this.overlayEl.style.width = '';
			this.overlayEl.style.height = '';
		}
	}
}
