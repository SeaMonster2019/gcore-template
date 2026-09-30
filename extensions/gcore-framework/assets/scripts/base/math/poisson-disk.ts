import { Vec2,Rect} from "cc";
import { Line2D } from "./math";

/** Bridson 算法的单点邻域尝试次数 */
const BRIDSON_K = 30;
/** 圆周率的两倍 */
const TWO_PI = Math.PI * 2;
/** 浮点比较容差 */
const EPSILON = 1e-6;

/** 泊松盘采样工具 */
export class PoissonDisk {

    /****************  对外采样入口  ****************/

    /** 泊松盘采样（Bridson 算法/多边形），兼容多种签名 */
    public static PoissonDiskSampling(random: () => number, target: Rect | Line2D[], arg3: number, arg4?: number): Vec2[] {
        if (Array.isArray(target)) {
            if (typeof arg4 !== "number") {
                return [];
            }
            return this.poissonDiskSamplingLines(random, target, arg3, arg4);
        }

        if (typeof arg4 === "number") {
            return this.takeRandomSubset(this.poissonDiskSamplingRect(random, target, arg4), arg3, random);
        }

        return this.poissonDiskSamplingRect(random, target, arg3);
    }

    /** 矩形区域高密度泊松盘采样，内部自动估算点数上限并尽量多生成点
     * @param rect 矩形区域
     * @param minDistance 点之间的最小距离
     * @returns 采样得到的点集合
     */
    public static PoissonDiskSamplingDense(random: () => number, rect: Rect, minDistance: number): Vec2[] {
        const numberOfPoints = this.estimateRectPointCount(rect, minDistance);
        let bestPoints: Vec2[] = [];
        const retryCount = Math.max(2, Math.min(6, Math.ceil(numberOfPoints / 64)));

        for (let i = 0; i < retryCount; i++) {
            const points = this.PoissonDiskSampling(random, rect, numberOfPoints, minDistance);
            if (points.length > bestPoints.length) {
                bestPoints = points;
            }

            if (bestPoints.length >= numberOfPoints) {
                break;
            }
        }

        return bestPoints;
    }

    /****************  矩形与多边形采样  ****************/

    /** 在矩形区域内执行泊松盘采样
     * @param rect 矩形区域
     * @param minDistance 点之间的最小距离
     * @returns 采样得到的点集合
     */
    private static poissonDiskSamplingRect(random: () => number, rect: Rect, minDistance: number): Vec2[] {
        return this.poissonDiskSamplingBridson(random, rect.x, rect.y, rect.width, rect.height, minDistance, undefined);
    }

    /** 估算矩形区域内可容纳的点数上限
     * @param rect 矩形区域
     * @param minDistance 点之间的最小距离
     * @returns 估算得到的点数上限
     */
    private static estimateRectPointCount(rect: Rect, minDistance: number): number {
        if (rect.width <= 0 || rect.height <= 0 || minDistance <= 0) {
            return 0;
        }

        const area = rect.width * rect.height;
        const theoreticalMax = area * 2 / (Math.sqrt(3) * minDistance * minDistance);
        return Math.max(1, Math.ceil(theoreticalMax));
    }

    /** 在四条线围成的区域内执行泊松盘采样
     * @param lines 组成边界的四条直线
     * @param numberOfPoints 最多返回的点数
     * @param minDistance 点之间的最小距离
     * @returns 采样得到的点集合
     */
    private static poissonDiskSamplingLines(random: () => number, lines: Line2D[], numberOfPoints: number, minDistance: number): Vec2[] {
        // Line2D 使用 y = ax + b 表示，无法表达垂直线（斜率不存在）。
        // 若调用方传入了垂直线（通过其他途径标记），此处提前拦截以避免静默错误。
        // 目前 Line2D 本身不存储垂直线标志，防御留作扩展点；
        // tryGetPolygonVertices 内部对交点数不足的情况已返回 null。
        const polygon = this.tryGetPolygonVertices(lines);
        if (polygon === null) {
            return [];
        }

        const bounds = this.getPolygonBounds(polygon);
        const points = this.poissonDiskSamplingBridson(random, bounds.x, bounds.y, bounds.width, bounds.height, minDistance, (point) => this.isPointInPolygon(point, polygon));

        if (points.length > numberOfPoints) {
            return this.takeRandomSubset(points, numberOfPoints, random);
        }

        return points;
    }

    /****************  Bridson 核心采样  ****************/

    /** 执行 Bridson 泊松盘采样
     * @param originX 区域起点 x
     * @param originY 区域起点 y
     * @param width 区域宽度
     * @param height 区域高度
     * @param minDistance 点之间的最小距离
     * @param inRegion 可选的区域判定函数
     * @returns 采样得到的点集合
     */
    private static poissonDiskSamplingBridson(random: () => number, originX: number, originY: number, width: number, height: number, minDistance: number, inRegion?: (point: Vec2) => boolean): Vec2[] {
        const points: Vec2[] = [];
        if (width <= 0 || height <= 0 || minDistance <= 0) {
            return points;
        }

        const cellSize = minDistance / Math.SQRT2;
        const cols = Math.max(1, Math.ceil(width / cellSize));
        const rows = Math.max(1, Math.ceil(height / cellSize));
        const grid = new Array<number>(cols * rows);
        grid.fill(-1);

        const minDistanceSq = minDistance * minDistance;
        const active: number[] = [];

        let firstPoint: Vec2 | null = null;
        let attempts = 1000;
        while (attempts-- > 0) {
            const candidate = new Vec2(originX + random() * width, originY + random() * height);
            if (inRegion === undefined || inRegion(candidate)) {
                firstPoint = candidate;
                break;
            }
        }

        if (firstPoint === null) {
            return points;
        }

        points.push(firstPoint);
        active.push(0);
        this.setGrid(grid, cols, rows, cellSize, originX, originY, firstPoint, 0);

        while (active.length > 0) {
            const activeIndex = (random() * active.length) | 0;
            const pointIndex = active[activeIndex];
            const point = points[pointIndex];
            let found = false;

            for (let i = 0; i < BRIDSON_K; i++) {
                const angle = random() * TWO_PI;
                const radius = minDistance * (1 + random());
                const candidateX = point.x + radius * Math.cos(angle);
                const candidateY = point.y + radius * Math.sin(angle);

                if (candidateX < originX || candidateX >= originX + width || candidateY < originY || candidateY >= originY + height) {
                    continue;
                }

                const candidate = new Vec2(candidateX, candidateY);
                if (inRegion !== undefined && !inRegion(candidate)) {
                    continue;
                }

                if (this.hasNeighborInRange(grid, cols, rows, cellSize, originX, originY, candidate, minDistanceSq, points)) {
                    continue;
                }

                points.push(candidate);
                active.push(points.length - 1);
                this.setGrid(grid, cols, rows, cellSize, originX, originY, candidate, points.length - 1);
                found = true;
                break;
            }

            if (!found) {
                const lastIndex = active.length - 1;
                active[activeIndex] = active[lastIndex];
                active.length = lastIndex;
            }
        }

        return points;
    }

    /** 将点写入空间网格
     * @param grid 空间网格
     * @param cols 列数
     * @param rows 行数
     * @param cellSize 单元格大小
     * @param ox 区域原点 x
     * @param oy 区域原点 y
     * @param point 当前点
     * @param pointIndex 当前点索引
     */
    private static setGrid(grid: number[], cols: number, rows: number, cellSize: number, ox: number, oy: number, point: Vec2, pointIndex: number): void {
        const col = Math.max(0, Math.min(cols - 1, Math.floor((point.x - ox) / cellSize)));
        const row = Math.max(0, Math.min(rows - 1, Math.floor((point.y - oy) / cellSize)));
        grid[row * cols + col] = pointIndex;
    }

    /** 判断指定点周围是否存在距离过近的邻居
     * @param grid 空间网格
     * @param cols 列数
     * @param rows 行数
     * @param cellSize 单元格大小
     * @param ox 区域原点 x
     * @param oy 区域原点 y
     * @param point 待检测点
     * @param minDistanceSq 最小距离平方
     * @param points 已采样点集合
     * @returns 是否存在邻近点
     */
    private static hasNeighborInRange(grid: number[], cols: number, rows: number, cellSize: number, ox: number, oy: number, point: Vec2, minDistanceSq: number, points: Vec2[]): boolean {
        const cellCol = Math.floor((point.x - ox) / cellSize);
        const cellRow = Math.floor((point.y - oy) / cellSize);
        // cellSize = minDistance / √2，所以 minDistance 最多跨 ceil(√2) = 2 个格子
        const radius = 2;

        for (let dc = -radius; dc <= radius; dc++) {
            const col = cellCol + dc;
            if (col < 0 || col >= cols) {
                continue;
            }

            for (let dr = -radius; dr <= radius; dr++) {
                const row = cellRow + dr;
                if (row < 0 || row >= rows) {
                    continue;
                }

                const pointIndex = grid[row * cols + col];
                if (pointIndex < 0) {
                    continue;
                }

                const neighbor = points[pointIndex];
                const dx = point.x - neighbor.x;
                const dy = point.y - neighbor.y;
                if (dx * dx + dy * dy < minDistanceSq) {
                    return true;
                }
            }
        }

        return false;
    }

    /****************  多边形与几何辅助  ****************/

    /** 计算两条直线的交点
     * @param line1 第一条直线
     * @param line2 第二条直线
     * @returns 交点，若平行则返回空
     */
    private static getLineIntersection(line1: Line2D, line2: Line2D): Vec2 | null {
        const deltaA = line1.a - line2.a;
        if (Math.abs(deltaA) < EPSILON) {
            return null;
        }

        const x = (line2.b - line1.b) / deltaA;
        return new Vec2(x, line1.a * x + line1.b);
    }

    /** 尝试从四条直线中解析出多边形顶点
     *
     * 四条直线两两相交最多产生 C(4,2)=6 个交点，其中只有 4 个是真正的
     * 四边形顶点（每个顶点恰好是某两条相邻边的交点）。
     * 筛选规则：一个交点是有效顶点，当且仅当它位于另外两条直线所围成的
     * "同侧"区域内——即对于未参与该交点的每条直线，四个有效顶点都在
     * 该直线的同侧（利用凸多边形性质）。
     * 实现上采用更直接的方式：对全部交点按角度排序后构成候选多边形，
     * 然后只保留恰好由两条边界线生成、且不被其余两条线"夹在外侧"的顶点。
     *
     * @param lines 边界直线（恰好 4 条）
     * @returns 顶点数组（恰好 4 个），解析失败则返回 null
     */
    private static tryGetPolygonVertices(lines: Line2D[]): Vec2[] | null {
        if (lines.length !== 4) {
            return null;
        }

        // 枚举所有 C(4,2)=6 对组合，记录每个交点由哪两条线产生
        const intersections: Array<{ point: Vec2; i: number; j: number }> = [];
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                const pt = this.getLineIntersection(lines[i], lines[j]);
                if (pt !== null) {
                    intersections.push({ point: pt, i, j });
                }
            }
        }

        // 至少需要 4 个交点才能构成四边形
        if (intersections.length < 4) {
            return null;
        }

        // 筛选有效顶点：一个交点是有效顶点，当且仅当对于另外两条
        // 未参与该交点的直线，该点"夹在"这两条直线之间。
        // 等价判断：对每条不参与该交点的直线 k，令 f(p) = a_k * p.x - p.y + b_k，
        // 四个有效顶点的 f 值符号应一致；换言之，该交点的 f 值与
        // 其他所有有效顶点的 f 值同号。
        // 更简单的实现：先找出所有交点的凸包（即按角度排序），
        // 然后丢掉"不在四边形上"的点——即对于线段对 (i,j)，
        // 另外两条线 k,l 中若某条线的两个端点（其余两交点）夹住了该交点，
        // 则该交点有效。
        //
        // 最直观的实现：对每个交点，检查它是否同时满足
        // "被另外两条线从两侧夹住"——即对于不参与该交点的每条线 k，
        // 在同一条线 k 上取另一个与之配对的交点作为参考，
        // 该候选点应在参考点与线 k 的"内侧"之间。
        //
        // 此处采用最简洁可靠的方式：
        // 有效顶点 = 该交点对于剩余两条直线，其符号与其他有效顶点一致。
        // 由于我们不知道哪些点有效，改用"多数表决"：
        // 对于每条线 k（共4条），计算所有交点相对于该线的符号；
        // 有效的4个顶点在每条线上应全部同号（因为它们都在同一侧）。
        // 满足所有4条线同侧约束的交点即为有效顶点。
        //
        // 实现：枚举所有可能的 4 点子集（C(6,4)=15 种），
        // 选取能通过 isPointInPolygon 自洽性校验的那一组。
        // 但更高效的方式见下方。

        // ---- 高效实现 ----
        // 对于四边形的每条边（直线 i），其对边上的两个顶点必定在直线 i 的同侧。
        // 因此：对于交点 (i,j)，检查剩余两条直线 k, l（k,l ∉ {i,j}）：
        //   该交点相对于直线 k 的符号，必须与直线 k 上的另一个有效交点相同。
        // 由于我们要找的恰好是 4 个点，直接枚举每条线上的所有交点对，
        // 为每条线选出"在四边形内侧"的那个交点。
        //
        // 最终采用最简方案：按角度排序全部交点，取最外层凸包的 4 个顶点。
        // 对于由 4 条直线围成的凸四边形，全部 6 个交点中，
        // 凸包恰好由 4 个真正的顶点构成（另外 2 个在凸包内部或边上）。

        const allPoints = intersections.map(e => e.point);
        this.sortVerticesByAngle(allPoints);

        // 计算凸包，凸四边形情况下凸包顶点恰好是 4 个有效顶点
        const hull = this.convexHull(allPoints);
        if (hull.length !== 4) {
            return null;
        }

        return hull;
    }

    /** 计算点集的凸包（Andrew's Monotone Chain 算法），返回逆时针顺序的顶点
     * @param points 输入点集（不会修改原数组）
     * @returns 凸包顶点（逆时针顺序）
     */
    private static convexHull(points: Vec2[]): Vec2[] {
        const n = points.length;
        if (n < 3) {
            return points.slice();
        }

        // 按 x 升序，x 相同则按 y 升序排列
        const sorted = points.slice().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

        // cross product of vectors OA and OB
        const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const lower: Vec2[] = [];
        for (let i = 0; i < n; i++) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
                lower.pop();
            }
            lower.push(sorted[i]);
        }

        const upper: Vec2[] = [];
        for (let i = n - 1; i >= 0; i--) {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
                upper.pop();
            }
            upper.push(sorted[i]);
        }

        // 去掉首尾重复点后合并
        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    /** 按角度对顶点进行排序
     * @param points 待排序顶点
     */
    private static sortVerticesByAngle(points: Vec2[]): void {
        if (points.length === 0) {
            return;
        }

        let centerX = 0;
        let centerY = 0;
        for (let i = 0; i < points.length; i++) {
            centerX += points[i].x;
            centerY += points[i].y;
        }

        const invCount = 1 / points.length;
        centerX *= invCount;
        centerY *= invCount;

        points.sort((a, b) => {
            const angleA = Math.atan2(a.y - centerY, a.x - centerX);
            const angleB = Math.atan2(b.y - centerY, b.x - centerX);
            return angleA - angleB;
        });
    }

    /** 判断点是否位于多边形内部
     * @param point 待判断点
     * @param polygon 多边形顶点集合
     * @returns 是否在多边形内部
     */
    private static isPointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
        const count = polygon.length;
        if (count < 3) {
            return false;
        }

        let inside = false;
        for (let i = 0, j = count - 1; i < count; j = i++) {
            const current = polygon[i];
            const previous = polygon[j];
            if (((current.y > point.y) !== (previous.y > point.y)) &&
                (point.x < (previous.x - current.x) * (point.y - current.y) / (previous.y - current.y) + current.x)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /** 计算多边形包围盒
     * @param polygon 多边形顶点集合
     * @returns 包围盒数据
     */
    private static getPolygonBounds(polygon: Vec2[]): Rect {
        if (polygon.length === 0) {
            return new Rect(0, 0, 0, 0);
        }

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < polygon.length; i++) {
            const point = polygon[i];
            if (point.x < minX) {
                minX = point.x;
            }
            if (point.y < minY) {
                minY = point.y;
            }
            if (point.x > maxX) {
                maxX = point.x;
            }
            if (point.y > maxY) {
                maxY = point.y;
            }
        }

        return new Rect(minX, minY, maxX - minX, maxY - minY);
    }

    /** 从点集合中随机截取指定数量的点（Fisher-Yates 洗牌前段）
     * @param points 原始点集合（会被原地修改）
     * @param numberOfPoints 目标数量
     * @param random 随机数生成器，与采样阶段保持一致以支持种子复现
     * @returns 截取后的点集合
     */
    private static takeRandomSubset(points: Vec2[], numberOfPoints: number, random: () => number): Vec2[] {
        if (numberOfPoints <= 0) {
            points.length = 0;
            return points;
        }

        if (points.length <= numberOfPoints) {
            return points;
        }

        for (let i = 0; i < numberOfPoints; i++) {
            const j = i + ((random() * (points.length - i)) | 0);
            const temp = points[i];
            points[i] = points[j];
            points[j] = temp;
        }

        points.length = numberOfPoints;
        return points;
    }

}