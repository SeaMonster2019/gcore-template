import { _decorator, CCFloat, Component, Node, Vec3 } from 'cc';
import { ActionBackAndForth } from "../../action/tween-action";


const { ccclass, property, menu } = _decorator;

/** 来回动作组件 */
@ccclass('ActionBackAndForthComp')
@menu(`GCore/Action/2d/ActionBackAndForthComp`)
export class ActionBackAndForthComp extends Component {

    @property({ type: Node, displayName: "目标节点", tooltip: "要执行动作的节点，为空则使用自身" })
    targetNode: Node | null = null;
    @property({ displayName: "位移偏移量", tooltip: "相对于起始位置的偏移量，例如(50,50,0)表示向右移动50，向上移动50" })
    offset: Vec3 = new Vec3(0, 0, 0);
    @property({ type: CCFloat, displayName: "持续时间(秒)", min: 0, tooltip: "动作执行的持续时间" })
    duration: number = 1.0;

    // 私有变量
    private _backAndForth: { back: () => void; forth: () => void } | null = null;

    onLoad() {
        this.init();
    }

    /** 初始化 */
    private init() {
        const node = this.getTargetNode();
        if (!node) {
            console.warn("[ActionBackAndForthComp] 目标节点无效");
            return;
        }

        // 创建来回动作（使用相对位移）
        this._backAndForth = ActionBackAndForth(node, this.offset, this.duration);
    }

    /** 获取目标节点 */
    private getTargetNode(): Node | null {
        return this.targetNode || this.node;
    }

    /** 向前移动（偏移到目标位置） */
    public forth() {
        if (!this._backAndForth) {
            this.init();
        }
        this._backAndForth?.forth();
    }

    /** 向后移动（回到初始位置） */
    public back() {
        if (!this._backAndForth) {
            this.init();
        }
        this._backAndForth?.back();
    }

}

