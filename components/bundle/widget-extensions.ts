import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";
import type { LuminoLayoutWindow } from "./lumino.d";
import { ISignal, Signal } from '@lumino/signaling';
import type { GlobalToolbarsWindow, RepositorySettingsWindow } from "./menu.d";
import { ITabButton, WidgetWithSearchBar } from "./widget-search";
import { ComponentRoute } from "./menu";

const widgetSelf: WidgetExtensionsWindow & LuminoLayoutWindow & GlobalToolbarsWindow
	& RepositorySettingsWindow = self as unknown as any;

export interface WidgetExtensionsWindow
{
	GenericSearchableWidget: typeof GenericSearchableWidget;
	SingletonSidebarWidget: typeof SingletonSidebarWidget;
	SidebarUpdateWidget: typeof SidebarUpdateWidget;
	AutoSidebarWidget: typeof AutoSidebarWidget;
	SidebarChangeWidget: typeof SidebarChangeWidget;
	WithChangingWidget: typeof WithChangingWidget;
}


export class GenericSearchableWidget extends WidgetWithSearchBar implements ITabButton
{
	protected readonly VIEW_1 = 'cards';
	protected readonly VIEW_2 = 'grid';
	protected readonly VIEW_1_ICON = 'bx bx-list';
	protected readonly VIEW_2_ICON = 'bx bx-grid';
	protected readonly VIEW_1_LABEL = 'List View';
	protected readonly VIEW_2_LABEL = 'Cards View';
	protected viewMode: typeof this.VIEW_1 | typeof this.VIEW_2 = this.VIEW_1;
	public _toggleBtn?: HTMLElement | HTMLDivElement;


	constructor(title?: string, options?: Widget.IOptions)
	{
		super(options);
		this.title.label = title ?? this.defaultTitle;
		this.title.iconClass = this.defaultIcon;
		this.title.closable = true;
	}

	protected get defaultTitle(): string
	{
		return (Object.values(widgetSelf.MODULE_REGISTRY ?? {}).find((m: ComponentRoute) =>
		{
			return m.className === this.constructor.name;
		}) as ComponentRoute)?.label
			?? (Object.values(widgetSelf.TOOLS_REGISTRY ?? {}).find((m: ComponentRoute) =>
			{
				return m.className === this.constructor.name;
			}) as ComponentRoute)?.label;
	}


	protected get defaultIcon(): string
	{
		return (Object.values(widgetSelf.MODULE_REGISTRY ?? {}).find((m: ComponentRoute) =>
		{
			return m.className === this.constructor.name;
		}) as ComponentRoute)?.iconClass
			?? (Object.values(widgetSelf.TOOLS_REGISTRY ?? {}).find((m: ComponentRoute) =>
			{
				return m.className === this.constructor.name;
			}) as ComponentRoute)?.iconClass;
	}


	protected override onAfterAttach(msg: Message): void
	{
		super.onAfterAttach(msg);
		const that = this;
		setTimeout(() =>
		{
			if('renderToggleBtn' in that && typeof that.renderToggleBtn === 'function'
				&& 'clickToggleBtn' in that && typeof that.clickToggleBtn === 'function'
			)
			{
				WidgetWithSearchBar.attachToggleIcon(that, that.renderToggleBtn.bind(that), that.clickToggleBtn.bind(that));
			}
		}, 200);
	}


	protected override onBeforeDetach(msg: Message): void
	{
		if(this._toggleBtn)
		{
			this._toggleBtn?.remove();
			this._toggleBtn = undefined;
		}
		super.onBeforeDetach(msg);
	}

	protected renderToggleBtn(toggle: HTMLElement)
	{
		toggle.innerHTML = `<i class="${this.viewMode === this.VIEW_2 ? this.VIEW_1_ICON : this.VIEW_2_ICON}"></i>`;
		toggle.title = this.viewMode === this.VIEW_2 ? this.VIEW_1_LABEL : this.VIEW_2_LABEL;
	}


	protected clickToggleBtn()
	{
		this.viewMode = this.viewMode === this.VIEW_2 ? this.VIEW_1 : this.VIEW_2;
		if('renderLayout' in this && typeof this.renderLayout === 'function')
		{
			this.renderLayout();
		} else if('filterAndRender' in this && typeof this.filterAndRender === 'function')
		{
			this.filterAndRender();
		}
		this.fit();
		this.update();
	}

	protected escapeHtml(str: string): string
	{
		return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
	protected escapeHTML(str: string): string
	{
		return this.escapeHtml(str);
	}
}


widgetSelf.GenericSearchableWidget = GenericSearchableWidget;


export class SingletonSidebarWidget extends GenericSearchableWidget
{
	public static readonly typedInstances: Record<string, SingletonSidebarWidget> = {};

	protected _failed: boolean = false;

	protected override get defaultIcon(): string
	{
		return 'bx bx-card-view-tiles';
	}

	constructor(baseClass: string, title?: string, options?: Widget.IOptions)
	{
		if(baseClass && SingletonSidebarWidget.typedInstances[baseClass])
		{
			return SingletonSidebarWidget.typedInstances[baseClass];
		} else
		{
			super(title, options);
			SingletonSidebarWidget.typedInstances[this.constructor.name] = this;
			if(!widgetSelf.OUTLINE_WIDGET_TYPES.includes(this.constructor.name))
			{
				debugger;
				widgetSelf.OUTLINE_WIDGET_TYPES.push(this.constructor.name);
			}
		}
	}


	public processMessage(msg: Message): void
	{
		if(this._failed)
		{
			return super.processMessage(msg);
		}

		if(msg.type === 'close-request')
		{
			console.log('Intercepted close request, hiding instead: ' + this.title.label);

			this.hide();
			widgetSelf.mainDock?.layout?.removeWidget(this);
			return; // BAIL OUT: Avoid calling super.processMessage() to prevent disposal
		}

		super.processMessage(msg);
	}

}


widgetSelf.SingletonSidebarWidget = SingletonSidebarWidget;


export interface IMainpanelOptions<TMain, TItems> extends Widget.IOptions
{
	itemsChanged: ISignal<TMain, TItems>;
}

export abstract class SidebarUpdateWidget<TMain, TItems> extends SingletonSidebarWidget
{
	protected items?: TItems = undefined;
	protected _mainpanelChanged?: ISignal<TMain, TItems>;
	protected _mainpanelSub: (main: TMain, items: TItems) => void = (_, items) =>
	{
		this.items = items;
		this.filterAndRender();
	};

	protected abstract filterAndRender(): void;

	constructor(baseClass: string, title?: string, options?: IMainpanelOptions<TMain, TItems>)
	{
		super(baseClass, title, options);

		if(options?.itemsChanged)
		{
			this._mainpanelChanged?.disconnect(this._mainpanelSub);
			this._mainpanelChanged = options.itemsChanged;
			this._mainpanelChanged.connect(this._mainpanelSub);
		}
	}


	protected override onAfterAttach(msg: Message): void
	{
		super.onAfterAttach(msg);
		this._mainpanelChanged?.disconnect(this._mainpanelSub);
		this._mainpanelChanged?.connect(this._mainpanelSub);
		this.filterAndRender();
	}


	protected override onAfterShow(msg: Message): void
	{
		super.onAfterShow(msg);
		this._mainpanelChanged?.disconnect(this._mainpanelSub);
		this._mainpanelChanged?.connect(this._mainpanelSub);
		this.filterAndRender();
	}


	protected override onBeforeDetach(msg: Message): void
	{
		this._mainpanelChanged?.disconnect(this._mainpanelSub);
		super.onBeforeDetach(msg);
	}


}

widgetSelf.SidebarUpdateWidget = SidebarUpdateWidget;


export abstract class AutoSidebarWidget<TSide extends Widget> extends GenericSearchableWidget
{
	protected _sidebarWidget?: TSide;

	public processMessage(msg: Message): void
	{
		if(msg.type === 'close-request')
		{
			this._sidebarWidget?.close();
		}

		super.processMessage(msg);
	}

	protected override onBeforeHide(msg: Message): void
	{
		this._sidebarWidget?.close();
		super.onBeforeHide(msg);
	}


	protected override onBeforeDetach(msg: Message): void
	{
		this._sidebarWidget?.close();
		super.onBeforeDetach(msg);
	}

	protected override onAfterAttach(msg: Message): void
	{
		super.onAfterAttach(msg);
		if(this._sidebarWidget && !this._sidebarWidget.isAttached)
		{
			this.openSidebar();
		}
	}

	protected override onAfterShow(msg: Message): void
	{
		super.onAfterShow(msg);
		this.openSidebar();
	}

	protected openSidebar()
	{
		const that = this;
		if(!this._sidebarWidget)
		{
			return;
		}
		setTimeout(() =>
		{
			if(widgetSelf.mainDock && widgetSelf.LayoutAdjuster && that._sidebarWidget)
			{
				if(!this._sidebarWidget?.isAttached)
				{
					widgetSelf.LayoutAdjuster?.addOptimalWidgetLayout(widgetSelf.mainDock, that._sidebarWidget, {
						type: 'outline',
						projectId: that._sidebarWidget?.constructor.name
					});
				} else
				{
					this._sidebarWidget.show();
				}
			}
		}, 300);
	}
}

widgetSelf.AutoSidebarWidget = AutoSidebarWidget;



export abstract class SidebarChangeWidget<TMain, TList> extends SidebarUpdateWidget<TMain, TList[]>
{
	protected _selectedItemId?: string;
	protected isEditing: boolean = false;
	protected _selectedItem: Signal<SidebarChangeWidget<TMain, TList>, TList | undefined> = new Signal(this);

	public get selectedItem(): ISignal<SidebarChangeWidget<TMain, TList>, TList | undefined>
	{
		return this._selectedItem;
	}

	protected _itemsChanged: Signal<SidebarChangeWidget<TMain, TList>, TList[]> = new Signal(this);

	public get itemsChanged(): ISignal<SidebarChangeWidget<TMain, TList>, TList[]>
	{
		return this._itemsChanged;
	}

	protected _editItem: Signal<SidebarChangeWidget<TMain, TList>, boolean> = new Signal(this);

	public get editItem(): ISignal<SidebarChangeWidget<TMain, TList>, boolean>
	{
		return this._editItem;
	}

	protected _createItem: Signal<SidebarChangeWidget<TMain, TList>, any> = new Signal(this);

	public get createItem(): ISignal<SidebarChangeWidget<TMain, TList>, any>
	{
		return this._createItem;
	}

}

widgetSelf.SidebarChangeWidget = SidebarChangeWidget;


export abstract class WithChangingWidget<TMain extends WithChangingWidget<TMain, TList>, TList extends Object> extends AutoSidebarWidget<SidebarChangeWidget<TMain, TList>>
{

	protected _itemsChanged: Signal<TMain, TList[]>;
	protected _selectedItemId?: string;
	protected _selectedItem?: TList;
	protected items?: TList[] = undefined;
	public isEditing: boolean = false;

	protected abstract filterAndRender(): void;

	protected createNew(type?: any): void
	{
	}

	public get itemsChanged(): ISignal<TMain, TList[]>
	{
		return this._itemsChanged;
	}

	constructor(title?: string, options?: IMainpanelOptions<TMain, TList[]>)
	{
		super(title, options);
		const that: TMain = this as unknown as any;
		this._itemsChanged = new Signal(that);
		// this._sidebarWidget = new SidebarChangeWidget<,>(undefined, {
		// 	itemsChanged: this._itemsChanged
		// });
	}


	protected subSelected: (_: Widget, item: TList | string | undefined) => any = (_, item) =>
	{
		const t = this.items?.find(t => t === item
			|| 'id' in t
			&& typeof item === 'object'
			&& 'id' in item
			&& t.id === item.id);
		this._selectedItem = t;
		if(typeof item === 'object' && 'id' in item && typeof item.id === 'string')
		{
			this._selectedItemId = item.id;
		}
		if(t)
		{
			this.filterAndRender();
		}
	};

	protected subEditing: (_: Widget, id: boolean) => any = (_, edit) =>
	{
		this.isEditing = edit;
		this.filterAndRender();
	};

	protected subChanged: (_: Widget, items: TList[]) => any = (_, items) =>
	{
		this.items = items;
		this.filterAndRender();
	};

	private subCreated: (_: Widget, type: any) => any = (_, type) =>
	{
		this.createNew?.(type);
		this.filterAndRender();
	};

	protected override onAfterAttach(msg: Message): void
	{
		super.onAfterAttach(msg);
		this.resubscribeSidebar();
	}

	protected override onAfterShow(msg: Message): void
	{
		super.onAfterShow(msg);
		this.resubscribeSidebar();
	}

	protected resubscribeSidebar()
	{
		this._sidebarWidget?.selectedItem.disconnect(this.subSelected);
		this._sidebarWidget?.editItem.disconnect(this.subEditing);
		this._sidebarWidget?.createItem.disconnect(this.subCreated);
		this._sidebarWidget?.itemsChanged.disconnect(this.subChanged);
		this._sidebarWidget?.selectedItem.connect(this.subSelected);
		this._sidebarWidget?.editItem.connect(this.subEditing);
		this._sidebarWidget?.createItem.connect(this.subCreated);
		this._sidebarWidget?.itemsChanged.connect(this.subChanged);
	}


	protected override onBeforeHide(msg: Message): void
	{
		this._sidebarWidget?.selectedItem.disconnect(this.subSelected);
		this._sidebarWidget?.editItem.disconnect(this.subEditing);
		this._sidebarWidget?.createItem.disconnect(this.subCreated);
		this._sidebarWidget?.itemsChanged.disconnect(this.subChanged);
		this._sidebarWidget?.close();
		super.onBeforeHide(msg);
	}


	protected override onBeforeDetach(msg: Message): void
	{
		this._sidebarWidget?.selectedItem.disconnect(this.subSelected);
		this._sidebarWidget?.editItem.disconnect(this.subEditing);
		this._sidebarWidget?.createItem.disconnect(this.subCreated);
		this._sidebarWidget?.itemsChanged.disconnect(this.subChanged);
		this._sidebarWidget?.close();
		super.onBeforeDetach(msg);
	}

}

widgetSelf.WithChangingWidget = WithChangingWidget;


