export interface IRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class Rect implements IRect {
    x: number;
    y: number;
    width: number;
    height: number;
    constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

/** 通用四叉树，用于空间索引与快速范围检索。 */
export class Quadtree<T> {

    /** 单节点最大对象数，超过后拆分。 */
    private _maxObjects: number;
    /** 最大深度。 */
    private _maxLevels: number;
    /** 当前深度。 */
    private _level: number;
    /** 当前节点边界。 */
    private _bounds: IRect;
    /** 当前节点对象列表。 */
    private _objects: Array<{ item: T, bounds: IRect }> = [];
    /** 子节点。 */
    private _nodes: Quadtree<T>[] = [];
    /** 是否已拆分。 */
    private _isSplit: boolean = false;

    /** 获取当前节点及所有子节点中的对象总数。 */
    public get totalObjects(): number {
        let count = this._objects.length;
        for (let i = 0; i < this._nodes.length; i++) {
            count += this._nodes[i].totalObjects;
        }
        return count;
    }

    /** 构造函数。
     * @param bounds 区域边界
     * @param maxObjects 节点最大对象数，默认 40
     * @param maxLevels 最大深度，默认 3
     * @param level 当前深度，仅内部使用
     */
    constructor(bounds: IRect, maxObjects: number = 40, maxLevels: number = 3, level: number = 0) {
        this._bounds = bounds;
        this._maxObjects = maxObjects;
        this._maxLevels = maxLevels;
        this._level = level;
    }

    /**************** 公共方法 ****************/

    /** 清空四叉树及所有子节点。 */
    public clear(): void {
        this._objects = [];
        for (let i = 0; i < this._nodes.length; i++) {
            this._nodes[i].clear();
        }
        this._nodes = [];
        this._isSplit = false;
    }

    /** 插入一个对象。
     * @param item 对象数据
     * @param bounds 对象边界矩形
     */
    public insert(item: T, bounds: IRect): void {
        if (this._isSplit) {
            const index = this._getIndex(bounds);
            if (index !== -1) {
                this._nodes[index].insert(item, bounds);
                return;
            }
        }

        this._objects.push({ item, bounds });

        if (!this._isSplit && this._objects.length > this._maxObjects && this._level < this._maxLevels) {
            this._split();
            this._isSplit = true;
            let i = 0;
            while (i < this._objects.length) {
                const obj = this._objects[i];
                const index = this._getIndex(obj.bounds);
                if (index !== -1) {
                    this._nodes[index].insert(obj.item, obj.bounds);
                    this._objects.splice(i, 1);
                } else {
                    i++;
                }
            }
        }
    }

    /** 检索与指定区域可能相交的对象。
     * @param bounds 检索区域
     * @param result 结果数组
     * @returns 检索结果
     */
    public retrieve(bounds: IRect, result: T[] = []): T[] {
        for (const obj of this._objects) {
            if (this._intersects(obj.bounds, bounds)) {
                result.push(obj.item);
            }
        }

        if (this._isSplit) {
            for (const node of this._nodes) {
                if (this._intersects(node._bounds, bounds)) {
                    node.retrieve(bounds, result);
                }
            }
        }

        return result;
    }

    /**************** 私有方法 ****************/

    /** 判断两个矩形是否相交。
     * @param a 矩形A
     * @param b 矩形B
     * @returns 是否相交
     */
    private _intersects(a: IRect, b: IRect): boolean {
        return a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
    }

    /** 拆分当前节点为四个子节点。 */
    private _split(): void {
        const subWidth = this._bounds.width / 2;
        const subHeight = this._bounds.height / 2;
        const x = this._bounds.x;
        const y = this._bounds.y;

        this._nodes[0] = new Quadtree<T>(new Rect(x + subWidth, y + subHeight, subWidth, subHeight), this._maxObjects, this._maxLevels, this._level + 1);
        this._nodes[1] = new Quadtree<T>(new Rect(x, y + subHeight, subWidth, subHeight), this._maxObjects, this._maxLevels, this._level + 1);
        this._nodes[2] = new Quadtree<T>(new Rect(x, y, subWidth, subHeight), this._maxObjects, this._maxLevels, this._level + 1);
        this._nodes[3] = new Quadtree<T>(new Rect(x + subWidth, y, subWidth, subHeight), this._maxObjects, this._maxLevels, this._level + 1);
    }

    /** 确定边界矩形完全属于哪一个子节点。
     * @param rect 待检测的矩形边界
     * @returns 子节点索引（0-3），无法完全放入任一子节点则返回 -1
     */
    private _getIndex(rect: IRect): number {
        let index = -1;
        const verticalMidpoint = this._bounds.x + (this._bounds.width / 2);
        const horizontalMidpoint = this._bounds.y + (this._bounds.height / 2);

        const topQuadrant = rect.y >= horizontalMidpoint;
        const bottomQuadrant = (rect.y + rect.height) <= horizontalMidpoint;

        if (rect.x + rect.width <= verticalMidpoint) {
            if (topQuadrant) {
                index = 1;
            } else if (bottomQuadrant) {
                index = 2;
            }
        }
        else if (rect.x >= verticalMidpoint) {
            if (topQuadrant) {
                index = 0;
            } else if (bottomQuadrant) {
                index = 3;
            }
        }

        return index;
    }
}
