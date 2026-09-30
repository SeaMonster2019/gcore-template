import { Long } from "../container/long";

/** pcg随机数生成器 (标准PCG-XSH-RR算法) */
export class PcgRandom {

    /** LCG乘数 (64位PCG标准参数) */
    private static readonly Multiplier: Long = Long.fromString("6364136223846793005", 10);
    /** 默认增量 (64位PCG标准参数) */
    private static readonly DefaultIncrement: Long = Long.fromString(`DA3E39CB94B95BDB`, 16); // 注意移除尾部的n

    /** 种子 */
    private declare _seed: number;
    get seed(): number {
        return this._seed;
    }

    /** 流id */
    private declare _streamId: number;
    get streamId(): number {
        return this._streamId;
    }

    /** 步数 */
    private _step: number = 0;
    /** 步数 */
    public get step(): number {
        return this._step;
    }

    /** 当前状态 (64位) */
    private declare _state: Long;
    /** 增量（必须为奇数） */
    private declare _increment: Long;

    /** 生成回调 */
    private declare _generateCallback: (step: number) => void;

    /** 构造函数
     * @param seed 种子
     * @param streamId 流id
    */
    constructor(seed?: number, streamId: number = 0, generateCallback?: (step: number) => void) {

        // 初始化
        if (seed === undefined) {
            const now = new Date();
            let seedValue = now.getTime();
            seedValue ^= now.getMilliseconds() << 16;
            this._initialize(seedValue, streamId);
        } else {
            this._initialize(seed, streamId);
        }

        // 设置生成回调
        if (generateCallback) {
            this._generateCallback = generateCallback;
        }
    }

    /** 修改初始化方法 */
    private _initialize(seed: number, streamId: number): void {
        this._seed = seed;
        this._streamId = streamId;

        // 根据流ID生成唯一增量 (确保是奇数)
        const streamValue = Long.fromNumber(streamId).shiftLeft(1).or(1);
        this._increment = PcgRandom.DefaultIncrement.xor(streamValue);

        this._state = Long.UZERO;
        this._advanceState();
        this._state = this._state.add(seed);
        this._advanceState();
    }

    /** LCG状态更新 (64位运算) */
    private _advanceState(): void {
        // 使用Long的乘法、加法和与运算
        this._state = this._state.multiply(PcgRandom.Multiplier)
            .add(this._increment)
            .and(Long.MAX_UNSIGNED_VALUE);
    }

    /** 返回32位随机整数 (标准PCG-XSH-RR算法) */
    protected _next(): number {
        const oldState = this._state;
        this._advanceState();
        ++this._step;

        const xorshifted = oldState.shiftRightUnsigned(18)
            .xor(oldState)
            .shiftRightUnsigned(27)
            .toNumber() >>> 0;

        const rotation = oldState.shiftRightUnsigned(59).toNumber() & 0x1F;

        // 应用旋转操作，然后将结果转换为无符号32位整数
        const result = (xorshifted >>> rotation) | (xorshifted << (32 - rotation));

        this._generateCallback?.(this._step);

        return result >>> 0;
    }

    /** 返回非负随机整数 */
    public getUint32(): number {
        return this._next();
    }

    /** 返回指定范围内的随机整数 */
    public getIntRange(min: number, max: number): number {
        if (min >= max) {
            throw new Error("最小值必须小于最大值");
        }

        const range = max - min;
        if (range === 0) return min;

        // 创建位掩码
        let mask = range - 1;
        mask |= mask >> 1;
        mask |= mask >> 2;
        mask |= mask >> 4;
        mask |= mask >> 8;
        mask |= mask >> 16;

        let result: number;
        do {
            result = this._next() & mask;
        } while (result >= range);

        return result + min;
    }

    /** 返回[0.0, 1.0)之间的数字 */
    public getFloat(decimalPlaces: number = 0): number {
        let result = this._next() / 0x100000000;
        if (decimalPlaces > 0) {
            const factor = Math.pow(10, decimalPlaces);
            result = Math.floor(result * factor) / factor;
        }
        return result;
    }

    /** 返回[min,max)之间的数字*/
    public getFloatRange(min: number, max: number, decimalPlaces: number = 0): number {
        return this.getFloat(decimalPlaces) * (max - min) + min;
    }

    /** 生成加权随机结果 */
    public getWeight(weightList: number[]): number {
        const totalWeight = weightList.reduce((sum, weight) => sum + weight, 0);
        let randomValue = this.getFloat() * totalWeight;

        for (let i = 0; i < weightList.length; i++) {
            if (randomValue < weightList[i]) return i;
            randomValue -= weightList[i];
        }

        return weightList.length - 1;
    }

    /** 快速跳跃 */
    public jump(steps: number): void {
        if (steps <= 0) return;

        // 将步数转换为无符号64位整数
        const stepCount = Long.fromNumber(steps);

        // 计算跳跃矩阵
        let jumpMultiplier = Long.UONE;
        let jumpIncrement = Long.UZERO;

        let curMultiplier = PcgRandom.Multiplier;
        let curIncrement = this._increment;

        // 使用二进制分解计算跳跃矩阵
        let delta = stepCount;
        while (delta.greaterThan(0)) {
            if (delta.and(1).equals(1)) {
                // 累积跳跃矩阵
                jumpMultiplier = jumpMultiplier.multiply(curMultiplier);
                jumpIncrement = jumpIncrement.multiply(curMultiplier).add(curIncrement);
            }

            // 准备下一比特位
            curIncrement = curMultiplier.add(1).multiply(curIncrement);
            curMultiplier = curMultiplier.multiply(curMultiplier);

            // 确保64位范围
            jumpMultiplier = jumpMultiplier.and(Long.MAX_UNSIGNED_VALUE);
            jumpIncrement = jumpIncrement.and(Long.MAX_UNSIGNED_VALUE);
            curMultiplier = curMultiplier.and(Long.MAX_UNSIGNED_VALUE);
            curIncrement = curIncrement.and(Long.MAX_UNSIGNED_VALUE);

            delta = delta.shiftRightUnsigned(1);
        }

        // 应用跳跃
        this._state = this._state.multiply(jumpMultiplier)
            .add(jumpIncrement)
            .and(Long.MAX_UNSIGNED_VALUE);

        // 更新步数计数器
        this._step += steps;
    }

    /** 设置生成回调 */
    public setGenerateCallback(callback: (step: number) => void) {
        this._generateCallback = callback;
    }

    /** 获取uuidv4 */
    public getUuidv4(): string {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = this.getIntRange(0, 15);
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

}
