import { PcgRandom } from "../math/pcg-random";

/** 随机队列的状态快照，用于持久化与恢复 */
export interface RandomQueueSnapshot {
    /** 位池原始数据（⌈(m+1)/32⌉ 个 uint32） */
    pool: number[];
    /** 剩余可用数量 */
    remaining: number;
    /** 本次抽取的值 */
    value: number;
}

/** 基于位掩码的条件随机队列容器
 *
 * 从 [0, m] 范围内不重复地随机抽取整数，支持条件过滤与放回机制。
 * 抽出的数字经过条件判断，不满足条件的自动放回队列，直到找到满足条件的数字。
 *
 * - m 最大支持 1023（值域 0-1023，共 1024 个值）
 * - 位池大小根据 m 动态分配：⌈(m+1)/32⌉ 个 uint32
 *   - m=10 → 4 字节，m=50 → 8 字节，m=127 → 16 字节，m=1023 → 128 字节
 * - 多个队列可共享同一个 PcgRandom 实例以节省内存
 */
export class RandomQueue {

    /** 最大值（值域上界） */
    private _m: number;

    /** 位池：⌈(m+1)/32⌉ 个 uint32，bit i = 1 表示值 i 仍在池中 */
    private _pool: Uint32Array;

    /** 池状态备份（用于 next 内部的放回操作，避免每次调用时分配内存） */
    private _savedPool: Uint32Array;

    /** 当前池中剩余可用数量 */
    private _remaining: number;

    /** 池耗尽或无符合条件时是否自动重置 */
    private _isAutoReset: boolean;

    /** PCG 随机数生成器（外部共享） */
    private _pcg: PcgRandom;

    /** 每次成功抽取后的回调，暴露内部状态用于外部持久化 */
    private _onNext: (snapshot: RandomQueueSnapshot) => void;

    /** 条件判断方法，返回 true 表示该值满足输出条件 */
    private _condition: (value: number) => boolean;

    /** 构造随机队列
     * @param m 取值范围上界，队列将生成 [0, m] 的不重复随机整数，m ∈ [0, 1023]
     * @param onNext 每次成功抽取后的回调，参数为内部状态快照，可用于外部持久化
     * @param isAutoReset 当池耗尽或无符合条件的值时，是否自动重置整个容器
     * @param condition 条件判断方法，判断抽出的值是否满足输出条件
     * @param pcg PCG 随机数生成器实例（可多个队列共享）
     */
    constructor(
        m: number,
        onNext: (snapshot: RandomQueueSnapshot) => void,
        isAutoReset: boolean,
        condition: (value: number) => boolean,
        pcg: PcgRandom
    ) {
        if (m < 0 || m > 1023 || !Number.isInteger(m)) {
            throw new Error(`RandomQueue: m 必须为 [0, 1023] 范围内的整数，当前值: ${m}`);
        }

        this._m = m;
        const wordCount = ((m + 1) + 31) >>> 5; // ⌈(m+1)/32⌉
        this._pool = new Uint32Array(wordCount);
        this._savedPool = new Uint32Array(wordCount);
        this._remaining = 0;
        this._isAutoReset = isAutoReset;
        this._pcg = pcg;
        this._onNext = onNext;
        this._condition = condition;

        this._reset();
    }

    /** 当前池中剩余可用数量 */
    public get remaining(): number {
        return this._remaining;
    }

    /** 取值范围上界 */
    public get m(): number {
        return this._m;
    }

    /** 抽取下一个满足条件的随机值
     *
     * 从池中随机抽取值并通过条件判断：
     * - 满足条件：将本轮不满足的值放回池中，触发 onNext 回调，返回该值
     * - 不满足条件：暂时移出池，继续抽取下一个
     * - 池耗尽或全部不满足：根据 isAutoReset 决定重置或返回 undefined
     *
     * @returns 满足条件的随机值，或 undefined（池耗尽且不自动重置 / 无任何值满足条件时）
     */
    public next(): number | undefined {
        // 池为空时的处理
        if (this._remaining === 0) {
            if (this._isAutoReset) {
                this._reset();
            } else {
                return undefined;
            }
        }

        // 保存当前池状态，用于放回被拒绝的值（memcpy，零 GC 开销）
        this._savedPool.set(this._pool);
        const savedRemaining = this._remaining;

        while (this._remaining > 0) {
            // 从池中随机选取一个可用值（rank 选择法，确定性时间）
            const v = this._pickRandom();

            // 从池中移除
            this._clearBit(v);
            this._remaining--;

            // 条件判断
            if (this._condition(v)) {
                // 满足条件：恢复池状态（放回所有被拒绝的值），然后仅移除被接受的值
                this._pool.set(this._savedPool);
                this._remaining = savedRemaining;
                this._clearBit(v);
                this._remaining--;

                // 触发回调，暴露内部状态
                this._onNext(this._createSnapshot(v));
                return v;
            }
        }

        // 所有值都不满足条件：恢复池到调用前的状态
        this._pool.set(this._savedPool);
        this._remaining = savedRemaining;

        // 根据策略处理：自动重置整个容器，或不做处理
        if (this._isAutoReset) {
            this._reset();
        }
        return undefined;
    }

    /** 恢复内部状态
     * @param snapshot 状态快照；不传参数时恢复到初始状态
     */
    public recover(snapshot?: RandomQueueSnapshot): void {
        if (snapshot) {
            const len = this._pool.length;
            for (let i = 0; i < len; i++) {
                this._pool[i] = i < snapshot.pool.length ? snapshot.pool[i] >>> 0 : 0;
            }
            // 从位池重新计算剩余数量，确保一致性
            this._remaining = this._popcountAll();
        } else {
            this._reset();
        }
    }

    /********************************************  内部方法  ********************************************/

    /** 重置池到初始状态：设置 [0, m] 所有位为 1 */
    private _reset(): void {
        const total = this._m + 1;
        const len = this._pool.length;

        for (let w = 0; w < len; w++) {
            const lo = w * 32;
            const hi = lo + 32;

            if (lo >= total) {
                this._pool[w] = 0;
            } else if (hi <= total) {
                this._pool[w] = 0xFFFFFFFF;
            } else {
                // 部分位：仅设置 [0, total - lo) 位
                this._pool[w] = ((1 << (total - lo)) - 1) >>> 0;
            }
        }

        this._remaining = total;
    }

    /** 清除指定位（标记为已取出） */
    private _clearBit(v: number): void {
        this._pool[v >>> 5] &= ~(1 << (v & 31));
    }

    /** 统计位池中所有 1 的总数 */
    private _popcountAll(): number {
        let count = 0;
        for (let w = 0; w < this._pool.length; w++) {
            count += this._popcount32(this._pool[w]);
        }
        return count;
    }

    /** uint32 popcount — 汉明权重（统计二进制中 1 的个数） */
    private _popcount32(x: number): number {
        x = x - ((x >>> 1) & 0x55555555);
        x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
        x = (x + (x >>> 4)) & 0x0F0F0F0F;
        return (x * 0x01010101) >>> 24;
    }

    /** 在 uint32 中找到第 n 个为 1 的位的位号（0-indexed）
     * @param x 待查找的 uint32 值
     * @param n 第 n 个为 1 的位（0-indexed）
     * @returns 位号 [0, 31]
     */
    private _nthSetBit(x: number, n: number): number {
        for (let i = 0; i < 32; i++) {
            if (x & (1 << i)) {
                if (n === 0) return i;
                n--;
            }
        }
        return -1;
    }

    /** 从池中随机选取一个可用值
     *
     * 使用 rank 选择法：先随机选 rank，再定位到第 rank 个为 1 的位。
     * 确定性 O(⌈m/32⌉) 字级扫描，不依赖拒绝采样。
     */
    private _pickRandom(): number {
        let r = this._pcg.getIntRange(0, this._remaining);

        for (let w = 0; w < this._pool.length; w++) {
            const word = this._pool[w];
            if (word === 0) continue;

            const count = this._popcount32(word);
            if (r < count) {
                return w * 32 + this._nthSetBit(word, r);
            }
            r -= count;
        }

        return -1; // 不会到达
    }

    /** 创建当前状态的快照 */
    private _createSnapshot(value: number): RandomQueueSnapshot {
        return {
            pool: Array.from(this._pool),
            remaining: this._remaining,
            value: value
        };
    }
}
