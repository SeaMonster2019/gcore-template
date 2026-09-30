import { _decorator, CCFloat, Component, Node, Vec3 } from 'cc';
import { ActionScaleTo } from "../../action/tween-action";

const { ccclass, property, menu } = _decorator;

/** 放大缩小动作组件 */
@ccclass('ActionScaleToComp')
@menu(`GCore/Action/2d/ActionScaleToComp`)
export class ActionScaleToComp extends Component {

    @property({ type: Node, displayName: "目标节点", tooltip: "要执行动作的节点，为空则使用自身" })
    protected targetNode: Node | null = null;
    @property({ displayName: "目标缩放值", tooltip: "绝对缩放值，例如(1,1,1)表示原始大小，(2,2,1)表示X和Y放大2倍" })
    protected targetScale: Vec3 = new Vec3(1, 1, 1);
    @property({ type: CCFloat, displayName: "持续时间(秒)", min: 0, tooltip: "动作执行的持续时间" })
    protected duration: number = 0.3;
    @property({ type: Node, displayName: "显示节点", tooltip: "放大完成时显示，开始缩小时隐藏的节点（可选）" })
    protected displayNode: Node | null = null;

    // 私有变量
    private _scaleAction: { forth: () => void; back: () => void } | null = null;

    onLoad() {
        this.init();
    }

    /** 初始化 */
    private init() {
        const node = this.getTargetNode();
        if (!node) {
            console.warn("[ActionScaleToComp] 目标节点无效");
            return;
        }

        // 创建缩放动作
        this._scaleAction = ActionScaleTo(node, this.targetScale, this.duration, this.displayNode || undefined);
    }

    /** 获取目标节点 */
    private getTargetNode(): Node | null {
        return this.targetNode || this.node;
    }

    /** 向前缩放（缩放到目标大小，完成后显示 displayNode） */
    public forth() {
        if (!this._scaleAction) {
            this.init();
        }
        this._scaleAction?.forth();
    }

    /** 向后缩放（回到初始大小，开始时隐藏 displayNode） */
    public back() {
        if (!this._scaleAction) {
            this.init();
        }
        this._scaleAction?.back();
    }

}

