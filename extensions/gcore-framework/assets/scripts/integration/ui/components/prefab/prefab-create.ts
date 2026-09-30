import { _decorator, CCBoolean, Component, instantiate, Node, Prefab } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, property, menu } = _decorator;


@ccclass('PrefabCreator')
@menu(`GCore/Prefab/PrefabCreator`)
export class PrefabCreator extends Component {

    @property({ type: Prefab, displayName: `预制体`, tooltip: `可以实例化的预制体` })
    private prefab!: Prefab;

    @property({ type: Node, displayName: `父节点`, tooltip: `实例化时，将预制体添加到该节点下，如果为空，默认实例化到当前节点下` })
    private parentNode!: Node;

    @property({ displayName: `加载时实例化`, tooltip: `是否在onLoad时实例化` })
    private instOnLoad: boolean = false;

    @property({ type: CCBoolean, displayName: `预览`, tooltip: `预览预制体` })
    private get inst() {
        return this._preview;
    }
    private set inst(b: boolean) {

        this._preview = b;
        if (!EDITOR) {
            return;
        }

        this._clearInstNode();

        if (b) {
            this._instPrefab();
        }
    }
    private _preview: boolean = false;

    /** 实例化节点 */
    private _instNode: Node | null = null;

    /** 加载 */
    protected onLoad(): void {
        if (this.instOnLoad) {
            this._instPrefab();
        }
    }

    /** 实例化预制体 */
    private _instPrefab() {

        if (!this.prefab) {
            return;
        }

        const node = instantiate(this.prefab);
        if (this.parentNode) {
            this.parentNode.addChild(node);
        } else {
            this.node.addChild(node);
        }
        this._instNode = node;

    }

    /** 实例化 */
    public instantiate(): Node | null {
        this._instPrefab();
        return this._instNode;
    }

    /** 返回预制体 */
    public getPrefab(): Prefab {
        return this.prefab;
    }

    /** 返回实例化节点
     * @param bInst 是否实例化
     * @returns 
     */
    public getInstNode(): Node | null {
        return this._instNode;
    }

    /** 返回实例化节点的某个组件 */
    public getInstComp(compType: new () => Component): Component | null {
        if (!this._instNode) {
            return null;
        }
        return this._instNode.getComponent(compType);
    }

    /** 获取父节点 */
    private _getParentNode(): Node {
        if (this.parentNode) {
            return this.parentNode;
        }
        return this.node;
    }

    /** 清除实例化节点 */
    private _clearInstNode() {
        const parent = this._getParentNode();
        if (!parent) {
            return;
        }

        const prefabName = this.prefab.name;
        const node = parent.getChildByName(prefabName);
        if (node) {
            node.removeFromParent();
            node.destroy();
        }
        this._instNode = node;
    }

    /** 销毁 */
    public delete() {
        if (!this._instNode) {
            return;
        }
        this._instNode.destroy();
        this._instNode = null;
    }

}