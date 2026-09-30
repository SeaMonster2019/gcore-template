import { Component, EventTouch, Node, UITransform, Vec3, _decorator, math } from "cc";
const { property, ccclass, menu } = _decorator;

/** 拖拽移动节点，并按判断节点边界限制移动范围。
 * 支持 X 轴与 Y 轴独立判断与滑动约束：
 * - 模式 A (移动节点尺寸 <= 判断节点尺寸)：移动节点被限制在判断节点内部，边缘不越界；
 * - 模式 B (移动节点尺寸 > 判断节点尺寸)：移动节点覆盖判断节点，边缘不露白。
 */
@ccclass('SlidingNode')
@menu('GCore/Operation/SlidingNode')
export class SlidingNode extends Component {

    /** 被拖拽移动的节点 */
    @property({ type: Node, displayName: '移动节点' })
    public moveNode: Node = null!;
    /** 用于判断边界约束的参考节点 */
    @property({ type: Node, displayName: '边界判断节点' })
    public judgeNode: Node = null!;
    /** 滑动时的移动比例系数 */
    @property({ displayName: '滑动比例' })
    public slideRatio: number = 1;

    /** 缩放档位列表 */
    private _gearList: number[] = [1];
    /** 当前选择的缩放档位索引 */
    private _selectGear: number = 0;

    /** 临时位置向量 */
    private _tempPos: Vec3 = new Vec3();
    /** 移动回调 */
    private _moveCallback?: (moveNode: Node, judgeNode: Node) => void;

    /** 设置移动回调
     * @param callback 移动回调
     */
    public setMoveCallback(callback?: (moveNode: Node, judgeNode: Node) => void): void {
        this._moveCallback = callback;
    }

    /****************  生命周期回调  ****************/

    protected onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    /****************  触摸事件处理  ****************/

    /** 触摸开始：独立修正 X 轴和 Y 轴的边界约束位置 */
    private _onTouchStart(event: EventTouch): void {
        this.clampPosition();
    }

    /** 处理触摸移动事件：X 轴与 Y 轴完全独立计算约束并更新位置（将 UI 触摸增量精确转换至父节点本地空间） */
    private _onTouchMove(event: EventTouch): void {
        if (!this.moveNode || !this.judgeNode || !this.moveNode.parent) return;

        const moveUITrans = this.moveNode.getComponent(UITransform);
        const judgeUITrans = this.judgeNode.getComponent(UITransform);
        const parentNode = this.moveNode.parent;
        const parentUITrans = parentNode.getComponent(UITransform);

        if (!moveUITrans || !judgeUITrans || !parentUITrans) return;

        const curLoc = event.getUILocation();
        let uiDeltaX = 0;
        let uiDeltaY = 0;

        if (typeof (event as any).getUIDelta === 'function') {
            const uiDelta = (event as any).getUIDelta();
            uiDeltaX = uiDelta.x;
            uiDeltaY = uiDelta.y;
        } else {
            const delta = event.getDelta();
            uiDeltaX = delta.x;
            uiDeltaY = delta.y;
        }

        const tempVec3 = new Vec3(curLoc.x, curLoc.y, 0);
        const curLocal = parentUITrans.convertToNodeSpaceAR(tempVec3);

        tempVec3.set(curLoc.x - uiDeltaX, curLoc.y - uiDeltaY, 0);
        const prevLocal = parentUITrans.convertToNodeSpaceAR(tempVec3);

        const deltaX = curLocal.x - prevLocal.x;
        const deltaY = curLocal.y - prevLocal.y;

        this._tempPos.set(this.moveNode.position);

        const targetX = this._tempPos.x + deltaX * this.slideRatio;
        const targetY = this._tempPos.y + deltaY * this.slideRatio;

        const constrainedPos = this._calculateIndependentConstrainedPosition(
            targetX,
            targetY,
            moveUITrans,
            judgeUITrans,
            parentNode,
            parentUITrans
        );

        this.moveNode.setPosition(constrainedPos);
        this._moveCallback?.(this.moveNode, this.judgeNode);
    }

    /****************  公共 API 方法  ****************/

    /** 重新校验并限制 moveNode 的当前位置（分别对 X 轴和 Y 轴独立校验） */
    public clampPosition(): void {
        if (!this.moveNode || !this.judgeNode || !this.moveNode.parent) return;

        const moveUITrans = this.moveNode.getComponent(UITransform);
        const judgeUITrans = this.judgeNode.getComponent(UITransform);
        const parentNode = this.moveNode.parent;
        const parentUITrans = parentNode.getComponent(UITransform);

        if (!moveUITrans || !judgeUITrans || !parentUITrans) return;

        this._tempPos.set(this.moveNode.position);
        const constrainedPos = this._calculateIndependentConstrainedPosition(
            this._tempPos.x,
            this._tempPos.y,
            moveUITrans,
            judgeUITrans,
            parentNode,
            parentUITrans
        );

        this.moveNode.setPosition(constrainedPos);
    }

    /** 配置缩放档位列表及默认选中的档位索引（或传入目标索引）
     * @param gearListOrIndex 缩放档位数组 number[]，或要切换的档位索引 number
     * @param defaultIndex 默认选中的档位索引（当第一个参数为数组时生效，默认 0）
     */
    public setScaleGear(gearListOrIndex: number[] | number = [1], defaultIndex: number = 0): void {
        if (typeof gearListOrIndex === 'number') {
            this.setScaleGearIndex(gearListOrIndex);
            return;
        }

        const gearList = (Array.isArray(gearListOrIndex) && gearListOrIndex.length > 0) ? gearListOrIndex : [1];
        this._gearList = gearList;
        this.setScaleGearIndex(defaultIndex);
    }

    /** 切换到指定索引的缩放档位
     * @param index 档位索引
     */
    public setScaleGearIndex(index: number): void {
        if (!this._gearList || this._gearList.length === 0) {
            this._gearList = [1];
        }

        this._selectGear = math.clamp(index, 0, this._gearList.length - 1);
        const scale = this._gearList[this._selectGear] ?? 1;

        if (this.moveNode) {
            this.moveNode.setScale(scale, scale, this.moveNode.scale.z);
            this.clampPosition();
            this._moveCallback?.(this.moveNode, this.judgeNode);
        }
    }

    /** 增加一个缩放档位（档位索引 +1） */
    public incScaleGear(): void {
        this.setScaleGearIndex(this._selectGear + 1);
    }

    /** 减少一个缩放档位（档位索引 -1） */
    public decScaleGear(): void {
        this.setScaleGearIndex(this._selectGear - 1);
    }

    /** 获取当前选中的缩放档位 */
    public getScaleGear(): number {
        return this._selectGear;
    }

    /****************  辅助计算方法  ****************/

    /** 完全独立地计算 X 轴与 Y 轴的坐标约束 */
    private _calculateIndependentConstrainedPosition(
        targetX: number,
        targetY: number,
        moveUITrans: UITransform,
        judgeUITrans: UITransform,
        parentNode: Node,
        parentUITrans: UITransform
    ): Vec3 {
        // 1. 获取 judgeNode 在 moveNode 父节点本地空间中的精确边界 [jMin, jMax]
        const { minX: jMinX, maxX: jMaxX, minY: jMinY, maxY: jMaxY } = this._getJudgeNodeBoundsInParentSpace(
            this.judgeNode,
            judgeUITrans,
            parentNode,
            parentUITrans
        );

        const jSizeX = Math.max(0, jMaxX - jMinX);
        const jSizeY = Math.max(0, jMaxY - jMinY);

        // 2. 获取 moveNode 在父节点本地空间中的实际尺寸与锚点偏移
        const scaleX = Math.abs(this.moveNode.scale.x);
        const scaleY = Math.abs(this.moveNode.scale.y);

        const mSizeX = moveUITrans.width * scaleX;
        const mSizeY = moveUITrans.height * scaleY;

        const anchorOffsetMinX = mSizeX * moveUITrans.anchorX;
        const anchorOffsetMaxX = mSizeX * (1 - moveUITrans.anchorX);
        const anchorOffsetMinY = mSizeY * moveUITrans.anchorY;
        const anchorOffsetMaxY = mSizeY * (1 - moveUITrans.anchorY);

        // 3. X 轴独立判断与限制
        const clampedX = this._clampSingleAxis(
            targetX,
            mSizeX,
            jSizeX,
            jMinX,
            jMaxX,
            anchorOffsetMinX,
            anchorOffsetMaxX
        );

        // 4. Y 轴独立判断与限制
        const clampedY = this._clampSingleAxis(
            targetY,
            mSizeY,
            jSizeY,
            jMinY,
            jMaxY,
            anchorOffsetMinY,
            anchorOffsetMaxY
        );

        this._tempPos.set(clampedX, clampedY, this._tempPos.z);
        return this._tempPos;
    }

    /** 计算 judgeNode 在 parentNode 本地空间中的坐标边界 */
    private _getJudgeNodeBoundsInParentSpace(
        judgeNode: Node,
        judgeUITrans: UITransform,
        parentNode: Node,
        parentUITrans: UITransform
    ): { minX: number; maxX: number; minY: number; maxY: number } {
        if (parentNode === judgeNode) {
            const w = judgeUITrans.width;
            const h = judgeUITrans.height;
            const ax = judgeUITrans.anchorX;
            const ay = judgeUITrans.anchorY;
            return {
                minX: -w * ax,
                maxX: w * (1 - ax),
                minY: -h * ay,
                maxY: h * (1 - ay)
            };
        }

        const w = judgeUITrans.width;
        const h = judgeUITrans.height;
        const ax = judgeUITrans.anchorX;
        const ay = judgeUITrans.anchorY;

        const localCorners = [
            new Vec3(-w * ax, -h * ay, 0),
            new Vec3(w * (1 - ax), -h * ay, 0),
            new Vec3(w * (1 - ax), h * (1 - ay), 0),
            new Vec3(-w * ax, h * (1 - ay), 0),
        ];

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const tempWorld = new Vec3();

        for (const corner of localCorners) {
            judgeUITrans.convertToWorldSpaceAR(corner, tempWorld);
            const parentLocal = parentUITrans.convertToNodeSpaceAR(tempWorld);

            if (parentLocal.x < minX) minX = parentLocal.x;
            if (parentLocal.x > maxX) maxX = parentLocal.x;
            if (parentLocal.y < minY) minY = parentLocal.y;
            if (parentLocal.y > maxY) maxY = parentLocal.y;
        }

        return { minX, maxX, minY, maxY };
    }

    /** 单轴独立约束计算
     * @param target 目标轴坐标
     * @param mSize 移动节点在此轴的实际尺寸
     * @param jSize 判断节点在此轴的实际尺寸
     * @param jMin 判断节点在此轴的最小边界
     * @param jMax 判断节点在此轴的最大边界
     * @param anchorOffsetMin 锚点到最小边界距离
     * @param anchorOffsetMax 锚点到最大边界距离
     */
    private _clampSingleAxis(
        target: number,
        mSize: number,
        jSize: number,
        jMin: number,
        jMax: number,
        anchorOffsetMin: number,
        anchorOffsetMax: number
    ): number {
        let minLimit: number;
        let maxLimit: number;

        if (mSize <= jSize) {
            // 模式 A: 移动节点尺寸 <= 判断节点尺寸 (内部限制，边缘不越界)
            minLimit = jMin + anchorOffsetMin;
            maxLimit = jMax - anchorOffsetMax;
        } else {
            // 模式 B: 移动节点尺寸 > 判断节点尺寸 (覆盖限制，边缘不露白)
            minLimit = jMax - anchorOffsetMax;
            maxLimit = jMin + anchorOffsetMin;
        }

        const low = Math.min(minLimit, maxLimit);
        const high = Math.max(minLimit, maxLimit);

        return math.clamp(target, low, high);
    }
}