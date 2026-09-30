import { _decorator, Component, EventTouch, Label, Node, settings, Sorting2D, Vec2 } from 'cc';
const { ccclass, menu } = _decorator;

const hasSorting2d = !!Sorting2D;
if (!hasSorting2d) {
    console.warn(`❌当前引擎版本不支持Sorting2D组件，如果需要请切换到3.8.7及以上版本`);
}

/** 更改 UI 节点的 2D 渲染排序层级
 * @param sortingNode 需要修改排序的节点
 * @param sortingLayer 目标排序层级值
 * @param sortingOrder 同层级下的排序顺序
 */
export function changeUISortingLayer(sortingNode: Node, sortingLayer: number, sortingOrder?: number) {
    if (!hasSorting2d) {
        return;
    }
    let sortingLayers = settings.querySettings('engine', 'sortingLayers') as any[];

    //编辑器bug,默认有default,但是读取出来没有,需要自己配置一个后才会有默认数据.
    if (!sortingLayers || sortingLayers.length === 0) {
        sortingLayers = [{ id: 0, value: 0, name: 'default' }];
    }

    const result = sortingLayers.find(layer => layer.value === sortingLayer);
    //如果没有找到对应的layer,则使用引擎内置默认层,并给出警告
    if (!result) {
        console.warn(`❌未找到对应的sortingLayer:${sortingLayer}，请检查是否已在项目设置中配置该层级。将使用默认层级代替。`);
        sortingLayer = sortingLayers[0].value;
    }

    //@ts-ignore
    const sort2d = sortingNode.getComponent(Sorting2D) || sortingNode.addComponent(Sorting2D);
    if (sort2d) {
        sort2d.enabled = true;
        //@ts-ignore
        sort2d.sortingLayer = sortingLayer;
        if (sortingOrder !== undefined) {
            //@ts-ignore
            sort2d.sortingOrder = sortingOrder;
        }
    }
}

/** 挂载在每个虚拟列表 item 根节点上，负责点击、长按和排序层处理 */
@ccclass('VScrollViewItem')
@menu('GCore/vScroll/VScrollViewItem')
export class VScrollViewItem extends Component {
    /** 当前 item 对应的数据索引 */
    public dataIndex: number = -1;

    /** 是否启用按下缩放反馈 */
    public useItemClickEffect: boolean = true;

    /** 点击回调（由 VirtualScrollView 注入） */
    public onClickCallback: ((index: number) => void) | null = null;

    /** 长按回调（由 VirtualScrollView 注入） */
    public onLongPressCallback: ((index: number) => void) | null = null;

    /** 长按触发时长（秒） */
    public longPressTime: number = 0.6;

    /** 当前触摸开始时命中的节点 */
    private _touchStartNode: Node | null = null;
    /** 当前触摸是否已因滑动或取消事件失效 */
    private _isCanceled: boolean = false;
    /** 触摸开始时的屏幕坐标 */
    private _startPos: Vec2 = new Vec2();
    /** 超过该距离后判定为滑动并取消点击 */
    private _moveThreshold: number = 40;
    /** 点击允许的最大移动距离 */
    private _clickThreshold: number = 10;
    /** 当前长按累计计时 */
    private _longPressTimer: number = 0;
    /** 本次触摸是否已经触发长按 */
    private _isLongPressed: boolean = false;

    /**************** [生命周期]  ****************/

    /** 注册 item 触摸事件 */
    onLoad() {
        // 一次性注册事件，生命周期内不变
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    }

    /** 预留 start 生命周期 */
    protected start(): void {
        // this.onSortLayer();
    }

    /** 解绑 item 触摸事件 */
    onDestroy() {
        // 清理事件
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    }

    /**************** [公共方法]  ****************/

    /** 将所有子节点的 Label 组件设置为独立排序，避免交错断合批 */
    public onSortLayer() {
        let orderNumber = 1;
        const labels = this.node.getComponentsInChildren(Label);
        for (let i = 0; i < labels.length; i++) {
            changeUISortingLayer(labels[i].node, 0, orderNumber);
            orderNumber++;
        }
    }

    /** 关闭渲染分层 */
    public offSortLayer() {
        const labels = this.node.getComponentsInChildren(Label);
        for (let i = 0; i < labels.length; i++) {
            const sort2d = labels[i].node.getComponent(Sorting2D);
            if (sort2d) sort2d.enabled = false;
        }
    }

    /** 更新当前 item 对应的数据索引
     * @param index 数据索引
     */
    public setDataIndex(index: number) {
        this.dataIndex = index;
    }

    /**************** [内部触摸逻辑]  ****************/

    /** 累计长按时间并在达到阈值时触发长按
     * @param dt 帧间隔时间
     */
    protected update(dt: number): void {
        // 如果正在触摸且未取消，累加长按计时
        if (this._touchStartNode && !this._isCanceled && !this._isLongPressed) {
            this._longPressTimer += dt;
            if (this._longPressTimer >= this.longPressTime) {
                this._triggerLongPress();
            }
        }
    }

    /** 触发长按回调并恢复视觉状态 */
    private _triggerLongPress() {
        this._isLongPressed = true;
        if (this.onLongPressCallback) {
            this.onLongPressCallback(this.dataIndex);
        }
        // 触发长按后恢复缩放
        this._restoreScale();
    }

    /** 处理触摸开始事件
     * @param e 触摸事件
     */
    private _onTouchStart(e: EventTouch) {
        // console.log("_onTouchStart");
        this._touchStartNode = this.node;
        this._isCanceled = false;
        this._isLongPressed = false;
        this._longPressTimer = 0;
        e.getLocation(this._startPos);

        // 缩放反馈（假设第一个子节点是内容容器）
        if (this.useItemClickEffect && this.node.children.length > 0) {
            this.node.setScale(0.95, 0.95);
        }
    }

    /** 处理触摸移动事件，移动超过阈值时取消点击和长按
     * @param e 触摸事件
     */
    private _onTouchMove(e: EventTouch) {
        if (this._isCanceled) return;

        const movePos = e.getLocation();
        const dx = movePos.x - this._startPos.x;
        const dy = movePos.y - this._startPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 超过阈值认为是滑动，取消点击和长按
        if (dist > this._moveThreshold) {
            this._isCanceled = true;
            this._restoreScale();
            this._touchStartNode = null;
        }
    }

    /** 处理触摸结束事件，在未滑动且未长按时触发点击
     * @param e 触摸事件
     */
    private _onTouchEnd(e: EventTouch) {
        if (this._isCanceled) {
            this._reset();
            return;
        }

        // 如果已经触发了长按，不再触发点击
        if (this._isLongPressed) {
            this._reset();
            return;
        }

        this._restoreScale();

        const endPos = e.getLocation();
        const dx = endPos.x - this._startPos.x;
        const dy = endPos.y - this._startPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 移动距离小于阈值才算点击
        if (dist < this._clickThreshold && this._touchStartNode === this.node) {
            if (this.onClickCallback) {
                this.onClickCallback(this.dataIndex);
            }
        }

        this._reset();
    }

    /** 处理触摸取消事件
     * @param e 触摸事件
     */
    private _onTouchCancel(e: EventTouch) {
        this._restoreScale();
        this._reset();
    }

    /** 恢复 item 按下反馈缩放 */
    private _restoreScale() {
        if (this.useItemClickEffect && this.node.children.length > 0) {
            this.node.setScale(1.0, 1.0);
        }
    }

    /** 重置本次触摸过程的临时状态 */
    private _reset() {
        this._touchStartNode = null;
        this._isCanceled = false;
        this._longPressTimer = 0;
        this._isLongPressed = false;
    }
}
