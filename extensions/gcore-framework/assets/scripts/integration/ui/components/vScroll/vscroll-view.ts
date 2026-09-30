import {
    _decorator,
    Component,
    Enum,
    EventTouch,
    input,
    Input,
    instantiate,
    Mask,
    math,
    Node,
    Prefab,
    tween,
    UITransform,
    Vec2,
    Vec3,
    Widget
} from 'cc';
import { VScrollViewItem } from './vscroll-view-item';
const { ccclass, property, menu } = _decorator;

/** 虚拟列表内部节点池，按 item 类型分别回收和复用节点 */
class InternalNodePool {

    /** 按类型索引保存的节点池 */
    private pools: Map<number, Node[]> = new Map();
    /** Prefab 创建模式下的模板集合 */
    private prefabs: Prefab[] = [];
    /** Node 创建模式下的模板集合 */
    private nodes: Node[] = [];
    /** 是否使用 Node 模板创建节点 */
    private useNodeMode: boolean = false;

    /** 初始化节点池
     * @param prefabs Prefab 模板集合
     * @param nodes Node 模板集合
     */
    constructor(prefabs: Prefab[], nodes?: Node[]) {
        this.prefabs = prefabs;
        this.nodes = nodes || [];
        this.useNodeMode = !!nodes && nodes.length > 0;

        const nodeLength = this.nodes.length ?? 0;
        const count = this.useNodeMode ? nodeLength : prefabs.length;
        for (let i = 0; i < count; i++) {
            this.pools.set(i, []);
        }
    }

    /** 获取指定类型的节点
     * @param typeIndex item 类型索引
     * @returns 可用节点，模板缺失时返回 null
     */
    get(typeIndex: number): Node | null {
        const pool = this.pools.get(typeIndex);
        if (!pool) {
            console.error(`[VScrollView NodePool] 类型 ${typeIndex} 不存在`);
            return null;
        }
        if (pool.length > 0) {
            const node = pool.pop()!;
            node.active = true;
            return node;
        }
        let newNode: Node;
        if (this.useNodeMode) {
            const sourceNode = this.nodes[typeIndex];
            if (!sourceNode) {
                console.error(`[VScrollView NodePool] Node 类型 ${typeIndex} 模板不存在`);
                return null;
            }
            newNode = instantiate(sourceNode);
        } else {
            const sourcePrefab = this.prefabs[typeIndex];
            if (!sourcePrefab) {
                console.error(`[VScrollView NodePool] Prefab 类型 ${typeIndex} 模板不存在`);
                return null;
            }
            newNode = instantiate(sourcePrefab);
        }
        return newNode;
    }

    /** 回收节点到指定类型的池中
     * @param node 需要回收的节点
     * @param typeIndex item 类型索引
     */
    put(node: Node, typeIndex: number) {
        if (!node) return;
        const pool = this.pools.get(typeIndex);
        if (!pool) {
            console.error(`[VScrollView NodePool] 类型 ${typeIndex} 不存在`);
            node.destroy();
            return;
        }
        node.active = false;
        node.removeFromParent();
        pool.push(node);
    }

    /** 清空并销毁池内全部节点 */
    clear() {
        this.pools.forEach(pool => {
            pool.forEach(node => node.destroy());
            pool.length = 0;
        });
        this.pools.clear();
    }

    /** 获取各类型池内节点数量
     * @returns 类型到数量的映射
     */
    getStats() {
        const stats: any = {};
        this.pools.forEach((pool, type) => {
            stats[`type${type}`] = pool.length;
        });
        return stats;
    }
}

/** item 渲染回调 */
export type RenderItemFn = (node: Node, index: number) => void;
/** 自定义节点提供回调，支持同步或异步返回节点 */
export type ProvideNodeFn = (index: number) => Node | Promise<Node>;
/** item 点击回调 */
export type OnItemClickFn = (node: Node, index: number) => void;
/** item 长按回调 */
export type OnItemLongPressFn = (node: Node, index: number) => void;
/** item 出现动画回调 */
export type PlayItemAppearAnimationFn = (node: Node, index: number) => void;
/** 动态尺寸 item 主方向尺寸回调 */
export type GetItemHeightFn = (index: number) => number;
/** 动态尺寸 item 类型索引回调 */
export type GetItemTypeIndexFn = (index: number) => number;
/** 刷新状态变化回调 */
export type OnRefreshStateChangeFn = (state: RefreshState, offset: number) => void;
/** 加载更多状态变化回调 */
export type OnLoadMoreStateChangeFn = (state: LoadMoreState, offset: number) => void;
/** 分页吸附页码变化回调 */
export type OnPageChangeFn = (pageIndex: number) => void;

/** 列表滚动方向 */
export enum ScrollDirection {
    /** 纵向滚动 */
    VERTICAL = 0,
    /** 横向滚动 */
    HORIZONTAL = 1,
}

/** item 创建模式 */
export enum ItemCreationMode {
    /** 通过 Node 模板实例化 */
    NODE = 0,
    /** 通过 Prefab 模板实例化 */
    PREFAB = 1,
}

/** 下拉刷新状态 */
export enum RefreshState {
    IDLE = 0, // 空闲状态
    PULLING = 1, // 正在拉动（未达到触发阈值）
    READY = 2, // 达到触发阈值，松手即可刷新
    REFRESHING = 3, // 正在刷新中
    COMPLETE = 4, // 刷新完成
}

/** 上拉加载更多状态 */
export enum LoadMoreState {
    IDLE = 0, // 空闲状态
    PULLING = 1, // 正在上拉（未达到触发阈值）
    READY = 2, // 达到触发阈值，松手即可加载
    LOADING = 3, // 正在加载中
    COMPLETE = 4, // 加载完成
    NO_MORE = 5, // 没有更多数据
}

/** 虚拟滚动列表组件，支持等大小、多类型动态尺寸、刷新加载、惯性和分页吸附 */
@ccclass('VirtualScrollView')
@menu('GCore/vScroll/VScrollView')
export class VScrollView extends Component {
    /** 内容容器节点，通常是视口节点下的 content */
    @property({ type: Node, displayName: '容器节点', tooltip: 'content 容器节点（在 Viewport 下）' })
    public content: Node | null = null;

    /** 是否启用虚拟列表；关闭后只保留滚动容器能力 */
    @property({
        displayName: '启用虚拟列表',
        tooltip: '是否启用虚拟列表模式（关闭则仅提供滚动功能）',
    })
    public useVirtualList: boolean = true;

    /** 列表主滚动方向 */
    @property({
        type: Enum(ScrollDirection),
        displayName: '滚动方向',
        tooltip: '滚动方向：纵向（向上）或横向（向左）',
    })
    public direction: ScrollDirection = ScrollDirection.VERTICAL;

    /** item 模板创建来源 */
    @property({
        type: Enum(ItemCreationMode),
        displayName: '创建模式',
        tooltip: '使用 Node 或 Prefab 创建子项（默认 Prefab）',
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public itemCreationMode: ItemCreationMode = ItemCreationMode.PREFAB;

    /** 等大小 Node 模式下的 item 模板节点 */
    @property({
        type: Node,
        displayName: '子项节点',
        tooltip: '可选：从 Node 创建 item（等大小模式）',
        visible(this: VScrollView) {
            return this.useVirtualList && !this.useDynamicSize && this.itemCreationMode === ItemCreationMode.NODE;
        },
    })
    public itemNode: Node | null = null;

    /** 等大小 Prefab 模式下的 item 模板 */
    @property({
        type: Prefab,
        displayName: '子项预制体',
        tooltip: '可选：从 Prefab 创建 item（等大小模式）',
        visible(this: VScrollView) {
            return this.useVirtualList && !this.useDynamicSize && this.itemCreationMode === ItemCreationMode.PREFAB;
        },
    })
    public itemPrefab: Prefab | null = null;

    /** 是否启用动态尺寸 item 模式 */
    @property({
        displayName: '不等大小模式',
        tooltip: '启用不等大小模式',
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public useDynamicSize: boolean = false;

    /** 等大小模式下内容不足一屏时是否自动居中 */
    @property({
        displayName: '自动居中布局',
        tooltip: '当子项数量少于行/列数时，自动居中显示（适用于等大小模式）',
        visible(this: VScrollView) {
            return this.useVirtualList && !this.useDynamicSize;
        },
    })
    public autoCenter: boolean = false;

    /** 是否启用滚动结束后的分页吸附 */
    @property({
        displayName: '启用分页吸附',
        tooltip: '滚动结束后自动吸附到最近的 item 位置',
    })
    public enablePageSnap: boolean = false;

    /** 分页吸附动画持续时间 */
    @property({
        displayName: '===吸附动画时长',
        tooltip: '吸附动画的持续时间（秒）',
        range: [0.1, 1, 0.05],
        visible(this: VScrollView) {
            return this.enablePageSnap;
        },
    })
    public pageSnapDuration: number = 0.15;

    /** 手动拖动超过当前页尺寸的该比例后翻页 */
    @property({
        displayName: '===切页距离比例',
        tooltip: '滑动距离超过页面尺寸的此比例时翻页（0.1-0.5）',
        range: [0.1, 0.5, 0.05],
        visible(this: VScrollView) {
            return this.enablePageSnap;
        },
    })
    public pageSnapDistanceRatio: number = 0.15;

    /** 惯性速度低于该值时触发分页吸附 */
    @property({
        displayName: '===吸附触发速度',
        tooltip: '惯性速度低于此值时触发吸附（越大越早吸附）',
        range: [50, 3000, 10],
        visible(this: VScrollView) {
            return this.enablePageSnap;
        },
    })
    public pageSnapTriggerVelocity: number = 600;

    /** 动态尺寸 Node 模式下的多类型模板节点 */
    @property({
        type: [Node],
        displayName: '子项节点数组',
        tooltip: '不等大小模式：预先提供的子项节点数组（可在编辑器拖入）',
        visible(this: VScrollView) {
            return this.useVirtualList && this.useDynamicSize && this.itemCreationMode === ItemCreationMode.NODE;
        },
    })
    public itemNodes: Array<Node> = [];

    /** 动态尺寸 Prefab 模式下的多类型模板 */
    @property({
        type: [Prefab],
        displayName: '子项预制体数组',
        tooltip: '不等大小模式：预先提供的子项预制体数组（可在编辑器拖入）',
        visible(this: VScrollView) {
            return this.useVirtualList && this.useDynamicSize && this.itemCreationMode === ItemCreationMode.PREFAB;
        },
    })
    public itemPrefabs: Prefab[] = [];

    /** item 在主方向上的尺寸，高度用于纵向，宽度用于横向 */
    private itemMainSize: number = 100;
    /** item 在副方向上的尺寸，宽度用于纵向，高度用于横向 */
    private itemCrossSize: number = 100;

    /** 等大小模式下每行或每列的 item 数量 */
    @property({
        displayName: '行/列数',
        tooltip: '纵向模式为列数，横向模式为行数',
        range: [1, 10, 1],
        visible(this: VScrollView) {
            return this.useVirtualList && !this.useDynamicSize;
        },
    })
    public gridCount: number = 1;

    /** 等大小模式下副方向 item 间距 */
    @property({
        displayName: '副方向间距',
        tooltip: '主方向垂直方向的间距（像素）',
        range: [0, 1000, 1],
        visible(this: VScrollView) {
            return this.useVirtualList && !this.useDynamicSize;
        },
    })
    public gridSpacing: number = 0;

    /** 主滚动方向 item 间距 */
    @property({
        displayName: '主方向间距',
        tooltip: '主方向的间距（像素）',
        range: [0, 1000, 1],
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public spacing: number = 0;

    /** 列表开头额外留白 */
    @property({
        displayName: '头部间距',
        tooltip: '列表头部的额外间距（纵向为顶部，横向为左侧）',
        range: [0, 1000, 1],
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public headerSpacing: number = 0;

    /** 列表末尾额外留白 */
    @property({
        displayName: '尾部间距',
        tooltip: '列表尾部的额外间距（纵向为底部，横向为右侧）',
        range: [0, 1000, 1],
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public footerSpacing: number = 0;

    /** 列表数据总条数 */
    @property({
        displayName: '总条数',
        tooltip: '总条数（可在运行时 setTotalCount 动态修改）',
        range: [0, 1000, 1],
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public totalCount: number = 50;

    /** 可视区外额外保留的缓冲 item 数 */
    @property({
        displayName: '额外缓冲',
        tooltip: '额外缓冲（可视区外多渲染几条，避免边缘复用闪烁）',
        range: [0, 10, 1],
        visible(this: VScrollView) {
            return this.useVirtualList;
        },
    })
    public buffer: number = 1;

    /** 是否启用下拉刷新 */
    @property({
        displayName: '启用下拉刷新',
        tooltip: '是否启用下拉刷新功能',
    })
    public enablePullRefresh: boolean = false;

    /** 下拉刷新触发距离 */
    @property({
        displayName: '===下拉触发距离',
        tooltip: '下拉多少距离触发刷新（像素）',
        range: [50, 500, 10],
        visible(this: VScrollView) {
            return this.enablePullRefresh;
        },
    })
    public pullRefreshThreshold: number = 100;

    /** 下拉刷新最大阻尼距离 */
    @property({
        displayName: '===下拉最大距离',
        tooltip: '下拉的最大阻尼距离（像素）',
        range: [100, 1000, 10],
        visible(this: VScrollView) {
            return this.enablePullRefresh;
        },
    })
    public pullRefreshMaxOffset: number = 150;

    /** 是否启用上拉加载更多 */
    @property({
        displayName: '启用上拉加载',
        tooltip: '是否启用上拉加载更多功能',
    })
    public enableLoadMore: boolean = false;

    /** 上拉加载触发距离 */
    @property({
        displayName: '===上拉触发距离',
        tooltip: '距离底部多少距离触发加载（像素）',
        range: [50, 500, 10],
        visible(this: VScrollView) {
            return this.enableLoadMore;
        },
    })
    public loadMoreThreshold: number = 100;

    /** 上拉加载最大阻尼距离 */
    @property({
        displayName: '===上拉最大距离',
        tooltip: '上拉的最大阻尼距离（像素）',
        range: [100, 1000, 10],
        visible(this: VScrollView) {
            return this.enableLoadMore;
        },
    })
    public loadMoreMaxOffset: number = 150;

    /** 越界拖拽时的阻尼系数 */
    @property({
        displayName: '拉动阻尼系数',
        tooltip: '拉动时的阻尼系数（0-1），越小越难拉',
        range: [0.1, 1, 0.05],
        visible(this: VScrollView) {
            return this.enablePullRefresh || this.enableLoadMore;
        },
    })
    public pullDampingRate: number = 0.5;

    /** 是否将滚动位置四舍五入到像素 */
    @property({ displayName: '像素对齐', tooltip: '是否启用像素对齐' })
    public pixelAlign: boolean = true;

    /** 是否禁止内容越界回弹 */
    @property({
        displayName: '禁用越界滚动',
        tooltip: '是否禁用越界滚动（开启后将无法滚动到边界之外）'
    })
    public disableBounce: boolean = false;

    /** 惯性滚动的指数衰减系数 */
    @property({
        displayName: '惯性阻尼系数',
        tooltip: '指数衰减系数，越大减速越快',
        range: [0, 10, 0.5],
    })
    public inertiaDampK: number = 1;

    /** 越界回弹弹簧刚度 */
    @property({ displayName: '弹簧刚度', tooltip: '越界弹簧刚度 K（建议 120–240）' })
    public springK: number = 150.0;

    /** 越界回弹阻尼 */
    @property({ displayName: '弹簧阻尼', tooltip: '越界阻尼 C（建议 22–32）' })
    public springC: number = 26.0;

    /** 小于该速度时停止惯性滚动 */
    @property({ displayName: '速度阈值', tooltip: '速度阈值（像素/秒），低于即停止' })
    public velocitySnap: number = 5;

    /** 释放手指前用于估算速度的采样窗口 */
    @property({ displayName: '速度窗口', tooltip: '速度估计窗口（秒）' })
    public velocityWindow: number = 0.08;

    /** 惯性滚动最大速度 */
    @property({ displayName: '最大惯性速度', tooltip: '最大惯性速度（像素/秒）' })
    public maxVelocity: number = 6000;

    /** 是否使用类 iOS 的分段减速曲线 */
    @property({ displayName: 'iOS减速曲线', tooltip: '是否使用 iOS 风格的减速曲线' })
    public useIOSDecelerationCurve: boolean = true;

    /** item 渲染函数，外部负责把数据写入节点 */
    public renderItemFn: RenderItemFn | null = null;
    /** 自定义节点提供函数，优先级高于编辑器模板 */
    public provideNodeFn: ProvideNodeFn | null = null;
    /** item 点击回调 */
    public onItemClickFn: OnItemClickFn | null = null;
    /** item 长按回调 */
    public onItemLongPressFn: OnItemLongPressFn | null = null;
    /** item 首次出现动画回调 */
    public playItemAppearAnimationFn: PlayItemAppearAnimationFn | null = null;
    /** 动态尺寸模式下按索引获取主方向尺寸 */
    public getItemHeightFn: GetItemHeightFn | null = null;
    /** 动态尺寸模式下按索引获取模板类型 */
    public getItemTypeIndexFn: GetItemTypeIndexFn | null = null;
    /** 下拉刷新状态变化回调 */
    public onRefreshStateChangeFn: OnRefreshStateChangeFn | null = null;
    /** 上拉加载状态变化回调 */
    public onLoadMoreStateChangeFn: OnLoadMoreStateChangeFn | null = null;
    /** 分页索引变化回调 */
    public onPageChangeFn: OnPageChangeFn | null = null;

    /** 视口在主方向上的尺寸 */
    private _viewportSize = 0;
    /** 内容在主方向上的完整尺寸 */
    private _contentSize = 0;
    /** 主方向滚动最小边界 */
    private _boundsMin = 0;
    /** 主方向滚动最大边界 */
    private _boundsMax = 0;
    /** 当前主方向滚动速度 */
    private _velocity = 0;
    /** 当前是否处于触摸拖动中 */
    private _isTouching = false;
    /** 释放前速度采样队列 */
    private _velSamples: { t: number; delta: number }[] = [];
    /** 当前活跃槽位节点 */
    private _slotNodes: Node[] = [];
    /** 当前槽位数量 */
    private _slots = 0;
    /** 第一个槽位对应的数据索引 */
    private _slotFirstIndex = 0;
    /** 动态尺寸模式下每个数据项的主方向尺寸 */
    private _itemSizes: number[] = [];
    /** 动态尺寸模式下每个数据项的起始位置前缀表 */
    private _prefixPositions: number[] = [];
    /** 动态尺寸采样模式下的模板类型尺寸缓存 */
    private _prefabSizeCache: Map<number, number> = new Map();
    /** 动态尺寸多模板复用池 */
    private _nodePool: InternalNodePool | null = null;
    /** 动态尺寸模式下每个槽位当前使用的模板类型 */
    private _slotPrefabIndices: number[] = [];
    /** 需要播放出现动画的数据索引集合 */
    private _needAnimateIndices: Set<number> = new Set();
    /** 是否启用 item 内 Label 的排序层处理 */
    private _initSortLayerFlag: boolean = true;
    /** 当前滚动 tween，存在时会暂停惯性更新 */
    private _scrollTween: any = null;
    /** 触摸移动事件复用的临时向量 */
    private _tmpMoveVec2 = new Vec2();

    /** 当前下拉刷新状态 */
    private _refreshState: RefreshState = RefreshState.IDLE;
    /** 当前上拉加载状态 */
    private _loadMoreState: LoadMoreState = LoadMoreState.IDLE;
    /** 当前下拉偏移量 */
    private _pullOffset: number = 0;
    /** 当前上拉偏移量 */
    private _loadOffset: number = 0;
    /** 是否正在刷新 */
    private _isRefreshing: boolean = false;
    /** 是否正在加载更多 */
    private _isLoadingMore: boolean = false;
    /** 是否还有更多数据 */
    private _hasMore: boolean = true;

    /** 当前分页吸附页索引 */
    private _currentPageIndex: number = 0;
    /** 触摸开始时的内容主方向位置 */
    private _pageStartPos: number = 0;

    /** 触摸开始时的 UI 坐标 */
    private _touchStartPos: Vec2 = new Vec2();
    /** 本次触摸是否已判定滚动方向 */
    private _hasDeterminedScrollDirection: boolean = false;
    /** 是否需要阻止父节点继续接收触摸事件 */
    private _shouldBlockParent: boolean = false;
    /** 判定滚动方向前的最小移动距离 */
    private _scrollDirectionThreshold: number = 15;
    /** 判定滚动方向时允许的角度阈值 */
    private _scrollAngleThreshold: number = 30;

    /** 等大小模式下从 content 子节点取出的模板节点 */
    private _templateNode: Node | null = null;

    /**************** [访问器]  ****************/

    /** 获取 content 的 UITransform 组件 */
    private get _contentTf(): UITransform {
        this.content = this._getContentNode();
        return this.content!.getComponent(UITransform)!;
    }

    /** 获取视口节点的 UITransform 组件 */
    private get _viewportTf(): UITransform {
        return this.node.getComponent(UITransform)!;
    }

    /**************** [基础工具]  ****************/

    /** 获取内容节点，未绑定时尝试按名称查找
     * @returns 内容容器节点
     */
    private _getContentNode(): Node {
        if (!this.content) {
            console.warn(`[VirtualScrollView] :${this.node.name} 请在属性面板绑定 content 容器节点`);
            this.content = this.node.getChildByName('content');
        }
        return this.content!;
    }

    /** 判断当前是否为纵向滚动
     * @returns 是否为纵向
     */
    private _isVertical(): boolean {
        return this.direction === ScrollDirection.VERTICAL;
    }

    /** 获取视口主方向尺寸
     * @returns 主方向尺寸
     */
    private _getViewportMainSize(): number {
        return this._isVertical() ? this._viewportTf.height : this._viewportTf.width;
    }

    /** 获取内容节点主方向位置
     * @returns 主方向坐标
     */
    private _getContentMainPos(): number {
        return this._isVertical() ? this.content!.position.y : this.content!.position.x;
    }

    /** 设置内容节点主方向位置
     * @param pos 目标主方向坐标
     */
    private _setContentMainPos(pos: number) {
        if (!Number.isFinite(pos)) return;
        if (this.pixelAlign) pos = Math.round(pos);
        const p = this.content!.position;
        if (this._isVertical()) {
            if (pos === p.y) return;
            this.content!.setPosition(p.x, pos, p.z);
        } else {
            if (pos === p.x) return;
            this.content!.setPosition(pos, p.y, p.z);
        }
    }

    /**************** [生命周期]  ****************/

    /** 初始化虚拟列表、滚动边界和触摸监听 */
    async start() {
        this.content = this._getContentNode();
        if (!this.content) return;
        const mask = this.node.getComponent(Mask);
        if (!mask) console.warn('[VirtualScrollView] 建议在视窗节点挂一个 Mask 组件用于裁剪');
        this.gridCount = Math.max(1, Math.round(this.gridCount));
        if (!this.useVirtualList) {
            this._viewportSize = this._getViewportMainSize();
            this._contentSize = this._isVertical() ? this._contentTf.height : this._contentTf.width;
            if (this._isVertical()) {
                this._boundsMin = 0;
                this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
            } else {
                this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
                this._boundsMax = 0;
            }
            this._bindTouch();
            this._bindGlobalTouch();
            return;
        }

        // 等大小模式：如果没有预制体但 content 下有子节点，保存第一个子节点作为模板
        if (!this.useDynamicSize && !this.itemPrefab && this.content.children.length > 0) {
            this._templateNode = this.content.children[0];
            this._templateNode.removeFromParent(); // 只移除，不销毁
        }

        this.content.removeAllChildren();
        this._viewportSize = this._getViewportMainSize();

        if (this.useDynamicSize) await this._initDynamicSizeMode();
        else await this._initFixedSizeMode();
        this._bindTouch();
        this._bindGlobalTouch();
    }

    /** 释放节点池、模板节点和触摸监听 */
    onDestroy() {

        input.off(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_START, this._onDown, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onUp, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onUp, this);
        if (this._nodePool) {
            this._nodePool.clear();
            this._nodePool = null;
        }

        // 销毁模板节点
        if (this._templateNode) {
            this._templateNode.destroy();
            this._templateNode = null;
        }

        this.itemNode = null;
        this.itemNodes.length = 0;
    }

    /**************** [初始化]  ****************/

    /** 绑定本节点触摸事件 */
    private _bindTouch() {
        this.node.on(Node.EventType.TOUCH_START, this._onDown, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onUp, this);
    }

    /** 绑定全局触摸结束事件，避免手指移出节点后状态卡住 */
    private _bindGlobalTouch() {
        input.on(Input.EventType.TOUCH_END, this._onGlobalTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onGlobalTouchEnd, this);
    }

    /** 处理全局触摸结束事件
     * @param event 触摸事件
     */
    private _onGlobalTouchEnd(event: EventTouch) {
        if (this._isTouching) {
            console.log('[VScrollView] Global touch end detected');
            this._onUp(event);
        }
    }

    /** 初始化等大小虚拟列表模式 */
    private async _initFixedSizeMode() {
        if (!this.provideNodeFn) {
            this.provideNodeFn = (index: number) => {
                // Node 模式
                if (this.itemCreationMode === ItemCreationMode.NODE) {
                    if (this.itemNode) return instantiate(this.itemNode);
                    if (this._templateNode) return instantiate(this._templateNode);
                }
                // Prefab 模式
                if (this.itemCreationMode === ItemCreationMode.PREFAB) {
                    if (this.itemPrefab) return instantiate(this.itemPrefab);
                }
                // 兼容旧版本：如果没有设置模式，尝试 itemPrefab 或模板节点
                if (this.itemPrefab) return instantiate(this.itemPrefab);
                if (this._templateNode) return instantiate(this._templateNode);
                // 都没有则警告并创建默认节点
                console.warn('[VirtualScrollView] 没有提供 itemNode/itemPrefab 或模板节点');
                const n = new Node('item-auto-create');
                const size = this._isVertical() ? this._viewportTf.width : this._viewportTf.height;
                n.addComponent(UITransform).setContentSize(this._isVertical() ? size : this.itemMainSize, this._isVertical() ? this.itemMainSize : size);
                return n;
            };
        }
        let item_pre = this.provideNodeFn(0);
        if (item_pre instanceof Promise) item_pre = await item_pre;
        const uit = item_pre.getComponent(UITransform);

        if (!uit) {
            console.error('[VScrollView] 节点没有UITransform组件');
            return;
        }

        // 先用样本节点确定主方向和副方向尺寸，后续槽位统一套用该尺寸。
        if (this._isVertical()) {
            this.itemMainSize = uit.height;
            this.itemCrossSize = uit.width;
        } else {
            this.itemMainSize = uit.width;
            this.itemCrossSize = uit.height;
        }
        this._recomputeContentSize();
        const stride = this.itemMainSize + this.spacing;
        const visibleLines = Math.ceil(this._viewportSize / stride);
        this._slots = Math.max(1, (visibleLines + this.buffer + 2) * this.gridCount);
        // 等大小模式可直接创建固定数量槽位，滚动时只移动槽位对应的数据索引。
        for (let i = 0; i < this._slots; i++) {
            const n = i === 0 ? item_pre : instantiate(item_pre);
            n.parent = this.content!;
            const itf = n.getComponent(UITransform);
            if (itf) {
                if (this._isVertical()) {
                    itf.width = this.itemCrossSize;
                    itf.height = this.itemMainSize;
                } else {
                    itf.width = this.itemMainSize;
                    itf.height = this.itemCrossSize;
                }
            }
            this._slotNodes.push(n);
        }
        this._slotFirstIndex = 0;
        this._layoutSlots(this._slotFirstIndex, true);
    }

    /** 初始化动态尺寸虚拟列表模式 */
    private async _initDynamicSizeMode() {
        if (this.getItemHeightFn) {
            console.log('[VirtualScrollView] 使用外部提供的 getItemHeightFn');
            this._itemSizes = [];
            for (let i = 0; i < this.totalCount; i++) {
                this._itemSizes.push(this.getItemHeightFn(i));
            }
            this._buildPrefixSum();

            // 外部已经提供尺寸时，只需要根据创建模式准备节点池。
            // Node 模式
            if (this.itemCreationMode === ItemCreationMode.NODE && this.itemNodes.length > 0) {
                console.log('[VirtualScrollView] 初始化节点池（Node 模式）');
                this._nodePool = new InternalNodePool([], this.itemNodes);
            }
            // Prefab 模式
            else if (this.itemCreationMode === ItemCreationMode.PREFAB && this.itemPrefabs.length > 0) {
                console.log('[VirtualScrollView] 初始化节点池（Prefab 模式）');
                this._nodePool = new InternalNodePool(this.itemPrefabs);
            } else {
                console.error('[VirtualScrollView] 需要至少一个 itemNode 或 itemPrefab');
                return;
            }
            this._initDynamicSlots();
            return;
        }
        // Node 模式
        const useNodeMode = this.itemCreationMode === ItemCreationMode.NODE;
        const hasNodes = this.itemNodes.length > 0;
        const hasPrefabs = this.itemPrefabs.length > 0;

        if ((useNodeMode && !hasNodes && !hasPrefabs) || (!useNodeMode && !hasPrefabs) || !this.getItemTypeIndexFn) {
            console.error(
                '[VirtualScrollView] 不等大小模式必须提供以下之一：\n1. getItemHeightFn 回调函数\n2. itemNodes/itemPrefabs 数组 + getItemTypeIndexFn 回调函数'
            );
            return;
        }

        // 根据模式选择模板源
        const templates = useNodeMode && hasNodes ? this.itemNodes : this.itemPrefabs;
        const modeName = useNodeMode && hasNodes ? 'Node' : 'Prefab';

        console.log(`[VirtualScrollView] 使用采样模式（从 ${modeName} 采样尺寸）`);

        // 初始化节点池
        if (useNodeMode && hasNodes) {
            this._nodePool = new InternalNodePool([], this.itemNodes);
        } else {
            this._nodePool = new InternalNodePool(this.itemPrefabs);
        }

        // 无外部尺寸回调时，通过每种模板的 UITransform 采样出初始尺寸。
        this._prefabSizeCache.clear();
        for (let i = 0; i < templates.length; i++) {
            const template = templates[i];
            const sampleNode = instantiate(template as any);
            const uit = sampleNode.getComponent(UITransform);
            const size = this._isVertical() ? uit?.height || 100 : uit?.width || 100;
            this._prefabSizeCache.set(i, size);
            sampleNode.destroy();
            console.log(`[VirtualScrollView] ${modeName}[${i}] 采样尺寸: ${size}`);
        }
        this._itemSizes = [];
        for (let i = 0; i < this.totalCount; i++) {
            const typeIndex = this.getItemTypeIndexFn(i);
            const size = this._prefabSizeCache.get(typeIndex);
            if (size !== undefined) {
                this._itemSizes.push(size);
            } else {
                console.warn(`[VirtualScrollView] 索引 ${i} 的类型索引 ${typeIndex} 无效，使用默认尺寸`);
                this._itemSizes.push(this._prefabSizeCache.get(0) || 100);
            }
        }
        this._buildPrefixSum();
        this._initDynamicSlots();
    }

    /** 初始化动态尺寸模式下的槽位数组 */
    private _initDynamicSlots() {
        const avgSize = this._contentSize / this.totalCount || 100;
        const visibleCount = Math.ceil(this._viewportSize / avgSize);
        let neededSlots = visibleCount + this.buffer * 2 + 4;
        // 通过最小/最大槽位约束控制内存占用，同时避免快速滚动时空白。
        const minSlots = Math.ceil(this._viewportSize / 80) + this.buffer * 2;
        neededSlots = Math.max(neededSlots, minSlots);
        const maxSlots = Math.ceil(this._viewportSize / 50) + this.buffer * 4;
        neededSlots = Math.min(neededSlots, maxSlots);
        this._slots = Math.min(neededSlots, Math.max(this.totalCount, minSlots));
        this._slotNodes = new Array(this._slots).fill(null);
        this._slotPrefabIndices = new Array(this._slots).fill(-1);
        this._slotFirstIndex = 0;
        this._layoutSlots(this._slotFirstIndex, true);
        console.log(`[VScrollView] 初始化槽位: ${this._slots} (总数据: ${this.totalCount}, 视口尺寸: ${this._viewportSize})`);
    }

    /**************** [尺寸与索引]  ****************/

    /** 构建动态尺寸前缀位置表 */
    private _buildPrefixSum() {
        const n = this._itemSizes.length;
        this._prefixPositions = new Array(n);
        // 从 headerSpacing 开始
        let acc = this.headerSpacing;
        for (let i = 0; i < n; i++) {
            this._prefixPositions[i] = acc;
            acc += this._itemSizes[i] + this.spacing;
        }
        // 内容总大小 = 最后一个位置 + 最后一项大小 - spacing + footerSpacing
        this._contentSize = acc - this.spacing + this.footerSpacing;
        if (this._contentSize < 0) this._contentSize = 0;
        if (this._isVertical()) this._contentTf.height = Math.max(this._contentSize, this._viewportSize);
        else this._contentTf.width = Math.max(this._contentSize, this._viewportSize);

        if (this._isVertical()) {
            this._boundsMin = 0;
            this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
        } else {
            this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
            this._boundsMax = 0;
        }
    }

    /** 根据主方向滚动位置查找第一个可见 item 索引
     * @param pos 主方向滚动搜索位置
     * @returns 第一个可见 item 索引
     */
    private _posToFirstIndex(pos: number): number {
        // _prefixPositions 已经包含了 headerSpacing，直接查找即可
        if (pos <= this.headerSpacing) return 0; // 修改：如果在 header 区域内，返回 0

        // 前缀表有序，使用二分查找降低动态尺寸列表的滚动计算成本。
        let l = 0,
            r = this._prefixPositions.length - 1,
            ans = this._prefixPositions.length;
        while (l <= r) {
            const m = (l + r) >> 1;
            if (this._prefixPositions[m] > pos) {
                ans = m;
                r = m - 1;
            } else {
                l = m + 1;
            }
        }
        return Math.max(0, ans - 1);
    }

    /** 计算动态尺寸模式下的可见索引范围
     * @param scrollPos 当前主方向滚动位置
     * @returns 含缓冲区的可见范围，end 为开区间
     */
    private _calcVisibleRange(scrollPos: number): { start: number; end: number } {
        const n = this._prefixPositions.length;
        if (n === 0) return { start: 0, end: 0 };

        const start = this._posToFirstIndex(scrollPos);
        const endPos = scrollPos + this._viewportSize;
        let end = start;

        // 找到第一个起始位置超出可视区域的 item
        while (end < n) {
            if (this._prefixPositions[end] >= endPos) break; // 恢复原来的逻辑
            end++;
        }

        return { start: Math.max(0, start - this.buffer), end: Math.min(n, end + this.buffer) };
    }

    /**************** [滚动更新]  ****************/

    /** 每帧更新惯性滚动、越界回弹和分页吸附
     * @param dt 帧间隔时间
     */
    update(dt: number) {
        if (!this.content || this._isTouching || this._scrollTween) return;
        let pos = this._getContentMainPos();
        let a = 0;

        const minBound = Math.min(this._boundsMin, this._boundsMax);
        const maxBound = Math.max(this._boundsMin, this._boundsMax);

        // 处理刷新/加载状态
        if (this._isRefreshing && this._refreshState === RefreshState.REFRESHING) {
            // 刷新中，保持在刷新位置
            const refreshPos = this._isVertical() ? -this.pullRefreshThreshold : this.pullRefreshThreshold;
            a = -this.springK * (pos - refreshPos) - this.springC * this._velocity;
        } else if (this._isLoadingMore && this._loadMoreState === LoadMoreState.LOADING) {
            // 加载中，保持在加载位置
            const loadPos = this._isVertical() ? this._boundsMax + this.loadMoreThreshold : this._boundsMin - this.loadMoreThreshold;
            a = -this.springK * (pos - loadPos) - this.springC * this._velocity;
        } else if (pos < minBound) {
            // 如果禁用越界滚动，直接限制位置并停止速度
            if (this.disableBounce) {
                this._setContentMainPos(minBound);
                this._velocity = 0;
                return;
            }
            a = -this.springK * (pos - minBound) - this.springC * this._velocity;
        } else if (pos > maxBound) {
            // 如果禁用越界滚动，直接限制位置并停止速度
            if (this.disableBounce) {
                this._setContentMainPos(maxBound);
                this._velocity = 0;
                return;
            }
            a = -this.springK * (pos - maxBound) - this.springC * this._velocity;
        } else {
            if (this.useIOSDecelerationCurve) {
                const speed = Math.abs(this._velocity);
                if (speed > 2000) this._velocity *= Math.exp(-this.inertiaDampK * 0.7 * dt);
                else if (speed > 500) this._velocity *= Math.exp(-this.inertiaDampK * dt);
                else this._velocity *= Math.exp(-this.inertiaDampK * 1.3 * dt);
            } else {
                this._velocity *= Math.exp(-this.inertiaDampK * dt);
            }
        }

        // 将弹簧加速度叠加到速度上，正常区间则只保留惯性衰减后的速度。
        this._velocity += a * dt;

        // 分页吸附模式：使用单独的速度阈值
        if (this.enablePageSnap && Math.abs(this._velocity) < this.pageSnapTriggerVelocity && a === 0) {
            this._velocity = 0;
            this._performPageSnap();
            return;
        }

        if (Math.abs(this._velocity) < this.velocitySnap && a === 0) this._velocity = 0;
        if (this._velocity !== 0) {
            pos += this._velocity * dt;

            // 如果禁用越界滚动，限制位置在边界内
            if (this.disableBounce) {
                pos = math.clamp(pos, minBound, maxBound);
            }

            if (this.pixelAlign) pos = Math.round(pos);
            this._setContentMainPos(pos);
            if (this.useVirtualList) this._updateVisible(false);
        }
    }

    /**************** [公共数据接口]  ****************/

    /** 更新单个动态尺寸 item 的主方向尺寸
     * @param index 数据索引
     * @param newSize 新尺寸，不传时从 getItemHeightFn 重新读取
     */
    public updateItemHeight(index: number, newSize?: number) {
        if (!this.useDynamicSize) {
            console.warn('[VScrollView] 只有不等大小模式支持 updateItemHeight');
            return;
        }
        if (index < 0 || index >= this.totalCount) {
            console.warn(`[VScrollView] 索引 ${index} 超出范围`);
            return;
        }
        let size = newSize;
        if (size === undefined) {
            if (this.getItemHeightFn) {
                size = this.getItemHeightFn(index);
            } else {
                console.error('[VScrollView] 没有提供 newSize 参数，且未设置 getItemHeightFn');
                return;
            }
        }
        if (this._itemSizes[index] === size) return;
        this._itemSizes[index] = size;
        this._rebuildPrefixSumFrom(index);
        this._updateVisible(true);
    }

    /** 从指定索引开始重建动态尺寸前缀位置表
     * @param startIndex 起始索引
     */
    private _rebuildPrefixSumFrom(startIndex: number) {
        if (startIndex === 0) {
            this._buildPrefixSum();
            return;
        }
        // 尺寸只影响当前项之后的位置，因此从变化项开始增量重建。
        let acc = this._prefixPositions[startIndex - 1] + this._itemSizes[startIndex - 1] + this.spacing;
        for (let i = startIndex; i < this._itemSizes.length; i++) {
            this._prefixPositions[i] = acc;
            acc += this._itemSizes[i] + this.spacing;
        }
        this._contentSize = acc - this.spacing + this.footerSpacing;
        if (this._contentSize < 0) this._contentSize = 0;
        if (this._isVertical()) this._contentTf.height = Math.max(this._contentSize, this._viewportSize);
        else this._contentTf.width = Math.max(this._contentSize, this._viewportSize);

        if (this._isVertical()) {
            this._boundsMin = 0;
            this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
        } else {
            this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
            this._boundsMax = 0;
        }
    }

    /** 批量更新动态尺寸 item 的主方向尺寸
     * @param updates 尺寸更新列表
     */
    public updateItemHeights(updates: Array<{ index: number; height: number }>) {
        if (!this.useDynamicSize) {
            console.warn('[VScrollView] 只有不等大小模式支持 updateItemHeights');
            return;
        }
        if (updates.length === 0) return;
        let minIndex = this.totalCount;
        let hasChange = false;
        for (const { index, height } of updates) {
            if (index < 0 || index >= this.totalCount) continue;
            if (this._itemSizes[index] !== height) {
                this._itemSizes[index] = height;
                minIndex = Math.min(minIndex, index);
                hasChange = true;
            }
        }
        if (!hasChange) return;
        this._rebuildPrefixSumFrom(minIndex);
        this._updateVisible(true);
    }

    /** 根据数据数组或数量刷新列表长度
     * @param data 数据数组或新的总数
     */
    public refreshList(data: any[] | number) {
        if (!this.useVirtualList) {
            console.warn('[VirtualScrollView] 简单滚动模式不支持 refreshList');
            return;
        }
        if (typeof data === 'number') this.setTotalCount(data);
        else this.setTotalCount(data.length);
    }

    /** 设置列表总条数并刷新内容尺寸与可见槽位
     * @param count 新的总条数
     */
    public setTotalCount(count: number) {
        this._getContentNode();
        if (!this.useVirtualList) {
            console.warn('[VScrollView] 非虚拟列表模式，不支持 setTotalCount');
            return;
        }
        this._upWidgetAlignment();
        const oldCount = this.totalCount;
        this.totalCount = Math.max(0, count | 0);
        if (this.totalCount > oldCount) {
            // 新增数据记录到动画集合，渲染进可视区时播放出现动画。
            for (let i = oldCount; i < this.totalCount; i++) {
                this._needAnimateIndices.add(i);
            }
        }
        if (this.useDynamicSize) {
            const oldLength = this._itemSizes.length;
            if (this.totalCount > oldLength) {
                // 动态尺寸新增项优先读取外部回调，其次使用模板类型采样缓存。
                for (let i = oldLength; i < this.totalCount; i++) {
                    let size = 100;
                    if (this.getItemHeightFn) {
                        size = this.getItemHeightFn(i);
                    } else if (this.getItemTypeIndexFn && this._prefabSizeCache.size > 0) {
                        const typeIndex = this.getItemTypeIndexFn(i);
                        size = this._prefabSizeCache.get(typeIndex) || 100;
                    }
                    this._itemSizes.push(size);
                }
            } else if (this.totalCount < oldLength) {
                this._itemSizes.length = this.totalCount;
            }
            this._buildPrefixSum();
            if (this.totalCount > oldCount) this._expandSlotsIfNeeded();
        } else {
            this._recomputeContentSize();
        }
        this._slotFirstIndex = math.clamp(this._slotFirstIndex, 0, Math.max(0, this.totalCount - 1));
        if (!this.useDynamicSize) {
            this._layoutSlots(this._slotFirstIndex, true);
        }
        this._updateVisible(true);
    }

    /** 刷新 Widget 对齐，确保运行时尺寸读取前布局已更新 */
    _upWidgetAlignment() {
        this.content?.getComponent?.(Widget)?.updateAlignment?.();
        this.node?.getComponent?.(Widget)?.updateAlignment?.();
    }

    /** 在动态尺寸列表扩容后按需要增加槽位 */
    private _expandSlotsIfNeeded() {
        let neededSlots = 0;
        let pos = 0;
        const endPos = this._viewportSize;
        // 只估算覆盖一屏所需的 item 数，再叠加缓冲，避免按总数创建节点。
        for (let i = 0; i < this.totalCount; i++) {
            if (pos >= endPos) break;
            neededSlots++;
            pos += this._itemSizes[i] + this.spacing;
        }
        neededSlots += this.buffer * 2 + 4;
        const minSlots = Math.ceil(this._viewportSize / 80) + this.buffer * 2;
        neededSlots = Math.max(neededSlots, minSlots);
        const maxSlots = Math.ceil(this._viewportSize / 50) + this.buffer * 4;
        neededSlots = Math.min(neededSlots, maxSlots);
        if (neededSlots > this._slots) {
            const oldSlots = this._slots;
            this._slots = neededSlots;
            for (let i = oldSlots; i < this._slots; i++) {
                this._slotNodes.push(null as any);
                this._slotPrefabIndices.push(-1);
            }
            console.log(`[VScrollView] 槽位扩展: ${oldSlots} -> ${this._slots} (总数据: ${this.totalCount})`);
        }
    }

    /**************** [公共滚动接口]  ****************/

    /** 滚动到指定主方向位置
     * @param targetPos 目标主方向坐标
     * @param animate 是否使用 tween 动画
     * @param duration 动画时长，不传时按距离自动估算
     */
    private _scrollToPosition(targetPos: number, animate = false, duration?: number) {
        targetPos = math.clamp(targetPos, this._boundsMin, this._boundsMax);
        if (this._scrollTween) {
            this._scrollTween.stop();
            this._scrollTween = null;
        }
        this._velocity = 0;
        this._isTouching = false;
        this._velSamples.length = 0;
        if (!animate) {
            this._setContentMainPos(this.pixelAlign ? Math.round(targetPos) : targetPos);
            this._updateVisible(true);
        } else {
            const currentPos = this._getContentMainPos();
            const distance = Math.abs(targetPos - currentPos);
            // 如果提供了 duration 则使用，否则根据距离自动计算
            const finalDuration = duration !== undefined ? duration : Math.max(0.2, distance / 3000);
            const targetVec = this._isVertical() ? new Vec3(0, targetPos, 0) : new Vec3(targetPos, 0, 0);
            this._scrollTween = tween(this.content!)
                .to(
                    finalDuration,
                    { position: targetVec },
                    {
                        easing: 'smooth',
                        onUpdate: () => {
                            this._updateVisible(false);
                        },
                    }
                )
                .call(() => {
                    this._updateVisible(true);
                    this._scrollTween = null;
                    this._velocity = 0;
                })
                .start();
        }
    }

    /** 滚动到列表开头
     * @param animate 是否使用动画
     * @param duration 动画时长
     */
    public scrollToTop(animate = false, duration?: number) {
        const target = this._isVertical() ? this._boundsMin : this._boundsMax;
        this._scrollToPosition(target, animate, duration);
    }

    /** 滚动到列表末尾
     * @param animate 是否使用动画
     * @param duration 动画时长
     */
    public scrollToBottom(animate = false, duration?: number) {
        const target = this._isVertical() ? this._boundsMax : this._boundsMin;
        this._scrollToPosition(target, animate, duration);
    }

    /** 滚动到指定数据索引
     * @param index 数据索引
     * @param animate 是否使用动画
     * @param duration 动画时长
     */
    public scrollToIndex(index: number, animate = false, duration?: number) {
        index = math.clamp(index | 0, 0, Math.max(0, this.totalCount - 1));
        let targetPos = 0;

        if (this.useDynamicSize) {
            // 不等大小模式：_prefixPositions 已经包含了 headerSpacing
            targetPos = this._prefixPositions[index] || 0;
        } else {
            // 等大小模式：需要手动加上 headerSpacing
            const line = Math.floor(index / this.gridCount);
            targetPos = this.headerSpacing + line * (this.itemMainSize + this.spacing);
        }

        // 横向模式：滚动方向相反，取负值
        if (!this._isVertical()) {
            targetPos = -targetPos;
        }

        this._scrollToPosition(targetPos, animate, duration);
    }

    /** 开关 item 内 Label 的排序层处理
     * @param onoff 是否开启排序层处理
     */
    public onOffSortLayer(onoff: boolean) {
        this._initSortLayerFlag = onoff;
        this._onOffSortLayerOperation();
    }

    /** 将当前排序层开关同步到所有活跃槽位 */
    private _onOffSortLayerOperation() {
        for (const element of this._slotNodes) {
            const sitem = element?.getComponent(VScrollViewItem);
            if (sitem) {
                if (this._initSortLayerFlag) sitem.onSortLayer();
                else sitem.offSortLayer();
            }
        }
    }

    /** 无动画跳转到指定主方向位置
     * @param targetPos 目标主方向坐标
     */
    private _flashToPosition(targetPos: number) {
        targetPos = math.clamp(targetPos, this._boundsMin, this._boundsMax);
        if (this._scrollTween) {
            this._scrollTween.stop();
            this._scrollTween = null;
        }
        this._velocity = 0;
        this._isTouching = false;
        this._velSamples.length = 0;
        this._setContentMainPos(this.pixelAlign ? Math.round(targetPos) : targetPos);
        this._updateVisible(true);
    }

    /** 立即跳转到列表开头 */
    public flashToTop() {
        const target = this._isVertical() ? this._boundsMin : this._boundsMax;
        this._flashToPosition(target);
    }

    /** 立即跳转到列表末尾 */
    public flashToBottom() {
        const target = this._isVertical() ? this._boundsMax : this._boundsMin;
        this._flashToPosition(target);
    }

    /** 立即跳转到指定数据索引
     * @param index 数据索引
     */
    public flashToIndex(index: number) {
        if (!this.useVirtualList) {
            console.warn('[VirtualScrollView] 简单滚动模式不支持 flashToIndex');
            return;
        }
        index = math.clamp(index | 0, 0, Math.max(0, this.totalCount - 1));
        let targetPos = 0;

        if (this.useDynamicSize) {
            // 不等大小模式：_prefixPositions 已经包含了 headerSpacing
            targetPos = this._prefixPositions[index] || 0;
        } else {
            // 等大小模式：需要手动加上 headerSpacing
            const line = Math.floor(index / this.gridCount);
            targetPos = this.headerSpacing + line * (this.itemMainSize + this.spacing);
        }

        if (!this._isVertical()) {
            targetPos = -targetPos;
        }

        this._flashToPosition(targetPos);
    }

    /** 重新渲染当前可视范围内的单个 item
     * @param index 数据索引
     */
    public refreshIndex(index: number) {
        if (!this.useVirtualList) {
            console.warn('[VirtualScrollView] 简单滚动模式不支持 refreshIndex');
            return;
        }
        const first = this._slotFirstIndex;
        const last = first + this._slots - 1;
        if (index < first || index > last) return;
        const slot = index - first;
        const node = this._slotNodes[slot];
        if (node && this.renderItemFn) this.renderItemFn(node, index);
    }

    /**************** [触摸处理]  ****************/

    /** 按需阻止父节点接收触摸事件
     * @param e 触摸事件
     */
    private _stopTouchEvent(e?: EventTouch) {
        if (!e) return;

        // 如果已经确定要阻止父级，直接阻止
        if (this._shouldBlockParent) {
            e.propagationStopped = true;
        }
    }

    /** 处理触摸按下，重置滚动状态并停止当前动画
     * @param e 触摸事件
     */
    private _onDown(e: EventTouch) {
        // 记录触摸起始位置
        const uiPos = e.getUILocation(this._touchStartPos);
        this._touchStartPos.set(uiPos);
        this._hasDeterminedScrollDirection = false;
        this._shouldBlockParent = false;

        // 分页模式：记录触摸开始时的内容位置
        if (this.enablePageSnap) {
            this._pageStartPos = this._getContentMainPos();
        }

        this._stopTouchEvent(e);
        this._isTouching = true;
        this._velocity = 0;
        this._velSamples.length = 0;
        if (this._scrollTween) {
            this._scrollTween.stop();
            this._scrollTween = null;
        }
    }

    /** 处理触摸移动，驱动拖拽、方向拦截、刷新和加载更多状态
     * @param e 触摸事件
     */
    private _onMove(e: EventTouch) {
        if (!this._isTouching) return;

        const uiDelta = e.getUIDelta(this._tmpMoveVec2);
        const currentPos = e.getUILocation();

        // 第一次移动时判断滑动方向
        if (!this._hasDeterminedScrollDirection) {
            const deltaX = currentPos.x - this._touchStartPos.x;
            const deltaY = currentPos.y - this._touchStartPos.y;
            const totalDelta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            // 超过距离阈值才判断方向
            if (totalDelta > this._scrollDirectionThreshold) {
                this._hasDeterminedScrollDirection = true;

                // 计算滑动角度（相对于水平方向）
                const angle = Math.abs((Math.atan2(deltaY, deltaX) * 180) / Math.PI);

                // 判断是否为纵向滑动：角度在 [90° - 阈值, 90° + 阈值] 范围内
                const isVerticalScroll = angle > 90 - this._scrollAngleThreshold && angle < 90 + this._scrollAngleThreshold;

                // 判断是否为横向滑动：角度在 [0°, 阈值] 或 [180° - 阈值, 180°] 范围内
                const isHorizontalScroll = angle < this._scrollAngleThreshold || angle > 180 - this._scrollAngleThreshold;

                const isListVertical = this._isVertical();

                // 方向一致时才考虑拦截
                if ((isListVertical && isVerticalScroll) || (!isListVertical && isHorizontalScroll)) {
                    // 检查是否在边界
                    const pos = this._getContentMainPos();
                    const minBound = Math.min(this._boundsMin, this._boundsMax);
                    const maxBound = Math.max(this._boundsMin, this._boundsMax);
                    const delta = this._isVertical() ? uiDelta.y : uiDelta.x;

                    // 判断滑动方向
                    const scrollingToStart = this._isVertical() ? delta > 0 : delta < 0;
                    const scrollingToEnd = this._isVertical() ? delta < 0 : delta > 0;

                    // 只有在非边界位置，或者在边界但向内滑动时才拦截
                    const atStartBound = this._isVertical() ? pos <= minBound : pos >= maxBound;
                    const atEndBound = this._isVertical() ? pos >= maxBound : pos <= minBound;

                    // 在中间区域或从边界往列表内部滑动时，当前列表应接管触摸。
                    if ((!atStartBound && !atEndBound) || (atStartBound && scrollingToEnd) || (atEndBound && scrollingToStart)) {
                        this._shouldBlockParent = true;
                    }
                }
            }
        }

        this._stopTouchEvent(e);
        // const uiDelta = e.getUIDelta(this._tmpMoveVec2);
        const delta = this._isVertical() ? uiDelta.y : uiDelta.x;
        let pos = this._getContentMainPos();
        const minBound = Math.min(this._boundsMin, this._boundsMax);
        const maxBound = Math.max(this._boundsMin, this._boundsMax);

        // 计算是否需要下拉刷新或上拉加载
        let finalDelta = delta;
        let isPullingRefresh = false;
        let isPullingLoadMore = false;

        // console.log(`delta: ${delta}, pos: ${pos}, minBound: ${minBound}, maxBound: ${maxBound}`);

        if (this.enablePullRefresh && !this._isRefreshing) {
            // 纵向：顶部下拉（pos < minBound 且向下拉）
            // 横向：左侧右拉（pos > maxBound 且向右拉）
            const atTopBound = this._isVertical() ? pos <= minBound : pos >= maxBound;
            const pullingDown = this._isVertical() ? delta < 0 : delta > 0;

            if (atTopBound && pullingDown) {
                isPullingRefresh = true;
                // 越界越远阻尼越强，避免刷新区域被无限拉开。
                const overOffset = this._isVertical() ? minBound - pos : pos - maxBound;
                const resistance = 1 - Math.min(overOffset / this.pullRefreshMaxOffset, 1) * (1 - this.pullDampingRate);
                finalDelta = delta * resistance;
                this._pullOffset = Math.min(overOffset + Math.abs(finalDelta), this.pullRefreshMaxOffset);
                // console.log(`[VScrollView] 下拉偏移: ${this._pullOffset}`);

                // 更新刷新状态
                if (this._pullOffset >= this.pullRefreshThreshold) {
                    this._updateRefreshState(RefreshState.READY, this._pullOffset);
                } else {
                    this._updateRefreshState(RefreshState.PULLING, this._pullOffset);
                }
            }
        }

        if (this.enableLoadMore && !this._isLoadingMore && this._hasMore) {
            // 纵向：底部上拉（pos > maxBound 且向上拉）
            // 横向：右侧左拉（pos < minBound 且向左拉）
            const atBottomBound = this._isVertical() ? pos >= maxBound : pos <= minBound;
            const pullingUp = this._isVertical() ? delta > 0 : delta < 0;

            if (atBottomBound && pullingUp) {
                isPullingLoadMore = true;
                // 加载更多区域使用与下拉刷新一致的阻尼模型。
                const overOffset = this._isVertical() ? pos - maxBound : minBound - pos;
                const resistance = 1 - Math.min(overOffset / this.loadMoreMaxOffset, 1) * (1 - this.pullDampingRate);
                finalDelta = delta * resistance;
                this._loadOffset = Math.min(overOffset + Math.abs(finalDelta), this.loadMoreMaxOffset);

                // console.log(`[VScrollView] 上拉偏移: ${this._loadOffset}`);
                // 更新加载状态
                if (this._loadOffset >= this.loadMoreThreshold) {
                    this._updateLoadMoreState(LoadMoreState.READY, this._loadOffset);
                } else {
                    this._updateLoadMoreState(LoadMoreState.PULLING, this._loadOffset);
                }
            }
        }

        // 如果禁用越界滚动，限制位置在边界内
        if (this.disableBounce) {
            const newPos = pos + finalDelta;
            // 不允许越界，直接限制在边界范围内
            if (newPos < minBound) {
                finalDelta = minBound - pos;
            } else if (newPos > maxBound) {
                finalDelta = maxBound - pos;
            }
        }

        // 应用位置变化
        pos += finalDelta;
        if (this.pixelAlign) pos = Math.round(pos);
        this._setContentMainPos(pos);

        // 记录速度采样
        const t = performance.now() / 1000;
        this._velSamples.push({ t, delta: finalDelta });
        const t0 = t - this.velocityWindow;
        while (this._velSamples.length && this._velSamples[0].t < t0) this._velSamples.shift();
        if (this.useVirtualList) this._updateVisible(false);
    }

    /** 处理触摸抬起，触发刷新/加载或计算惯性速度
     * @param e 触摸事件
     */
    private _onUp(e?: EventTouch) {
        // 重置方向判断标志
        this._hasDeterminedScrollDirection = false;
        this._shouldBlockParent = false;

        this._stopTouchEvent(e);
        if (!this._isTouching) return;
        this._isTouching = false;

        // 检查是否触发刷新
        if (this._refreshState === RefreshState.READY && !this._isRefreshing) {
            this._triggerRefresh();
            this._velSamples.length = 0;
            return;
        }

        // 检查是否触发加载
        if (this._loadMoreState === LoadMoreState.READY && !this._isLoadingMore) {
            this._triggerLoadMore();
            this._velSamples.length = 0;
            return;
        }

        // 重置状态
        if (this._refreshState !== RefreshState.REFRESHING) {
            this._pullOffset = 0;
            this._updateRefreshState(RefreshState.IDLE, 0);
        }
        if (this._loadMoreState !== LoadMoreState.LOADING) {
            this._loadOffset = 0;
            this._updateLoadMoreState(LoadMoreState.IDLE, 0);
        }

        // 计算速度
        if (this._velSamples.length >= 2) {
            // 取最后几帧采样平均速度，减少单帧抖动对惯性滚动的影响。
            let sum = 0;
            let dtSum = 0;
            const sampleCount = Math.min(this._velSamples.length, 5);
            const startIndex = this._velSamples.length - sampleCount;
            for (let i = startIndex + 1; i < this._velSamples.length; i++) {
                sum += this._velSamples[i].delta;
                dtSum += this._velSamples[i].t - this._velSamples[i - 1].t;
            }
            if (dtSum > 0.001) {
                this._velocity = sum / dtSum;
                this._velocity = math.clamp(this._velocity, -this.maxVelocity, this.maxVelocity);
            } else {
                this._velocity =
                    this._velSamples.length > 0 ? math.clamp(this._velSamples[this._velSamples.length - 1].delta * 60, -this.maxVelocity, this.maxVelocity) : 0;
            }
        } else if (this._velSamples.length === 1) {
            this._velocity = math.clamp(this._velSamples[0].delta * 60, -this.maxVelocity, this.maxVelocity);
        } else {
            this._velocity = 0;
        }
        this._velSamples.length = 0;

        // 分页吸附模式：根据滑动距离判断翻页
        if (this.enablePageSnap) {
            this._performPageSnapByDistance();
        }
    }

    /**************** [刷新加载]  ****************/

    /** 更新下拉刷新状态并通知外部
     * @param state 新状态
     * @param offset 当前下拉偏移
     */
    private _updateRefreshState(state: RefreshState, offset: number) {
        this._refreshState = state;
        if (this.onRefreshStateChangeFn) {
            this.onRefreshStateChangeFn(state, offset);
        }
    }

    /** 更新上拉加载状态并通知外部
     * @param state 新状态
     * @param offset 当前上拉偏移
     */
    private _updateLoadMoreState(state: LoadMoreState, offset: number) {
        this._loadMoreState = state;
        if (this.onLoadMoreStateChangeFn) {
            this.onLoadMoreStateChangeFn(state, offset);
        }
    }

    /** 触发下拉刷新状态 */
    private _triggerRefresh() {
        this._isRefreshing = true;
        this._velocity = 0;
        this._updateRefreshState(RefreshState.REFRESHING, this.pullRefreshThreshold);
    }

    /** 触发上拉加载更多状态 */
    private _triggerLoadMore() {
        this._isLoadingMore = true;
        this._velocity = 0;
        this._updateLoadMoreState(LoadMoreState.LOADING, this.loadMoreThreshold);
    }

    /** 完成刷新（外部调用）
     * @param success 是否刷新成功
     */
    public finishRefresh(success: boolean = true) {
        if (!this._isRefreshing) return;
        this._isRefreshing = false;
        this._pullOffset = 0;
        this._updateRefreshState(success ? RefreshState.COMPLETE : RefreshState.IDLE, 0);

        // 延迟重置到 IDLE 状态
        this.scheduleOnce(() => {
            if (this._refreshState === RefreshState.COMPLETE) {
                this._updateRefreshState(RefreshState.IDLE, 0);
            }
        }, 0.3);
    }

    /** 完成加载更多（外部调用）
     * @param hasMore 是否还有更多数据
     */
    public finishLoadMore(hasMore: boolean = true) {
        if (!this._isLoadingMore) return;
        this._isLoadingMore = false;
        this._loadOffset = 0;
        this._hasMore = hasMore;

        if (!hasMore) {
            this._updateLoadMoreState(LoadMoreState.NO_MORE, 0);
        } else {
            this._updateLoadMoreState(LoadMoreState.COMPLETE, 0);
            // 延迟重置到 IDLE 状态
            this.scheduleOnce(() => {
                if (this._loadMoreState === LoadMoreState.COMPLETE) {
                    this._updateLoadMoreState(LoadMoreState.IDLE, 0);
                }
            }, 0.3);
        }
    }

    /** 重置加载更多状态（当数据清空或重新加载时调用） */
    public resetLoadMoreState() {
        this._hasMore = true;
        this._isLoadingMore = false;
        this._loadOffset = 0;
        this._updateLoadMoreState(LoadMoreState.IDLE, 0);
    }

    /**************** [槽位布局]  ****************/

    /** 根据当前滚动位置更新可见槽位
     * @param force 是否强制重排全部槽位
     */
    private _updateVisible(force: boolean) {
        if (!this.useVirtualList) return;
        let scrollPos = this._getContentMainPos();
        let searchPos: number;
        if (this._isVertical()) {
            searchPos = math.clamp(scrollPos, 0, this._contentSize);
        } else {
            searchPos = math.clamp(-scrollPos, 0, this._contentSize);
        }

        let newFirst = 0;
        if (this.useDynamicSize) {
            const range = this._calcVisibleRange(searchPos);
            newFirst = range.start;
        } else {
            const stride = this.itemMainSize + this.spacing;
            // 减去 headerSpacing 后再计算行号
            const adjustedPos = Math.max(0, searchPos - this.headerSpacing);
            const firstLine = Math.floor(adjustedPos / stride);
            const first = firstLine * this.gridCount;
            newFirst = math.clamp(first, 0, Math.max(0, this.totalCount - 1));
        }
        if (this.totalCount < this._slots) newFirst = 0;
        if (force) {
            // 强制刷新时不做循环复用，直接按新首索引重排全部槽位。
            this._slotFirstIndex = newFirst;
            this._layoutSlots(this._slotFirstIndex, true);
            return;
        }
        const diff = newFirst - this._slotFirstIndex;
        if (diff === 0) return;
        if (Math.abs(diff) >= this._slots) {
            // 跳跃距离超过槽位数量时，循环复用收益不大，直接整段重排。
            this._slotFirstIndex = newFirst;
            this._layoutSlots(this._slotFirstIndex, true);
            return;
        }
        const absDiff = Math.abs(diff);
        if (diff > 0) {
            // 向列表末尾滚动：头部槽位移到尾部并绑定新的数据索引。
            const moved = this._slotNodes.splice(0, absDiff);
            this._slotNodes.push(...moved);
            if (this.useDynamicSize && this._slotPrefabIndices.length > 0) {
                const movedIndices = this._slotPrefabIndices.splice(0, absDiff);
                this._slotPrefabIndices.push(...movedIndices);
            }
            this._slotFirstIndex = newFirst;
            for (let i = 0; i < absDiff; i++) {
                const slot = this._slots - absDiff + i;
                const idx = this._slotFirstIndex + slot;
                if (idx >= this.totalCount) {
                    const node = this._slotNodes[slot];
                    if (node) node.active = false;
                } else {
                    this._layoutSingleSlot(this._slotNodes[slot], idx, slot);
                }
            }
        } else {
            // 向列表开头滚动：尾部槽位移到头部并绑定新的数据索引。
            const moved = this._slotNodes.splice(this._slotNodes.length + diff, absDiff);
            this._slotNodes.unshift(...moved);
            if (this.useDynamicSize && this._slotPrefabIndices.length > 0) {
                const movedIndices = this._slotPrefabIndices.splice(this._slotPrefabIndices.length + diff, absDiff);
                this._slotPrefabIndices.unshift(...movedIndices);
            }
            this._slotFirstIndex = newFirst;
            for (let i = 0; i < absDiff; i++) {
                const idx = this._slotFirstIndex + i;
                if (idx >= this.totalCount) {
                    const node = this._slotNodes[i];
                    if (node) node.active = false;
                } else {
                    this._layoutSingleSlot(this._slotNodes[i], idx, i);
                }
            }
        }
    }

    /** 布局单个槽位节点并触发渲染回调
     * @param node 等大小模式下已有槽位节点，动态尺寸模式可为空
     * @param idx 数据索引
     * @param slot 槽位索引
     */
    private async _layoutSingleSlot(node: Node | null, idx: number, slot: number) {
        if (!this.useVirtualList) return;
        if (this.useDynamicSize) {
            let targetPrefabIndex = this.getItemTypeIndexFn?.(idx) ?? 0;
            const currentPrefabIndex = this._slotPrefabIndices[slot];
            let newNode: Node | null = null;
            if (currentPrefabIndex === targetPrefabIndex && this._slotNodes[slot]) {
                newNode = this._slotNodes[slot];
            } else {
                // 动态尺寸多模板模式下，类型变化时先回收到旧类型池，再取新类型节点。
                if (this._slotNodes[slot] && this._nodePool && currentPrefabIndex >= 0) {
                    this._nodePool.put(this._slotNodes[slot], currentPrefabIndex);
                }
                if (this._nodePool) {
                    newNode = this._nodePool.get(targetPrefabIndex);
                    if (!newNode) {
                        console.error(`[VScrollView] 无法获取类型 ${targetPrefabIndex} 的节点`);
                        return;
                    }
                    newNode.parent = this.content;
                    this._slotNodes[slot] = newNode;
                    this._slotPrefabIndices[slot] = targetPrefabIndex;
                }
            }
            if (!newNode) {
                console.error(`[VScrollView] 槽位 ${slot} 节点为空，索引 ${idx}`);
                return;
            }
            newNode.active = true;
            this._updateItemClickHandler(newNode, idx);
            if (this.renderItemFn) this.renderItemFn(newNode, idx);
            // 渲染后重新确认尺寸，支持内容驱动高度变化的 item。
            if (this.getItemHeightFn) {
                const expectedSize = this.getItemHeightFn(idx);
                if (this._itemSizes[idx] !== expectedSize) {
                    this.updateItemHeight(idx, expectedSize);
                    return;
                }
            } else {
                const uit = newNode.getComponent(UITransform);
                const actualSize = this._isVertical() ? uit?.height || 100 : uit?.width || 100;
                if (Math.abs(this._itemSizes[idx] - actualSize) > 1) {
                    this.updateItemHeight(idx, actualSize);
                    return;
                }
            }
            const uit = newNode.getComponent(UITransform);
            const size = this._itemSizes[idx];
            const itemStart = this._prefixPositions[idx];
            if (this._isVertical()) {
                const anchorY = uit?.anchorY ?? 0.5;
                const anchorOffsetY = size * (1 - anchorY);
                const nodeY = itemStart + anchorOffsetY;
                const y = -nodeY;
                newNode.setPosition(0, this.pixelAlign ? Math.round(y) : y);
            } else {
                // 修改：横向模式下，itemStart 是正值，但 content.x 是负值
                // 所以 item 的 x 位置应该直接使用 itemStart（因为 content 整体向左移动）
                const anchorX = uit?.anchorX ?? 0.5;
                const anchorOffsetX = size * anchorX;
                const nodeX = itemStart + anchorOffsetX;
                // 不需要取负，因为 content 本身已经是负值了
                const x = nodeX;
                newNode.setPosition(this.pixelAlign ? Math.round(x) : x, 0);
            }
            if (this._needAnimateIndices.has(idx)) {
                if (this.playItemAppearAnimationFn) this.playItemAppearAnimationFn(newNode, idx);
                else this._playDefaultItemAppearAnimation(newNode, idx);
                this._needAnimateIndices.delete(idx);
            }
        } else {
            // 等大小模式
            if (!node) return;
            node.active = true;
            const stride = this.itemMainSize + this.spacing;
            const line = Math.floor(idx / this.gridCount);
            const gridPos = idx % this.gridCount;
            const uit = node.getComponent(UITransform);

            // 1. 计算基础位置（包含 headerSpacing）
            const itemStart = this.headerSpacing + line * stride;

            // 2. 计算全局偏移（视口居中）- 只在内容小于视口时生效
            let globalOffset = 0;
            let shouldAutoCenter = false; // 是否应该居中
            if (this.autoCenter) {
                const totalLines = Math.ceil(this.totalCount / this.gridCount);
                const totalContentSize = this.headerSpacing + totalLines * stride - this.spacing + this.footerSpacing;
                // 只有当内容小于视口时才居中
                if (totalContentSize < this._viewportSize) {
                    shouldAutoCenter = true;
                    globalOffset = (this._viewportSize - totalContentSize) / 2;
                }
            }

            if (this._isVertical()) {
                // 纵向模式：主方向是 Y，副方向是 X
                const anchorY = uit?.anchorY ?? 0.5;
                const anchorOffsetY = this.itemMainSize * (1 - anchorY);
                const nodeY = itemStart + anchorOffsetY + globalOffset;
                const y = -nodeY;

                // 3. 计算当前行的实际子项数量（行内居中）- 只在启用居中且内容小于视口时生效
                let actualCountInLine = this.gridCount;
                if (shouldAutoCenter) {
                    const startIdxOfLine = line * this.gridCount;
                    const endIdxOfLine = Math.min(startIdxOfLine + this.gridCount, this.totalCount);
                    actualCountInLine = endIdxOfLine - startIdxOfLine;
                }

                // 根据实际数量计算总宽度和位置
                const totalWidth = actualCountInLine * this.itemCrossSize + (actualCountInLine - 1) * this.gridSpacing;
                const x = gridPos * (this.itemCrossSize + this.gridSpacing) - totalWidth / 2 + this.itemCrossSize / 2;

                node.setPosition(this.pixelAlign ? Math.round(x) : x, this.pixelAlign ? Math.round(y) : y);
                if (uit) {
                    uit.width = this.itemCrossSize;
                    uit.height = this.itemMainSize;
                }
            } else {
                // 横向模式：主方向是 X，副方向是 Y
                const anchorX = uit?.anchorX ?? 0.5;
                const anchorOffsetX = this.itemMainSize * anchorX;
                const nodeX = itemStart + anchorOffsetX + globalOffset;
                const x = nodeX;

                // 3. 计算当前列的实际子项数量（列内居中）- 只在启用居中且内容小于视口时生效
                let actualCountInLine = this.gridCount;
                if (shouldAutoCenter) {
                    const startIdxOfLine = line * this.gridCount;
                    const endIdxOfLine = Math.min(startIdxOfLine + this.gridCount, this.totalCount);
                    actualCountInLine = endIdxOfLine - startIdxOfLine;
                }

                // 根据实际数量计算总高度和位置
                const totalHeight = actualCountInLine * this.itemCrossSize + (actualCountInLine - 1) * this.gridSpacing;
                const y = totalHeight / 2 - gridPos * (this.itemCrossSize + this.gridSpacing) - this.itemCrossSize / 2;

                node.setPosition(this.pixelAlign ? Math.round(x) : x, this.pixelAlign ? Math.round(y) : y);
                if (uit) {
                    uit.width = this.itemMainSize;
                    uit.height = this.itemCrossSize;
                }
            }
            this._updateItemClickHandler(node, idx);
            if (this.renderItemFn) this.renderItemFn(node, idx);
            if (this._needAnimateIndices.has(idx)) {
                if (this.playItemAppearAnimationFn) this.playItemAppearAnimationFn(node, idx);
                else this._playDefaultItemAppearAnimation(node, idx);
                this._needAnimateIndices.delete(idx);
            }
        }
    }

    /** 默认 item 出现动画
     * @param node item 节点
     * @param index 数据索引
     */
    private _playDefaultItemAppearAnimation(node: Node, index: number) { }

    /** 给 item 节点挂载点击组件并同步数据索引
     * @param node item 节点
     * @param index 数据索引
     */
    private _updateItemClickHandler(node: Node, index: number) {
        if (!this.useVirtualList) return;
        let itemScript = node.getComponent(VScrollViewItem);
        if (!itemScript) itemScript = node.addComponent(VScrollViewItem);
        this._initSortLayerFlag ? itemScript.onSortLayer() : itemScript.offSortLayer();
        itemScript.useItemClickEffect = this.onItemClickFn ? true : false;
        if (!itemScript.onClickCallback) {
            itemScript.onClickCallback = (idx: number) => {
                if (this.onItemClickFn) this.onItemClickFn(node, idx);
            };
        }
        if (!itemScript.onLongPressCallback) {
            itemScript.onLongPressCallback = (idx: number) => {
                if (this.onItemLongPressFn) this.onItemLongPressFn(node, idx);
            };
        }
        itemScript.setDataIndex(index);
    }

    /** 批量布局当前槽位
     * @param firstIndex 第一个槽位绑定的数据索引
     * @param forceRender 是否强制渲染
     */
    private _layoutSlots(firstIndex: number, forceRender: boolean) {
        if (!this.useVirtualList) return;
        for (let s = 0; s < this._slots; s++) {
            const idx = firstIndex + s;
            const node = this._slotNodes[s];
            if (idx >= this.totalCount) {
                if (node) node.active = false;
            } else {
                this._layoutSingleSlot(node, idx, s);
            }
        }
    }

    /** 重新计算内容尺寸和滚动边界 */
    private _recomputeContentSize() {
        if (!this.useVirtualList) {
            this._contentSize = this._isVertical() ? this._contentTf.height : this._contentTf.width;
            if (this._isVertical()) {
                this._boundsMin = 0;
                this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
            } else {
                this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
                this._boundsMax = 0;
            }
            return;
        }
        if (this.useDynamicSize) return;
        const stride = this.itemMainSize + this.spacing;
        const totalLines = Math.ceil(this.totalCount / this.gridCount);
        // 添加 headerSpacing 和 footerSpacing
        this._contentSize = totalLines > 0 ? this.headerSpacing + totalLines * stride - this.spacing + this.footerSpacing : 0;
        if (this._isVertical()) this._contentTf.height = Math.max(this._contentSize, this._viewportSize);
        else this._contentTf.width = Math.max(this._contentSize, this._viewportSize);

        if (this._isVertical()) {
            this._boundsMin = 0;
            this._boundsMax = Math.max(0, this._contentSize - this._viewportSize);
        } else {
            this._boundsMin = -Math.max(0, this._contentSize - this._viewportSize);
            this._boundsMax = 0;
        }
    }

    /**************** [分页吸附]  ****************/

    /** 获取当前页索引
     * @returns 当前页索引
     */
    public getCurrentPageIndex(): number {
        return this._currentPageIndex;
    }

    /** 滚动到指定页
     * @param pageIndex 目标页索引
     * @param animate 是否使用动画
     */
    public scrollToPage(pageIndex: number, animate: boolean = true) {
        if (!this.enablePageSnap) {
            console.warn('[VScrollView] 未启用分页吸附模式');
            return;
        }

        const maxPage = this._getMaxPageIndex();
        pageIndex = math.clamp(pageIndex, 0, maxPage);

        const targetPos = this._getPagePosition(pageIndex);
        this._scrollToPosition(targetPos, animate, this.pageSnapDuration);

        this._updateCurrentPage(pageIndex);
    }

    /** 获取最大页索引
     * @returns 最大页索引
     */
    private _getMaxPageIndex(): number {
        if (this.useDynamicSize) {
            return Math.max(0, this.totalCount - 1);
        } else {
            const totalLines = Math.ceil(this.totalCount / this.gridCount);
            return Math.max(0, totalLines - 1);
        }
    }

    /** 根据当前位置计算最近的页索引
     * @returns 最近页索引
     */
    private _getNearestPageIndex(): number {
        const pos = this._getContentMainPos();
        const searchPos = this._isVertical() ? pos : -pos;

        if (this.useDynamicSize) {
            // 不等大小模式：根据 item 的中心位置判断
            let nearestIdx = 0;
            let minDist = Infinity;

            // 动态尺寸页宽/高不固定，只能逐项比较与当前滚动位置的距离。
            for (let i = 0; i < this.totalCount; i++) {
                const itemStart = this._prefixPositions[i];
                const itemSize = this._itemSizes[i];
                const itemCenter = itemStart + itemSize / 2;
                const dist = Math.abs(searchPos - itemCenter);

                if (dist < minDist) {
                    minDist = dist;
                    nearestIdx = i;
                }
            }
            return nearestIdx;
        } else {
            // 等大小模式：根据行/列计算
            const stride = this.itemMainSize + this.spacing;
            const adjustedPos = Math.max(0, searchPos - this.headerSpacing);
            const line = Math.round(adjustedPos / stride);
            return math.clamp(line, 0, this._getMaxPageIndex());
        }
    }

    /** 根据页索引计算目标位置
     * @param pageIndex 页索引
     * @returns 目标主方向坐标
     */
    private _getPagePosition(pageIndex: number): number {
        let targetPos = 0;

        if (this.useDynamicSize) {
            targetPos = this._prefixPositions[pageIndex] || 0;
        } else {
            targetPos = this.headerSpacing + pageIndex * (this.itemMainSize + this.spacing);
        }

        // 横向模式取负值
        if (!this._isVertical()) {
            targetPos = -targetPos;
        }

        // 限制在边界范围内
        return math.clamp(targetPos, this._boundsMin, this._boundsMax);
    }

    /** 更新当前页并触发回调
     * @param pageIndex 新页索引
     */
    private _updateCurrentPage(pageIndex: number) {
        if (this._currentPageIndex !== pageIndex) {
            this._currentPageIndex = pageIndex;
            if (this.onPageChangeFn) {
                this.onPageChangeFn(pageIndex);
            }
        }
    }

    /** 按当前位置执行分页吸附 */
    private _performPageSnap() {
        if (!this.enablePageSnap) return;

        // 如果正在 tween 吸附中，不重复执行
        if (this._scrollTween) return;

        const nearestPage = this._getNearestPageIndex();
        const targetPage = math.clamp(nearestPage, 0, this._getMaxPageIndex());

        const targetPos = this._getPagePosition(targetPage);
        const currentPos = this._getContentMainPos();

        // 如果已经在目标位置，只更新页码
        if (Math.abs(targetPos - currentPos) < 1) {
            this._updateCurrentPage(targetPage);
            return;
        }

        this._velocity = 0;
        this._scrollToPosition(targetPos, true, this.pageSnapDuration);

        this._updateCurrentPage(targetPage);
    }

    /** 根据触摸拖动距离执行分页吸附 */
    private _performPageSnapByDistance() {
        if (!this.enablePageSnap) return;
        if (this._scrollTween) return;

        const currentPos = this._getContentMainPos();
        const dragDistance = currentPos - this._pageStartPos; // 滑动距离

        // 获取当前页的尺寸
        const pageSize = this._getCurrentPageSize();

        // 判断翻页的距离阈值
        const threshold = pageSize * this.pageSnapDistanceRatio;

        // 基于当前页索引计算目标页
        let targetPage = this._currentPageIndex;
        const maxPage = this._getMaxPageIndex();

        if (this._isVertical()) {
            // 纵向：dragDistance > 0 表示向下滑（看上一页），< 0 表示向上滑（看下一页）
            if (dragDistance > threshold) {
                targetPage = this._currentPageIndex + 1;
            } else if (dragDistance < -threshold) {
                targetPage = this._currentPageIndex - 1;
            }
        } else {
            // 横向：dragDistance < 0 表示向左滑（看下一页），> 0 表示向右滑（看上一页）
            if (dragDistance < -threshold) {
                targetPage = this._currentPageIndex + 1;
            } else if (dragDistance > threshold) {
                targetPage = this._currentPageIndex - 1;
            }
        }

        // 限制范围
        targetPage = math.clamp(targetPage, 0, maxPage);

        const targetPos = this._getPagePosition(targetPage);

        // 如果已经在目标位置，只更新页码
        if (Math.abs(targetPos - currentPos) < 1) {
            this._updateCurrentPage(targetPage);
            this._velocity = 0;
            return;
        }

        this._velocity = 0;
        this._scrollToPosition(targetPos, true, this.pageSnapDuration);
        this._updateCurrentPage(targetPage);
    }

    /** 获取当前页的主方向尺寸
     * @returns 当前页主方向尺寸
     */
    private _getCurrentPageSize(): number {
        if (this.useDynamicSize) {
            const pageIndex = math.clamp(this._currentPageIndex, 0, this.totalCount - 1);
            return this._itemSizes[pageIndex] || 100;
        } else {
            return this.itemMainSize + this.spacing;
        }
    }

    /** 根据主方向位置计算页索引
     * @param pos 主方向坐标
     * @returns 页索引
     */
    private _getPageIndexByPosition(pos: number): number {
        const searchPos = this._isVertical() ? pos : -pos;

        if (this.useDynamicSize) {
            return this._posToFirstIndex(searchPos);
        } else {
            const stride = this.itemMainSize + this.spacing;
            const adjustedPos = Math.max(0, searchPos - this.headerSpacing);
            const line = Math.floor(adjustedPos / stride);
            return math.clamp(line, 0, this._getMaxPageIndex());
        }
    }
}
