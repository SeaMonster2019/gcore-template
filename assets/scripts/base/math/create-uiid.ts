/** 生成UUID v4字符串
 * @returns {string} uuid v4字符串
 */
export function UuidV4(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/** 生成10位的字母或数字的随机Key
 * @returns {string} 10位的字母或数字的随机Key
 */
export function Uid10Bit(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 10; i++) {
        result += chars[(Math.random() * 62) | 0];
    }
    return result;
}
