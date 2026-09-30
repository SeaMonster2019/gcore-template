import { _decorator, CCBoolean, CCFloat, CCInteger, Component, instantiate, Node, Prefab } from 'cc';
import { EDITOR } from 'cc/env';
import { Pool } from "../../../../base/container";

const { ccclass, property, menu } = _decorator;

/** 预制体池化列表组件 - 结合对象池优化节点生成的批量预制体列表组件 */
@ccclass('PrefabPoolList')
@menu('GCore/Prefab/PrefabPoolList')
export class PrefabPoolList extends Component {

    @property({ type: Prefab, displayName: "预制体", tooltip: "要实例化的预制体" })
    private prefab: Prefab | null = null;

    @property({ type: Node, displayName: "父节点", tooltip: "实例化的父节点，为空则使用当前节点" })
    private parentNode: Node | null = null;

    @property({ displayName: "加载时实例化", tooltip: "是否在 onLoad 时自动实例化" })
    private instOnLoad: boolean = false;

    @property({ displayName: "初始数量", tooltip: "初始实例化的数量" })
    private num: number = 0;

    @property({ type: CCInteger, displayName: "最小缓存", tooltip: "最小缓存数量（启动时预热数量）" })
    private minCacheSize: number = 0;

    @property({ type: CCInteger, displayName: "最大缓存", tooltip: "最大缓存数量（硬上限）" })
    private maxCacheSize: number = 64;

    @property({ type: CCInteger, displayName: "批量扩容", tooltip: "池空时，单次扩容创建数量" })
    private growSize: number = 4;

    @property({ type: CCInteger, displayName: "动态冗余缓存", tooltip: "在当前活跃数量基础上额外保留的缓存数量" })
    private reserveCacheSize: number = 2;

    @property({ type: CCFloat, displayName: "峰值缓存比例", tooltip: "按近期峰值活跃数保留缓存的比例（0~1）" })
    private peakCacheRatio: number = 0.5;

    @property({ type: CCFloat, displayName: "峰值衰减速度", tooltip: "峰值衰减系数（0~1，越小衰减越快）" })
    private peakDecayRate: number = 0.9;

    @property({ type: CCBoolean, displayName: "预览", tooltip: "在编辑器中预览预制体" })
    private get preview(): boolean {
        return this._preview;
    }
    private set preview(value: boolean) {
        this._preview = value;
        if (!EDITOR) {
            return;
        }

        this.clearAll();
        if (this._preview) {
            this._updateNodes();
        }
    }
    private _preview: boolean = false;

    /** 当前处于活跃状态的节点列表 */
    private _instNodes: Node[] = [];
    /** 对象池 */
    private _pool: Pool<Node> | undefined;
    /** 近期活跃峰值（用于抑制频繁抖动） */
    private _recentPeakActive: number = 0;

    protected onLoad(): void {
        this._ensurePool();
        if (this.instOnLoad) {
            this._updateNodes();
        }
    }

    /** 确保对象池已初始化 */
    private _ensurePool(): void {
        if (this._pool) {
            return;
        }

        const minSize = Math.max(0, this.minCacheSize);
        const maxSize = Math.max(minSize, this.maxCacheSize);
        const grow = Math.max(1, this.growSize);

        this._pool = new Pool<Node>(() => this._instantiatePrefab(), {
            initSize: minSize,
            maxSize,
            growSize: grow,
        });
    }

    /** 实例化预制体（底层生成节点） */
    private _instantiatePrefab(): Node {
        if (!this.prefab) {
            console.error("[PrefabPoolList] prefab 未设置，已返回空节点");
            return new Node("PrefabPoolList-MissingPrefab");
        }

        const node = instantiate(this.prefab) as Node;
        node.active = false;
        return node;
    }

    /** 从池中获取节点 */
    private _getNode(): Node {
        this._ensurePool();
        const node = this._pool?.alloc() ?? this._instantiatePrefab();
        const parent = this._getParentNode();

        if (node.parent !== parent) {
            node.parent = parent;
        }
        node.active = true;
        return node;
    }

    /** 将节点回收至池中 */
    private _putNode(node: Node): void {
        if (!node || !node.isValid) {
            return;
        }

        this._decayPeak();

        // 禁用节点
        node.active = false;
        // 移出场景
        node.removeFromParent();

        const cacheTarget = this._getAdaptiveCacheTarget();
        const cachedSize = this._pool?.size() ?? 0;

        if (cachedSize >= cacheTarget || !this._pool) {
            // 超出自适应缓存目标或无池，直接销毁
            node.destroy();
            return;
        }

        this._pool.free(node);
    }

    /** 根据目标数量更新列表节点 */
    private _updateNodes(): void {
        if (!this.prefab) {
            console.warn("[PrefabPoolList] 预制体不存在");
            return;
        }

        const parent = this._getParentNode();
        if (!parent) {
            console.warn("[PrefabPoolList] 父节点不存在");
            return;
        }

        const currentCount = this._instNodes.length;
        const targetCount = Math.max(0, this.num);

        // 更新活跃峰值
        this._recentPeakActive = Math.max(this._recentPeakActive, targetCount);

        // 如果当前数量大于目标数量，回收多余节点
        if (currentCount > targetCount) {
            const removeCount = currentCount - targetCount;
            const nodesToRecycle = this._instNodes.splice(targetCount, removeCount);
            nodesToRecycle.forEach((node) => {
                this._putNode(node);
            });
            return;
        }

        // 如果当前数量小于目标数量，从对象池取出并添加节点
        const createCount = targetCount - currentCount;
        for (let i = 0; i < createCount; i++) {
            const node = this._getNode();
            this._instNodes.push(node);
        }
    }

    /** 计算动态缓存目标 */
    private _getAdaptiveCacheTarget(): number {
        const minSize = Math.max(0, this.minCacheSize);
        const maxSize = Math.max(minSize, this.maxCacheSize);
        const reserveSize = Math.max(0, this.reserveCacheSize);
        const peakRatio = Math.max(0, Math.min(1, this.peakCacheRatio));

        const activeCount = this._instNodes.length;
        const byActive = activeCount + reserveSize;
        const byPeak = Math.ceil(this._recentPeakActive * peakRatio);
        const target = Math.max(minSize, byActive, byPeak);

        return Math.min(target, maxSize);
    }

    /** 让峰值在负载下降时缓慢回落，避免缓存频繁抖动 */
    private _decayPeak(): void {
        const activeCount = this._instNodes.length;
        if (this._recentPeakActive <= activeCount) {
            return;
        }

        const decay = Math.max(0, Math.min(1, this.peakDecayRate));
        this._recentPeakActive = Math.max(
            activeCount,
            Math.floor(this._recentPeakActive * decay),
        );
    }

    // ==================== 公共方法 ====================

    /** 设置数量并更新实例 */
    public setCount(count: number): Node[] {
        this.num = count;
        this._updateNodes();
        return this._instNodes;
    }

    /** 获取预制体 */
    public getPrefab(): Prefab | null {
        return this.prefab;
    }

    /** 获取所有实例化的活跃节点 */
    public getNodes(): Node[] {
        return this._instNodes;
    }

    /** 获取所有实例化节点上的指定组件 */
    public getNodeComponents<T extends Component>(componentType: new () => T): T[] {
        const components: T[] = [];
        for (const node of this._instNodes) {
            const comp = node.getComponent(componentType);
            if (comp) {
                components.push(comp);
            }
        }
        return components;
    }

    /** 遍历所有实例化的节点 */
    public forEachNode(callback: (node: Node, index: number) => void): void {
        this._instNodes.forEach(callback);
    }

    /** 遍历所有实例化节点上的指定组件 */
    public forEachComp<T extends Component>(
        componentType: new () => T,
        callback: (component: T, index: number) => void
    ): void {
        this._instNodes.forEach((node, index) => {
            const comp = node.getComponent(componentType);
            if (comp) {
                callback(comp, index);
            }
        });
    }

    /** 清除所有活跃实例（回收至对象池） */
    public clearAll(): void {
        for (const node of this._instNodes) {
            this._putNode(node);
        }
        this._instNodes.length = 0;
    }

    /** 清空对象池中的所有空闲节点 */
    public clearPool(): void {
        if (!this._pool) {
            return;
        }
        while (this._pool.size() > 0) {
            const node = this._pool.alloc();
            node.destroy();
        }
        this._pool.clear();
    }

    /** 获取池中闲置节点数量 */
    public getFreePoolSize(): number {
        return this._pool?.size() ?? 0;
    }

    /** 销毁组件时释放所有关联节点 */
    protected onDestroy(): void {
        // 清理当前活跃节点
        for (const node of this._instNodes) {
            if (node && node.isValid) {
                node.destroy();
            }
        }
        this._instNodes.length = 0;
        this._recentPeakActive = 0;

        // 清理对象池中的空闲节点
        this.clearPool();
    }

    // ==================== 私有方法 ====================

    /** 获取父节点 */
    private _getParentNode(): Node {
        return this.parentNode || this.node;
    }

}
