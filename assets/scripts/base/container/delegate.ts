/**
 * 多播委托的处理器类型定义。
 * @typeParam TArgs - 处理器参数元组类型
 * @typeParam TResult - 处理器返回值类型
 */
export type DelegateHandler<TArgs extends unknown[] = [], TResult = void> = (...args: TArgs) => TResult;

/** 委托槽位的内部结构。 */
interface DelegateSlot<TArgs extends unknown[], TResult> {
    handler: DelegateHandler<TArgs, TResult>;
    thisArg?: unknown;
}

/** 支持添加/移除语义的多播委托容器。
 * 可用于事件广播、回调集合等场景，保证在调用期间对数组的修改不会破坏遍历。
 */
export class Delegate<TArgs extends unknown[] = [], TResult = void> {

    /** 存放槽位的数组，可能包含 undefined（延迟删除占位） */
    private _slots: Array<DelegateSlot<TArgs, TResult> | undefined> = [];
    /** 当前已注册的处理器数量（有效槽位计数） */
    private _count: number = 0;
    /** 嵌套调用深度；在 invoke 调用期间大于 0 */
    private _invokeDepth: number = 0;
    /** 标记是否需要在 invoke 结束后进行压缩清理 */
    private _needsCompact: boolean = false;

    /** 当前已注册的处理器数量。 */
    public get count(): number {
        return this._count;
    }

    /** 是否没有任何已注册的处理器。 */
    public get isEmpty(): boolean {
        return this._count === 0;
    }

    /********************************************  [注册与移除方法]  ********************************************/

    /** 向调用列表末尾添加一个处理器。
     * 返回 this，可链式调用，相当于 + 运算符的方法形式。
     * @param handler 要注册的处理器
     * @param thisArg 调用时的 this 指向（可选）
     */
    public plus(handler: DelegateHandler<TArgs, TResult>, thisArg?: unknown): this {
        this._slots.push({ handler, thisArg });
        this._count++;
        return this;
    }

    /** 从调用列表中移除最后一个匹配的处理器。
     * 成功移除时返回 true。
     * @param handler 要移除的处理器
     * @param thisArg 与注册时相同的 thisArg（可选）
     */
    public minus(handler: DelegateHandler<TArgs, TResult>, thisArg?: unknown): boolean {
        for (let i = this._slots.length - 1; i >= 0; i--) {
            const slot = this._slots[i];
            if (slot && slot.handler === handler && slot.thisArg === thisArg) {
                this._removeAt(i);
                return true;
            }
        }
        return false;
    }

    /** 检查给定的处理器当前是否已注册。 */
    public has(handler: DelegateHandler<TArgs, TResult>, thisArg?: unknown): boolean {
        for (let i = 0; i < this._slots.length; i++) {
            const slot = this._slots[i];
            if (slot && slot.handler === handler && slot.thisArg === thisArg) {
                return true;
            }
        }
        return false;
    }

    /**
     * 注册一个只会被调用一次的处理器。
     * 首次触发后自动从调用列表中移除。
     * @param handler 要注册的一次性处理器
     * @param thisArg 调用时的 this 指向（可选）
     */
    public once(handler: DelegateHandler<TArgs, TResult>, thisArg?: unknown): this {
        // 包装器在首次调用后会将自身从列表中移除，然后再调用原始处理器。
        const wrapper = (...args: TArgs): TResult => {
            this.minus(wrapper, thisArg);
            return handler.apply(thisArg, args);
        };
        return this.plus(wrapper, thisArg);
    }

    /********************************************  [调用与遍历方法]  ********************************************/

    /** 按注册顺序依次调用所有处理器，返回最后一个处理器的结果。
     * 注意：若没有任何处理器，返回 undefined；调用者无法区分
     * "没有处理器"与"最后一个处理器返回了 undefined"这两种情况。
     * 在 invoke 执行期间新添加的处理器，不会在本次调用中被触发。
     * @param args 传递给处理器的参数
     * @returns 最后一个处理器的返回值（可能为 undefined）
     */
    public invoke(...args: TArgs): TResult | undefined {
        let result: TResult | undefined = undefined;
        const length = this._slots.length;

        // 标记进入调用期，防止在遍历时直接修改数组结构
        this._invokeDepth++;
        try {
            for (let i = 0; i < length; i++) {
                const slot = this._slots[i];
                if (slot) {
                    // 使用 apply 保持 thisArg 正确性，并将返回值赋给 result
                    result = slot.handler.apply(slot.thisArg, args);
                }
            }

        } finally {
            // 离开调用期，若有延迟删除标记则进行压缩清理
            this._invokeDepth--;
            if (this._invokeDepth === 0 && this._needsCompact) {
                this._compact();
            }
        }

        return result;
    }

    /********************************************  [清理与生命周期]  ********************************************/

    /** 移除所有处理器并释放相关引用。 */
    public clear(): void {
        if (this._count === 0) {
            return;
        }

        this._count = 0;

        if (this._invokeDepth > 0) {
            // invoke 执行期间不能直接修改数组，将所有 slot 置为 undefined，
            // 等 invoke 结束后再通过 _compact 清理。
            for (let i = 0; i < this._slots.length; i++) {
                this._slots[i] = undefined;
            }
            this._needsCompact = true;
            return;
        }

        // 非 invoke 期间直接清空数组，并同步重置压缩标志
        this._slots.length = 0;
        this._needsCompact = false;
    }

    /** clear 的别名，用于生命周期清理场景。 */
    public destroy(): void {
        this.clear();
    }

    /********************************************  [内部工具方法]  ********************************************/

    /** 在指定索引处移除槽位。
     * 在 invoke 期间会延迟为 undefined 并标记需要压缩，非调用期间直接 splice 删除。
     * @param index 要移除的槽位索引
     */
    private _removeAt(index: number): void {
        this._count--;
        if (this._invokeDepth > 0) {
            // 延迟删除：置为 undefined，等待 invoke 完成后统一压缩
            this._slots[index] = undefined;
            this._needsCompact = true;
            return;
        }

        this._slots.splice(index, 1);
    }

    /** 将数组中所有 undefined 的空位压缩清除。 */
    private _compact(): void {
        let write = 0;
        for (let read = 0; read < this._slots.length; read++) {
            const slot = this._slots[read];
            if (slot) {
                this._slots[write++] = slot;
            }
        }
        this._slots.length = write;
        this._needsCompact = false;
    }
}