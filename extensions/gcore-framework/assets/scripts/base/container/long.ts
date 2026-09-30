/** 自定义无符号 64 位长整数 */
export class Long {

    public readonly low: number;
    public readonly high: number;

    constructor(low: number, high: number) {
        this.low = low >>> 0;
        this.high = high >>> 0;
    }

    public static get UZERO(): Long {
        return new Long(0, 0);
    }

    public static get UONE(): Long {
        return new Long(1, 0);
    }

    public static get MAX_UNSIGNED_VALUE(): Long {
        return new Long(0xFFFFFFFF, 0xFFFFFFFF);
    }

    public static fromNumber(value: number): Long {
        if (isNaN(value) || !isFinite(value)) return Long.UZERO;
        const low = value >>> 0;
        const high = (value / 0x100000000) >>> 0;
        return new Long(low, high);
    }

    public static fromString(value: string, radix: number = 10): Long {
        if (value.length === 0) return Long.UZERO;
        if (radix === 16) {
            let cleanVal = value.trim();
            if (cleanVal.startsWith("0x") || cleanVal.startsWith("0X")) {
                cleanVal = cleanVal.substring(2);
            }
            while (cleanVal.length < 16) {
                cleanVal = "0" + cleanVal;
            }
            const high = parseInt(cleanVal.substring(0, 8), 16) >>> 0;
            const low = parseInt(cleanVal.substring(8, 16), 16) >>> 0;
            return new Long(low, high);
        }

        let cleanVal = value.trim();
        let result = Long.UZERO;
        for (let i = 0; i < cleanVal.length; i++) {
            const digit = parseInt(cleanVal[i], 10);
            if (isNaN(digit)) break;
            result = result.multiply(Long.fromNumber(10)).add(Long.fromNumber(digit));
        }
        return result;
    }

    private static _toLong(val: Long | number): Long {
        if (val instanceof Long) return val;
        return Long.fromNumber(val);
    }

    public add(other: Long | number): Long {
        const o = Long._toLong(other);
        const lowSum = this.low + o.low;
        const low = lowSum >>> 0;
        const carry = lowSum > 0xFFFFFFFF ? 1 : 0;
        const high = (this.high + o.high + carry) >>> 0;
        return new Long(low, high);
    }

    public multiply(other: Long | number): Long {
        const o = Long._toLong(other);

        const a00 = this.low & 0xFFFF, a16 = this.low >>> 16;
        const a32 = this.high & 0xFFFF, a48 = this.high >>> 16;
        const b00 = o.low & 0xFFFF, b16 = o.low >>> 16;
        const b32 = o.high & 0xFFFF, b48 = o.high >>> 16;

        let c00 = 0, c16 = 0, c32 = 0, c48 = 0;

        c00 += a00 * b00;
        c16 += c00 >>> 16; c00 &= 0xFFFF;
        c16 += a16 * b00 + a00 * b16;
        c32 += c16 >>> 16; c16 &= 0xFFFF;
        c32 += a32 * b00 + a16 * b16 + a00 * b32;
        c48 += c32 >>> 16; c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;

        const low = (c00 | (c16 << 16)) >>> 0;
        const high = (c32 | (c48 << 16)) >>> 0;
        return new Long(low, high);
    }

    public and(other: Long | number): Long {
        const o = Long._toLong(other);
        return new Long(this.low & o.low, this.high & o.high);
    }

    public or(other: Long | number): Long {
        const o = Long._toLong(other);
        return new Long(this.low | o.low, this.high | o.high);
    }

    public xor(other: Long | number): Long {
        const o = Long._toLong(other);
        return new Long(this.low ^ o.low, this.high ^ o.high);
    }

    public shiftLeft(num: number): Long {
        num &= 63;
        if (num === 0) return this;
        if (num < 32) {
            const high = ((this.high << num) | (this.low >>> (32 - num))) >>> 0;
            const low = (this.low << num) >>> 0;
            return new Long(low, high);
        } else {
            const high = (this.low << (num - 32)) >>> 0;
            return new Long(0, high);
        }
    }

    public shiftRightUnsigned(num: number): Long {
        num &= 63;
        if (num === 0) return this;
        if (num < 32) {
            const low = ((this.low >>> num) | (this.high << (32 - num))) >>> 0;
            const high = (this.high >>> num) >>> 0;
            return new Long(low, high);
        } else {
            const low = (this.high >>> (num - 32)) >>> 0;
            return new Long(low, 0);
        }
    }

    public toNumber(): number {
        return this.low;
    }

    public equals(other: Long | number): boolean {
        const o = Long._toLong(other);
        return this.low === o.low && this.high === o.high;
    }

    public greaterThan(other: Long | number): boolean {
        const o = Long._toLong(other);
        if (this.high > o.high) return true;
        if (this.high < o.high) return false;
        return this.low > o.low;
    }
}
