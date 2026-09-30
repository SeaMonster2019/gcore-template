import { Rect, Vec2 } from 'cc';

/** 表示二维无限延伸的直线；线性方程 y = a * x + b */
export class Line2D {

    /** 斜率 a */
    public a: number;

    /** 截距 b */
    public b: number;

    /** 使用斜率和截距构造直线对象
     * @param a 斜率
     * @param b 截距
     */
    public constructor(a: number, b: number) {
        this.a = a;
        this.b = b;
    }

    /********************************************  静态构造方法  ********************************************/

    /** 由两点构造直线方程
     * @param p1 第一点坐标
     * @param p2 第二点坐标
     * @returns Line2D 实例；当两点 x 相同（垂直线）时返回 null
     */
    public static fromPoints(p1: { x: number, y: number }, p2: { x: number, y: number }): Line2D | null {
        // 两点 x 相同则斜率不存在（垂直线），返回 null 由调用者决定如何处理
        if (p1.x === p2.x) {
            return null;
        }
        const a = (p2.y - p1.y) / (p2.x - p1.x);
        const b = p1.y - a * p1.x;
        return new Line2D(a, b);
    }

    /********************************************  计算方法  ********************************************/

    /** 根据 x 值计算对应的 y 值
     * @param x 自变量 x
     * @returns 对应的 y = a * x + b
     */
    public getY(x: number): number {
        return this.a * x + this.b;
    }
}

/** 数学工具类，提供包围盒、数值计算等纯数学辅助方法 */
export class MathUtil {

    /********************************************  矩形相交检测方法  ********************************************/

    /** 判断两个矩形是否相交 (AABB)
     * @param a 矩形 A
     * @param b 矩形 B
     * @returns 是否相交
     */
    public static intersects(a: Rect, b: Rect): boolean {
        // 若任意一侧分离则不相交
        return !(
            a.xMax < b.xMin ||
            a.xMin > b.xMax ||
            a.yMax < b.yMin ||
            a.yMin > b.yMax
        );
    }

    /********************************************  点与矩形检测方法  ********************************************/

    /** 判断带半宽高的点（以 center 为中心的包围盒）是否与矩形相交
     * @param point 点坐标（通常为中心点）
     * @param halfW 半宽
     * @param halfH 半高
     * @param rect 目标矩形
     * @returns 是否相交
     */
    public static isPointInRect(point: { x: number, y: number }, halfW: number, halfH: number, rect: Rect): boolean {
        // 计算点对应的包围盒并做 AABB 分离轴判定
        return !(
            point.x + halfW < rect.xMin ||
            point.x - halfW > rect.xMax ||
            point.y + halfH < rect.yMin ||
            point.y - halfH > rect.yMax
        );
    }

    /********************************************  多边形计算方法  ********************************************/

    /** 计算多边形的包围盒
     * @param points 多边形顶点数组
     * @returns 包围盒边界值 { minX, minY, maxX, maxY }
     */
    public static getPolygonBounds(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }

        return { minX, minY, maxX, maxY };
    }

    /** 判断点是否在多边形内部（射线法）
     * @param point 待检测的点
     * @param points 多边形顶点数组
     * @returns 点是否在多边形内部
     */
    public static isPointInPolygon(point: Vec2, points: Vec2[]): boolean {
        let inside = false;
        const x = point.x;
        const y = point.y;
        const len = points.length;

        for (let i = 0, j = len - 1; i < len; j = i++) {
            const xi = points[i].x;
            const yi = points[i].y;
            const xj = points[j].x;
            const yj = points[j].y;

            // 射线法：判断点是否在多边形边的交叉点
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) {
                inside = !inside;
            }
        }

        return inside;
    }
}