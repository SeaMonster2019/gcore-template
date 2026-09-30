import { _decorator, CCBoolean, Component, instantiate, Node, Prefab } from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, menu } = _decorator;

/** 预制体列表组件 - 批量管理预制体实例 */
@ccclass('PrefabList')
@menu('GCore/Prefab/PrefabList')
export class PrefabList extends Component {

    @property({ type: Prefab, displayName: "预制体", tooltip: "要实例化的预制体" })
    private prefab: Prefab | null = null;

    @property({ type: Node, displayName: "父节点", tooltip: "实例化的父节点，为空则使用当前节点" })
    private parentNode: Node | null = null;

    @property({ displayName: "加载时实例化", tooltip: "是否在 onLoad 时自动实例化" })
    private instOnLoad: boolean = false;

    @property({ displayName: "初始数量", tooltip: "初始实例化的数量" })
    private num: number = 0;

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
            this._instantiatePrefabs();
        }
    }
    private _preview: boolean = false;

    /** 实例化的节点列表 */
    private _instNodes: Node[] = [];

    onLoad(): void {
        if (this.instOnLoad) {
            this._instantiatePrefabs();
        }
    }

    /** 实例化预制体（根据数量调整） */
    private _instantiatePrefabs(): void {
        if (!this.prefab) {
            console.warn("[PrefabList] 预制体不存在");
            return;
        }

        const parent = this._getParentNode();
        if (!parent) {
            console.warn("[PrefabList] 父节点不存在");
            return;
        }

        const currentCount = this._instNodes.length;
        const targetCount = this.num;

        // 如果当前数量大于目标数量，移除多余的节点
        if (currentCount > targetCount) {
            const removeCount = currentCount - targetCount;
            const nodesToRemove = this._instNodes.splice(targetCount, removeCount);
            nodesToRemove.forEach((node) => {
                node.removeFromParent();
                node.destroy();
            });
            return;
        }

        // 如果当前数量小于目标数量，创建新节点
        const createCount = targetCount - currentCount;
        for (let i = 0; i < createCount; i++) {
            const node = instantiate(this.prefab);
            parent.addChild(node);
            this._instNodes.push(node);
        }
    }

    // ==================== 公共方法 ====================

    /** 设置数量并更新实例 */
    public setCount(count: number): Node[] {
        this.num = count;
        this._instantiatePrefabs();
        return this._instNodes;
    }

    /** 获取预制体 */
    public getPrefab(): Prefab | null {
        return this.prefab;
    }

    /** 获取所有实例化的节点 */
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

    /** 清除所有实例 */
    public clearAll(): void {
        for (const node of this._instNodes) {
            if (node.isValid) {
                node.removeFromParent();
                node.destroy();
            }
        }
        this._instNodes.length = 0;
    }

    // ==================== 私有方法 ====================

    /** 获取父节点 */
    private _getParentNode(): Node {
        return this.parentNode || this.node;
    }

}
