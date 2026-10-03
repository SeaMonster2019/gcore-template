import { Color, instantiate, Label, Node, Prefab, tween, UIOpacity, Vec3 } from "cc";
import { Pool } from "db://gcore-framework/scripts/base/container";

/** 提示操作类 */
export class TipsOps {

    /** 轻提示根节点 */
    private _toastRoot: Node | undefined;
    /** 轻提示预制体 */
    private _toastPrefab: Prefab | undefined;
    /** 当前显示中的轻提示 */
    private _activeToasts: Node[] = [];
    /** 正在回收的轻提示 */
    private _recyclingToasts: Set<Node> = new Set();
    /** 轻提示动画令牌 */
    private _toastTokens: WeakMap<Node, number> = new WeakMap();
    /** 轻提示动画令牌自增值 */
    private _toastTokenSeed: number = 0;
    /** 轻提示对象池 */
    private _toastPool: Pool<Node> = new Pool(() => {
        if (!this._toastPrefab?.isValid) {
            throw new Error("轻提示预制体不存在");
        }
        return instantiate(this._toastPrefab);
    });

    /** 初始化
     * @param toastRoot 轻提示挂载根节点
     * @param toastPrefab 轻提示预制体
     */
    public init(toastRoot?: Node, toastPrefab?: Prefab): void {
        this.clearAllToasts();
        this._toastRoot = toastRoot;
        this._toastPrefab = toastPrefab;
    }

    /** 弹出轻提示
     * @param text 提示文本
     * @param color 颜色 Hex 或 rgba
     */
    public showToast(text: string, color: string = "#ffffff"): void {
        if (!this._toastRoot?.isValid || !this._toastPrefab?.isValid) {
            console.warn("[TipsOps] showToast 提示: toastRoot 或 toastPrefab 未就绪, 内容:", text);
            return;
        }

        const toastNode = this._toastPool.alloc();
        const token = ++this._toastTokenSeed;
        this._toastTokens.set(toastNode, token);
        this._recyclingToasts.delete(toastNode);

        const labelNode = toastNode.getChildByName("Label") || toastNode;
        const label = labelNode.getComponent(Label);
        if (label) {
            label.string = text;
            label.color = new Color().fromHEX(color);
        }

        let opacity = toastNode.getComponent(UIOpacity);
        if (!opacity) {
            opacity = toastNode.addComponent(UIOpacity);
        }
        opacity.opacity = 255;

        toastNode.parent = this._toastRoot;
        toastNode.setPosition(new Vec3(0, 0, 0));
        this._activeToasts.push(toastNode);

        tween(toastNode)
            .by(1.2, { position: new Vec3(0, 80, 0) })
            .call(() => {
                this._recycleToast(toastNode, token);
            })
            .start();
    }

    /** 回收 Toast 节点 */
    private _recycleToast(node: Node, token: number): void {
        if (this._toastTokens.get(node) !== token) {
            return;
        }
        if (this._recyclingToasts.has(node)) {
            return;
        }
        this._recyclingToasts.add(node);
        const idx = this._activeToasts.indexOf(node);
        if (idx !== -1) {
            this._activeToasts.splice(idx, 1);
        }
        node.removeFromParent();
        this._toastPool.free(node);
    }

    /** 清理所有 Toast */
    public clearAllToasts(): void {
        for (const node of this._activeToasts) {
            node.removeFromParent();
            this._toastPool.free(node);
        }
        this._activeToasts.length = 0;
        this._recyclingToasts.clear();
    }
}
