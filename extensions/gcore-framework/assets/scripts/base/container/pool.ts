/** 具备自动批量扩容策略的对象池 */
export class Pool<T> {
    private pool: T[] = [];
    private maxSize: number;
    private growSize: number; // 单次扩容的批量大小
    private create: () => T;

    constructor( create: () => T, options?: { 
            initSize?: number;  // 初始预热大小，默认 0
            maxSize?: number;   // 池内允许常驻的最大数量，默认 32
            growSize?: number;  // 触发扩容时，一次性创建的数量，默认 4
        }
    ) {
        this.create = create;
        this.maxSize = options?.maxSize ?? 32;
        this.growSize = options?.growSize ?? 4;

        // 策略 1：初始化预热（Warm Up）
        // 在池子创建时就准备好基础对象，避免游戏或服务刚启动时瞬间卡顿
        const initSize = options?.initSize ?? 0;
        if (initSize > 0) {
            this.expand(Math.min(initSize, this.maxSize));
        }
    }

    /** 核心扩容逻辑：批量创建对象并压入池中 */
    private expand(amount: number): void {
        // 确保扩容后的总量不会越过 maxSize 的硬限制
        const currentSize = this.pool.length;
        const availableSpace = this.maxSize - currentSize;
        const actualGrow = Math.min(amount, availableSpace);

        for (let i = 0; i < actualGrow; i++) {
            this.pool.push(this.create());
        }
    }

    /** 获取一个对象，如果池中有则复用；否则触发自动扩容策略 */
    public alloc(): T {
        if (this.pool.length === 0) {
            // 策略 2：触发自动批量扩容
            this.expand(this.growSize);

            // 如果连扩容都失败了（比如已经达到了 maxSize 硬限制），只能临时兜底创建一个
            if (this.pool.length === 0) {
                return this.create();
            }
        }
        return this.pool.pop() as T;
    }

    /** 回收一个对象到池中 */
    public free(obj: T): void {
        // 重置对象状态的逻辑通常建议在这里或由外部处理，防止数据污染
        if (this.pool.length < this.maxSize) {
            this.pool.push(obj);
        }
        // 超出最大容量则丢弃，交给 JS/TS 的 GC 垃圾回收机制
    }

    /** 清空对象池 */
    public clear(): void {
        this.pool.length = 0;
    }

    /** 当前池中可用的空闲对象数量 */
    public size(): number {
        return this.pool.length;
    }
}