/** 反序列化错误枚举 */
export enum EDeserializeError {
    /** 正常 */
    OK,
    /** 数据不足 */
    NOT_ENOUGH,
    /** 超出大小 */
    EXCEED_SIZE,
}

/** 最小容量 */
const MIN_CAPACITY: number = 16

/** 2的32次方常量 */
const f_2power32 = Math.pow(2, 32)
/** 2的56次方常量 */
const f_2power56 = Math.pow(2, 56)

/** 字节缓冲区，用于二进制数据的序列化读取（Luban配置表解码器） */
export default class ByteBuf {

    /** 空字节数组单例 */
    private static emptyBytes = new Uint8Array(0);

    /** 底层字节数据 */
    private _bytes: ArrayBuffer;
    /** 读取位置索引 */
    private _readerIndex: number;
    /** 写入位置索引 */
    private _writerIndex: number;

    /** 获取DataView视图 */
    private get view(): DataView {
        return new DataView(this._bytes)
    }

    /** 获取Uint8Array视图 */
    private get bytesView(): Uint8Array {
        return new Uint8Array(this._bytes)
    }

    /** 缓冲区总容量 */
    get capacity(): number { return this._bytes.byteLength }
    /** 可读数据大小 */
    get size(): number { return this._writerIndex - this._readerIndex }
    /** 是否为空 */
    get empty(): boolean { return this._writerIndex <= this._readerIndex }
    /** 是否非空 */
    get notEmpty(): boolean { return this._writerIndex > this._readerIndex }

    /********************************************
    /** 构造与替换 **/
    /********************************************/

    /** 构造ByteBuf
     * @param bytes 初始字节数据，支持ArrayBuffer或Uint8Array
     */
    constructor(bytes?: ArrayBuffer | Uint8Array) {
        if (bytes instanceof Uint8Array) {
            // Uint8Array需要拷贝底层buffer
            this._bytes = bytes.slice().buffer;
            this._writerIndex = bytes.byteLength
        } else {
            this._bytes = bytes ?? new ArrayBuffer(0);
            this._writerIndex = bytes != null ? bytes.byteLength : 0
        }
        this._readerIndex = 0
    }

    /** 替换内部字节数据，重置读写索引
     * @param bytes 新的字节数据
     */
    Replace(bytes: ArrayBuffer | Uint8Array) {
        this._bytes = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
        this._readerIndex = 0;
        this._writerIndex = bytes.byteLength;
    }

    /** 替换内部字节数据并指定读写范围
     * @param bytes 新的字节数据
     * @param beginPos 起始读取位置
     * @param endPos 结束写入位置
     */
    Replace2(bytes: ArrayBuffer | Uint8Array, beginPos: number, endPos: number) {
        this._bytes = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
        this._readerIndex = beginPos;
        this._writerIndex = endPos;
    }

    /********************************************
    /** 基础访问 **/
    /********************************************/

    /** 获取底层ArrayBuffer */
    getArrayBuffer(): ArrayBuffer { return this._bytes }

    /** 前移读取索引
     * @param add 前移量
     */
    addReadIndex(add: number) {
        this._readerIndex += add
    }

    /** 拷贝未读数据为新的Uint8Array
     * @returns 未读数据的拷贝，无数据时返回空数组
     */
    copyData(): Uint8Array {
        const n = this.remaining
        if (n > 0) {
            return new Uint8Array(this._bytes.slice(this._readerIndex, this._writerIndex))
        } else {
            return ByteBuf.emptyBytes
        }
    }

    /** 剩余可读字节数 */
    get remaining(): number { return this._writerIndex - this._readerIndex }

    /** 丢弃已读数据，将未读数据移至缓冲区头部 */
    discardReadBytes() {
        const bytes = this.bytesView
        // 将未读区域拷贝到缓冲区起始位置
        bytes.copyWithin(0, this._readerIndex, this._writerIndex)
        this._writerIndex -= this._readerIndex
        this._readerIndex = 0
    }

    /** 清空读写索引 */
    clear() {
        this._readerIndex = this._writerIndex = 0
    }

    /********************************************
    /** 内部辅助方法 **/
    /********************************************/

    /** 计算合适的扩容大小（2的幂对齐）
     * @param initSize 初始大小
     * @param needSize 需要的大小
     * @returns 满足需求的最小2的幂值
     */
    private static propSize(initSize: number, needSize: number): number {
        for (let i = Math.max(initSize, MIN_CAPACITY); i <<= 1;) {
            if (i >= needSize) {
                return i
            }
        }
        return needSize;
    }

    /** 确保可读字节数充足，不足则抛出异常
     * @param size 需要读取的字节数
     */
    private ensureRead(size: number) {
        if (this._readerIndex + size > this._writerIndex) {
            throw new Error()
        }
    }

    /** 检查是否可读取指定字节数
     * @param size 需要读取的字节数
     * @returns 是否可读
     */
    private canRead(size: number): boolean {
        return (this._readerIndex + size <= this._writerIndex)
    }

    /********************************************
    /** 基础类型读取 **/
    /********************************************/

    /** 读取布尔值 */
    readBool(): boolean {
        this.ensureRead(1)
        return this.bytesView[this._readerIndex++] != 0
    }

    /** 读取无符号字节（0~255） */
    readByte(): number {
        this.ensureRead(1)
        return this.bytesView[this._readerIndex++]
    }

    /** 读取变长短整型（Varint编码，1~3字节） */
    readShort(): number {
        this.ensureRead(1)
        const view = this.view
        // 读取首字节判断编码长度
        const h = view.getUint8(this._readerIndex)
        if (h < 0x80) {
            // 单字节编码：0xxxxxxx
            this._readerIndex++
            return h
        }
        else if (h < 0xc0) {
            // 双字节编码：10xxxxxx xxxxxxxx
            this.ensureRead(2)
            const x = view.getUint16(this._readerIndex, false) & 0x3fff
            this._readerIndex += 2
            return x
        }
        else if ((h == 0xff)) {
            // 三字节编码（有符号）：11111111 xxxxxxxx xxxxxxxx
            this.ensureRead(3)
            const x = view.getInt16(this._readerIndex + 1, false)
            this._readerIndex += 3
            return x
        }
        else {
            throw new Error()
        }
    }

    /** 读取变长整型（Varint编码，1~5字节） */
    readInt(): number {
        const view = this.view

        this.ensureRead(1)
        // 读取首字节判断编码长度
        const h = view.getUint8(this._readerIndex)
        if (h < 0x80) {
            // 单字节编码：0xxxxxxx
            this._readerIndex++
            return h
        }
        else if (h < 0xc0) {
            // 双字节编码：10xxxxxx xxxxxxxx
            this.ensureRead(2)
            const x = view.getUint16(this._readerIndex, false) & 0x3fff
            this._readerIndex += 2
            return x
        }
        else if (h < 0xe0) {
            // 三字节编码：110xxxxx xxxxxxxx xxxxxxxx
            this.ensureRead(3)
            const x = ((h & 0x1f) << 16) | view.getUint16(this._readerIndex + 1, false)
            this._readerIndex += 3
            return x
        }
        else if (h < 0xf0) {
            // 四字节编码：1110xxxx xxxxxxxx xxxxxxxx xxxxxxxx
            this.ensureRead(4)
            const x = view.getInt32(this._readerIndex, false) & 0x0fffffff
            this._readerIndex += 4
            return x
        }
        else {
            // 五字节编码（有符号）：11110000 xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
            this.ensureRead(5)
            const x = view.getInt32(this._readerIndex + 1, false)
            this._readerIndex += 5
            return x
        }
    }

    /** 读取固定4字节整型（小端序） */
    readFint(): number {
        this.ensureRead(4)
        const x = this.view.getInt32(this._readerIndex, true)
        this._readerIndex += 4
        return x
    }

    /** 读取变长长整型并以number返回（Varint编码，1~9字节）
     * 警告！如有修改，记得调整 TryDeserializeInplaceOctets
     */
    readLongAsNumber(): number {
        const view = this.view
        ///
        /// 警告！ 如有修改，记得调整 TryDeserializeInplaceOctets
        this.ensureRead(1)
        // 读取首字节判断编码长度
        const h = view.getUint8(this._readerIndex)
        if (h < 0x80) {
            // 1字节：0xxxxxxx
            this._readerIndex++
            return h
        }
        else if (h < 0xc0) {
            // 2字节：10xxxxxx xxxxxxxx
            this.ensureRead(2)
            const x = view.getUint16(this._readerIndex, false) & 0x3fff
            this._readerIndex += 2
            return x
        }
        else if (h < 0xe0) {
            // 3字节：110xxxxx xxxxxxxx xxxxxxxx
            this.ensureRead(3)
            const x = ((h & 0x1f) << 16) | view.getUint16(this._readerIndex + 1, false)
            this._readerIndex += 3
            return x
        }
        else if (h < 0xf0) {
            // 4字节：1110xxxx xxxxxxxx xxxxxxxx xxxxxxxx
            this.ensureRead(4)
            const x = view.getInt32(this._readerIndex, false) & 0x0fffffff
            this._readerIndex += 4
            return x
        }
        else if (h < 0xf8) {
            // 5字节：11110xxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
            this.ensureRead(5)
            const xl = view.getUint32(this._readerIndex + 1, false)
            const xh = h & 0x07
            this._readerIndex += 5
            return xh * 0x100000000 + xl
        }
        else if (h < 0xfc) {  // 6字节：1111 10xx
            this.ensureRead(6)
            const xl = view.getUint32(this._readerIndex + 2, false)
            const xh = view.getUint16(this._readerIndex, false) & 0x3ff
            this._readerIndex += 6
            return xh * 0x100000000 + xl
        }
        else if (h < 0xfe) {
            // 7字节：1111 110x
            this.ensureRead(7)
            const xl = view.getUint32(this._readerIndex + 3, false)
            const xh = (view.getUint32(this._readerIndex, false) >> 8) & 0x1ffff
            this._readerIndex += 7
            return xh * 0x100000000 + xl
        }
        else if (h < 0xff) { // 8字节：1111 1110
            this.ensureRead(8)
            const xl = view.getUint32(this._readerIndex + 4, false)
            const xh = view.getUint32(this._readerIndex, false) & 0xffffff
            this._readerIndex += 8
            return xh * f_2power32 + xl
        }
        else {
            // 9字节：1111 1111（有符号64位）
            this.ensureRead(9)
            const x = view.getBigInt64(this._readerIndex + 1, false)
            this._readerIndex += 9
            return Number(x)
        }
    }

    /** 读取变长长整型并以bigint返回（Varint编码，1~9字节） */
    readLong(): bigint {
        const view = this.view
        ///
        this.ensureRead(1)
        // 读取首字节判断编码长度
        const h = view.getUint8(this._readerIndex)
        if (h < 0x80) {
            // 1字节
            this._readerIndex++
            return BigInt(h)
        }
        else if (h < 0xc0) {
            // 2字节
            this.ensureRead(2)
            const x = view.getUint16(this._readerIndex, false) & 0x3fff
            this._readerIndex += 2
            return BigInt(x)
        }
        else if (h < 0xe0) {
            // 3字节
            this.ensureRead(3)
            const x = ((h & 0x1f) << 16) | view.getUint16(this._readerIndex + 1, false)
            this._readerIndex += 3
            return BigInt(x)
        }
        else if (h < 0xf0) {
            // 4字节
            this.ensureRead(4)
            const x = view.getInt32(this._readerIndex, false) & 0x0fffffff
            this._readerIndex += 4
            return BigInt(x)
        }
        else if (h < 0xf8) {
            // 5字节
            this.ensureRead(5)
            const xl = view.getUint32(this._readerIndex + 1, false)
            const xh = h & 0x07
            this._readerIndex += 5
            return BigInt(xh * 0x100000000 + xl)
        }
        else if (h < 0xfc) {  // 6字节：1111 10xx
            this.ensureRead(6)
            const xl = view.getUint32(this._readerIndex + 2, false)
            const xh = view.getUint16(this._readerIndex, false) & 0x3ff
            this._readerIndex += 6
            return BigInt(xh * 0x100000000 + xl)
        }
        else if (h < 0xfe) {
            // 7字节
            this.ensureRead(7)
            const xl = view.getUint32(this._readerIndex + 3, false)
            const xh = (view.getUint32(this._readerIndex, false) >> 8) & 0x1ffff
            this._readerIndex += 7
            return BigInt(xh * 0x100000000 + xl)
        }
        else if (h < 0xff) { // 8字节：1111 1110
            this.ensureRead(8)
            const xl = view.getUint32(this._readerIndex + 4, false)
            const xh = view.getUint32(this._readerIndex, false) & 0xffffff
            this._readerIndex += 8
            // 使用BigInt位运算避免精度丢失
            return (BigInt(xh) << BigInt(32)) | BigInt(xl)
        }
        else {
            // 9字节（有符号64位）
            this.ensureRead(9)
            const x = view.getBigInt64(this._readerIndex + 1, false)
            this._readerIndex += 9
            return x
        }
    }

    /** 读取32位浮点数（小端序） */
    readFloat(): number {
        this.ensureRead(4)
        const x = this.view.getFloat32(this._readerIndex, true)
        this._readerIndex += 4
        return x
    }

    /** 读取64位双精度浮点数（小端序） */
    readDouble(): number {
        this.ensureRead(8)
        const x = this.view.getFloat64(this._readerIndex, true)
        this._readerIndex += 8
        return x
    }

    /** 读取长度值（等同于readInt的变长编码） */
    readSize(): number {
        return this.readInt()
    }

    /********************************************
    /** 复合类型读取 **/
    /********************************************/

    /** 读取UTF-8编码字符串 */
    readString(): string {
        // 先读取字节长度
        const n = this.readSize()
        if (n > 0) {
            this.ensureRead(n)
            // 解码UTF-8字符串
            const s = new TextDecoder("utf-8").decode(this._bytes.slice(this._readerIndex, this._readerIndex + n))
            this._readerIndex += n
            return s
        }
        else {
            return ""
        }
    }

    /** 读取字节数组 */
    readBytes(): Uint8Array {
        // 先读取字节长度
        const n = this.readSize()
        if (n > 0) {
            this.ensureRead(n)
            // 拷贝指定长度的字节
            const x = new Uint8Array(this._bytes.slice(this._readerIndex, this._readerIndex + n))
            this._readerIndex += n
            return x
        }
        else {
            return ByteBuf.emptyBytes
        }
    }

    /** 读取ArrayBuffer */
    readArrayBuffer(): ArrayBufferLike {
        const bytes = this.readBytes()
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }

    /** 跳过指定长度的字节数据 */
    SkipBytes() {
        const n = this.readSize()
        this.ensureRead(n)
        // 直接前移读取索引
        this._readerIndex += n
    }

}
