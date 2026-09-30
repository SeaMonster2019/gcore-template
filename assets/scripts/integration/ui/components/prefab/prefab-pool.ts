import { _decorator, CCFloat, CCInteger, Component, instantiate, Node, Prefab } from "cc";
import { Pool } from "../../../../base/container";

const { ccclass, property, menu } = _decorator;

/** 预制体池 */
@ccclass("PrefabPool")
@menu("GCore/Prefab/PrefabPool")
export class PrefabPool extends Component {

    /** 预制体 */
    @property({ type: Prefab, tooltip: "预制体" })
    public prefab: Prefab | undefined;

    /** 父节点 */
    @property({ type: Node, tooltip: "父节点" })
    public parentNode: Node | undefined;

    /** 最小缓存数量 */
    @property({ type: CCInteger, tooltip: "最小缓存数量（启动时预热数量）" })
    private minCacheSize: number = 0;

    /** 最大缓存数量 */
    @property({ type: CCInteger, tooltip: "最大缓存数量（硬上限）" })
    private maxCacheSize: number = 64;

    /** 批量扩容数量 */
    @property({ type: CCInteger, tooltip: "池空时，单次扩容创建数量" })
    private growSize: number = 4;

    /** 动态冗余缓存 */
    @property({ type: CCInteger, tooltip: "在当前活跃数量基础上额外保留的缓存数量" })
    private reserveCacheSize: number = 2;

    /** 峰值缓存比例 */
    @property({ type: CCFloat, tooltip: "按近期峰值活跃数保留缓存的比例（0~1）" })
    private peakCacheRatio: number = 0.5;

    /** 峰值衰减速度 */
    @property({ type: CCFloat, tooltip: "峰值衰减系数（0~1，越小衰减越快）" })
    private peakDecayRate: number = 0.9;

    /** 池 */
    private _pool: Pool<Node> | undefined;
    /** 已借出节点集合，用于防止重复归还 */
    private _borrowedNodes: Set<Node> = new Set();
    /** 当前活跃节点数 */
    private _activeCount: number = 0;
    /** 近期活跃峰值（用于抑制频繁抖动） */
    private _recentPeakActive: number = 0;

    /** 加载 */
    protected onLoad(): void {
        const minSize = Math.max(0, this.minCacheSize);
        const maxSize = Math.max(minSize, this.maxCacheSize);
        const grow = Math.max(1, this.growSize);

        this._activeCount = 0;
        this._recentPeakActive = 0;
        this._borrowedNodes.clear();

        this._pool = new Pool<Node>(() => this._instantiatePrefab(), {
            initSize: minSize,
            maxSize,
            growSize: grow,
        });
    }

    /** 获取节点 (从池中取用) */
    public getNode(): Node {
        const node = this._pool?.alloc() ?? this._instantiatePrefab();

        if (this.parentNode && node.parent !== this.parentNode) {
            node.parent = this.parentNode;
        }
        node.active = true;

        this._borrowedNodes.add(node);
        this._activeCount = this._borrowedNodes.size;
        this._recentPeakActive = Math.max(this._recentPeakActive, this._activeCount);
        return node;
    }

    /** 获取多个节点 */
    public getNodes(count: number): Node[] {
        const nodes: Node[] = [];
        for (let i = 0; i < count; i++) {
            nodes.push(this.getNode());
        }
        return nodes;
    }

    /** 归还节点 (回收到池) */
    public putNode(node: Node): void {
        if (!node || !node.isValid) {
            return;
        }

        const hadBorrowed = this._borrowedNodes.delete(node);
        if (!hadBorrowed) {
            // 外部误归还或重复归还：不更新活跃计数，仍执行回收流程兜底
            console.warn("[PrefabPool] putNode 收到未借出节点，已按兜底流程处理");
        }

        this._activeCount = this._borrowedNodes.size;
        this._decayPeak();

        // 禁用节点
        node.active = false;
        // 移出场景
        node.removeFromParent();

        const cacheTarget = this._getAdaptiveCacheTarget();
        const cachedSize = this._pool?.size() ?? 0;
        if (cachedSize >= cacheTarget) {
            // 超出自适应缓存目标，直接销毁
            node.destroy();
            return;
        }

        if (!this._pool) {
            node.destroy();
            return;
        }

        this._pool.free(node);
    }

    /** 销毁时清空池内节点 */
    protected onDestroy(): void {
        this._borrowedNodes.forEach((node) => {
            if (node && node.isValid) {
                node.destroy();
            }
        });
        this._borrowedNodes.clear();
        this._activeCount = 0;
        this._recentPeakActive = 0;

        if (!this._pool) {
            return;
        }

        while (this._pool.size() > 0) {
            const node = this._pool.alloc();
            node.destroy();
        }
        this._pool.clear();
    }

    /** 实例化预制体 */
    private _instantiatePrefab(): Node {
        if (!this.prefab) {
            console.error("[PrefabPool] prefab 未设置，已返回空节点");
            return new Node("PrefabPool-MissingPrefab");
        }

        const node = instantiate(this.prefab) as Node;
        // 仅在 getNode 时挂载到父节点，避免池内空闲节点出现在场景树中。
        node.active = false;
        return node;
    }

    /** 计算动态缓存目标 */
    private _getAdaptiveCacheTarget(): number {
        const minSize = Math.max(0, this.minCacheSize);
        const maxSize = Math.max(minSize, this.maxCacheSize);
        const reserveSize = Math.max(0, this.reserveCacheSize);
        const peakRatio = Math.max(0, Math.min(1, this.peakCacheRatio));

        const byActive = this._activeCount + reserveSize;
        const byPeak = Math.ceil(this._recentPeakActive * peakRatio);
        const target = Math.max(minSize, byActive, byPeak);

        return Math.min(target, maxSize);
    }

    /** 让峰值在负载下降时缓慢回落，避免缓存频繁抖动 */
    private _decayPeak(): void {
        if (this._recentPeakActive <= this._activeCount) {
            return;
        }

        const decay = Math.max(0, Math.min(1, this.peakDecayRate));
        this._recentPeakActive = Math.max(
            this._activeCount,
            Math.floor(this._recentPeakActive * decay),
        );
    }

}
