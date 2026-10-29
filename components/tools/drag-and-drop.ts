import type { LuminoLayoutWindow } from "../bundle/lumino.d";

export interface DropCapableWidget
{
	dropFiles(files: FileList): void | Promise<void>;
}

const dragSelf: LuminoLayoutWindow = self as unknown as any;

export class GlobalDropManager
{
	private static instance: GlobalDropManager | null = null;
	private isInitialized: boolean = false;
	private overlayEl: HTMLElement | null = null;
	private dragCounter: number = 0; // Tracks enter/leave nesting
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
                <p>Release anywhere to send files to the active workspace or target zone.</p>
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

		// Track drag enter/leave with a counter to prevent flicker on child elements
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
			let has = false;
			e.preventDefault();
			e.stopPropagation();
			this.dragCounter = 0;
			this.hideOverlay();

			const files = e.dataTransfer?.files;
			if(!files || files.length === 0) return;

			// const targetEl = (e.target as HTMLElement)?.closest('[class*="dropzone"]');
			// if(targetEl)
			// {
			// 	// Dispatch a custom event so the local target can handle it if desired
			// 	const customDropEvent = new CustomEvent('target-dropped', {
			// 		detail: { files },
			// 		bubbles: true,
			// 		cancelable: true
			// 	});
			// 	targetEl.dispatchEvent(customDropEvent);
			// 	return;
			// }

			if(dragSelf.lastInteractedWidget
				&& 'dropFiles' in dragSelf.lastInteractedWidget
				&& typeof dragSelf.lastInteractedWidget.dropFiles === 'function')
			{
				try
				{
					await dragSelf.lastInteractedWidget.dropFiles(files);
					has = true;
				} catch(err)
				{
					console.error('Error processing dropped files in lastInteractedWidget:', err);
				}
			}

			if(dragSelf.previousInteractedWidget
				&& 'dropFiles' in dragSelf.previousInteractedWidget
				&& typeof dragSelf.previousInteractedWidget.dropFiles === 'function')
			{
				try
				{
					await dragSelf.previousInteractedWidget.dropFiles(files);
					has = true;
				} catch(err)
				{
					console.error('Error processing dropped files in previousInteractedWidget:', err);
				}
			}

			if(!has)
			{
				console.warn('GlobalDropManager: Files dropped, but no target or lastUsedWidget.dropFiles handler found.');
			}
		});
	}

	private hasFiles(e: DragEvent): boolean
	{
		if(!e.dataTransfer?.types) return false;
		return Array.from(e.dataTransfer.types).includes('Files');
	}

	private showOverlay(): void
	{
		let has = false;
		document.body.classList.add('dragging');
		let bounds: DOMRect | undefined;
		if(dragSelf.lastInteractedWidget)
		{
			const zone = dragSelf.lastInteractedWidget.node.querySelector('[class*="dropzone"]') as HTMLElement;
			const bounds = zone.getBoundingClientRect();
			if(this.mouseX >= bounds.x
				&& this.mouseX <= bounds.x + bounds.width
				&& this.mouseY >= bounds.y
				&& this.mouseY <= bounds.y + bounds.height)
			{
				zone.classList.add('active');
				has = true;
			}
		}

		if(dragSelf.previousInteractedWidget)
		{
			const zone = dragSelf.previousInteractedWidget.node.querySelector('[class*="dropzone"]') as HTMLElement;
			const bounds = zone.getBoundingClientRect();
			if(this.mouseX >= bounds.x
				&& this.mouseX <= bounds.x + bounds.width
				&& this.mouseY >= bounds.y
				&& this.mouseY <= bounds.y + bounds.height)
			{
				zone.classList.add('active');
				has = true;
			}
		}

		if(this.overlayEl && !has)
		{
			this.overlayEl.classList.add('active');
		}
	}

	private hideOverlay(): void
	{
		let zone: HTMLElement | undefined;
		document.body.classList.remove('dragging');
		if(dragSelf.lastInteractedWidget
			&& (zone = dragSelf.lastInteractedWidget.node.querySelector('[class*="dropzone"]') as HTMLElement)
		)
		{
			zone.classList.remove('active');
		}
		if(dragSelf.previousInteractedWidget
			&& (zone = dragSelf.previousInteractedWidget.node.querySelector('[class*="dropzone"]') as HTMLElement)
		)
		{
			zone.classList.remove('active');
		}
		if(this.overlayEl)
		{
			this.overlayEl.classList.remove('active');
		}
	}
}
