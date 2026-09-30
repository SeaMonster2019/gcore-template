import { Rect, UITransform, Vec3 } from 'cc';

/** UI 工具类，提供节点坐标转换、包围盒处理等 UI 相关辅助方法 */
export class UIUtil {
    /**
     * 获取世界矩形在指定 UITransform 节点空间下的局部矩形。
     * 自动处理锚点转换，返回的 Rect 坐标是以节点左下角为 (0,0) 的局部坐标。
     * @param uiTrans 目标节点的 UITransform
     * @param worldRect 世界空间下的矩形
     * @param paddingX 额外的横向内边距（通常用于扩大查询范围）
     * @param paddingY 额外的纵向内边距
     */
    public static worldRectToLocal(uiTrans: UITransform, worldRect: Rect, paddingX: number = 0, paddingY: number = 0): Rect {
        const anchorOffX = uiTrans.anchorX * uiTrans.width;
        const anchorOffY = uiTrans.anchorY * uiTrans.height;

        const tempPos1 = new Vec3(worldRect.xMin - paddingX, worldRect.yMin - paddingY, 0);
        const tempPos2 = new Vec3(worldRect.xMax + paddingX, worldRect.yMax + paddingY, 0);

        const localMin = uiTrans.convertToNodeSpaceAR(tempPos1);
        const localMax = uiTrans.convertToNodeSpaceAR(tempPos2);

        return new Rect(
            Math.min(localMin.x, localMax.x) + anchorOffX,
            Math.min(localMin.y, localMax.y) + anchorOffY,
            Math.abs(localMax.x - localMin.x),
            Math.abs(localMax.y - localMin.y)
        );
    }
}
