import { Button, EventTouch, PolygonCollider2D, UITransform, Vec2, Vec3, _decorator } from "cc";
import { MathUtil } from "../../../../base/math";
const { property, ccclass, menu, requireComponent } = _decorator;


/** 多边形不规则按钮点击组件
 * 依赖 PolygonCollider2D 组件定义点击有效区域
 * 通过扩展 UITransform 的 contentSize 来覆盖多边形区域，不修改节点位置
 */
@ccclass("PolygonBtn")
@menu("GCore/Button/PolygonBtn")
@requireComponent(PolygonCollider2D)
export class PolygonBtn extends Button {

    /** 多边形碰撞体组件 */
    @property({ type: PolygonCollider2D, displayName: "多边形组件", tooltip: "多边形碰撞体组件，用于判定点击响应区域" })
    public polygon: PolygonCollider2D | null = null;

    /** 触摸点本地坐标缓存 */
    protected _localPoint = new Vec2();

    /** 触摸点世界坐标缓存 */
    protected _touchPos = new Vec3();

    /**************** 生命周期  ****************/

    /** 组件加载时初始化 */
    override onLoad(): void {
        super.onLoad?.();
        if (!this.polygon) {
            this.polygon = this.getComponent(PolygonCollider2D);
        }
        this._updateHitArea();
    }

    /** 组件启用时更新点击区域 */
    override onEnable(): void {
        super.onEnable?.();
        this._updateHitArea();
    }

    /**************** 私有方法  ****************/

    /** 根据多边形碰撞体的包围盒更新 UITransform 的点击区域 */
    protected _updateHitArea(): void {
        if (!this.polygon || this.polygon.points.length === 0) {
            return;
        }

        const uiTrans = this.node.getComponent(UITransform);
        if (!uiTrans) {
            return;
        }

        // 计算多边形的包围盒
        const { minX, minY, maxX, maxY } = MathUtil.getPolygonBounds(this.polygon.points);

        // 计算需要覆盖多边形的新 contentSize，保持节点位置不变
        const newMinX = Math.min(0, minX);
        const newMinY = Math.min(0, minY);
        const newMaxX = Math.max(0, maxX);
        const newMaxY = Math.max(0, maxY);

        const newWidth = newMaxX - newMinX;
        const newHeight = newMaxY - newMinY;

        // 更新 contentSize
        uiTrans.setContentSize(newWidth, newHeight);

        // 调整锚点，使节点位置不变
        const newAnchorX = (0 - newMinX) / newWidth;
        const newAnchorY = (0 - newMinY) / newHeight;
        uiTrans.setAnchorPoint(newAnchorX, newAnchorY);
    }

    /** 点击事件处理 */
    override _onTouchBegan(event?: EventTouch): void {
        if (!event) {
            return;
        }

        if (!this.polygon || this.polygon.points.length === 0) {
            super._onTouchBegan(event);
            return;
        }

        const uiTrans = this.node.getComponent(UITransform);
        if (!uiTrans) {
            super._onTouchBegan(event);
            return;
        }

        // 将触摸坐标转换为节点本地坐标
        const touchPos = event.getUILocation();
        uiTrans.convertToNodeSpaceAR(new Vec3(touchPos.x, touchPos.y, 0), this._touchPos);
        this._localPoint.set(this._touchPos.x, this._touchPos.y);

        // 判断触摸点是否在多边形内
        if (MathUtil.isPointInPolygon(this._localPoint, this.polygon.points)) {
            super._onTouchBegan(event);
        } else {
            // 触摸点不在多边形内时，阻止事件被吞噬，让事件穿透到下层节点
            event.preventSwallow = true;
        }
    }

    /** 触摸结束事件处理 */
    override _onTouchEnded(event?: EventTouch): void {
        if (!event) {
            return;
        }

        if (!this.polygon || this.polygon.points.length === 0) {
            super._onTouchEnded(event);
            return;
        }

        const uiTrans = this.node.getComponent(UITransform);
        if (!uiTrans) {
            super._onTouchEnded(event);
            return;
        }

        // 将触摸坐标转换为节点本地坐标
        const touchPos = event.getUILocation();
        uiTrans.convertToNodeSpaceAR(new Vec3(touchPos.x, touchPos.y, 0), this._touchPos);
        this._localPoint.set(this._touchPos.x, this._touchPos.y);

        // 判断触摸点是否在多边形内
        if (MathUtil.isPointInPolygon(this._localPoint, this.polygon.points)) {
            super._onTouchEnded(event);
        } else {
            // 触摸点不在多边形内时，阻止事件被吞噬，让事件穿透到下层节点
            event.preventSwallow = true;
        }
    }

    /** 触摸取消事件处理 */
    override _onTouchCancel(event?: EventTouch): void {
        if (!event) {
            return;
        }

        if (!this.polygon || this.polygon.points.length === 0) {
            super._onTouchCancel(event);
            return;
        }

        // 触摸取消时，阻止事件被吞噬
        event.preventSwallow = true;
    }
}