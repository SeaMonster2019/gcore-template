import { sys } from "cc";

/**
 * 持久化管理器
 * 支持用户数据分离和全局数据持久化
 */
export class StorageMgr {

    /** 用户ID */
    private _userId: string = "";

    /** 初始化 */
    public init(): void {
    }

    /**
     * 设置用户ID
     * @param userId 用户ID
     */
    public setUserId(userId: string): void {
        this._userId = userId;
    }

    /**
     * 获取带有用户标识的key
     * @param key 原始key
     * @param isGlobal 是否为全局数据
     * @param userId 覆盖默认用户ID
     * @returns 带有标识的key
     */
    private _getKey(key: string, isGlobal: boolean, userId?: string): string {
        if (isGlobal) {
            return `global_${key}`;
        }
        const id = userId || this._userId;
        if (!id) {
            return `user_default_${key}`;
        }
        return `user_${id}_${key}`;
    }

    /**
     * 存储数据
     * @param key 键
     * @param value 值
     * @param isGlobal 是否为全局数据 (默认为false，即用户分离)
     * @param userId 覆盖默认用户ID
     */
    public set(key: string, value: any, isGlobal: boolean = false, userId?: string): void {
        const finalKey = this._getKey(key, isGlobal, userId);
        let strValue = "";
        try {
            strValue = JSON.stringify(value);
        } catch (e) {
            console.error(`StorageMgr set error: ${e}`);
            return;
        }
        sys.localStorage.setItem(finalKey, strValue);
    }

    /**
     * 获取数据
     * @param key 键
     * @param defaultValue 默认值
     * @param isGlobal 是否为全局数据 (默认为false，即用户分离)
     * @param userId 覆盖默认用户ID
     * @returns 存储的数据
     */
    public get<T>(key: string, defaultValue: T | undefined = undefined, isGlobal: boolean = false, userId?: string): T | undefined {
        const finalKey = this._getKey(key, isGlobal, userId);
        const strValue = sys.localStorage.getItem(finalKey);
        if (strValue === null || strValue === undefined || strValue === "") {
            return defaultValue;
        }
        try {
            return JSON.parse(strValue) as T;
        } catch (e) {
            console.error(`StorageMgr get error: ${e}. Key: ${finalKey}, Value: ${strValue}`);
            return defaultValue;
        }
    }

    /**
     * 兼容 IGameStorage 接口的 save 方法
     * @param key 键
     * @param value 值
     */
    public save(key: string, value: any): void {
        this.set(key, value);
    }

    /**
     * 兼容 IGameStorage 接口的 load 方法
     * @param key 键
     */
    public load<T>(key: string): T | undefined {
        return this.get<T>(key);
    }

    /**
     * 移除数据
     * @param key 键
     * @param isGlobal 是否为全局数据 (默认为false，即用户分离)
     * @param userId 覆盖默认用户ID
     */
    public remove(key: string, isGlobal: boolean = false, userId?: string): void {
        const finalKey = this._getKey(key, isGlobal, userId);
        sys.localStorage.removeItem(finalKey);
    }

    /**
     * 清除数据
     * @param isGlobal 是否清除全局数据 (默认为false，即清除当前用户数据)
     * @param userId 覆盖默认用户ID
     */
    public clear(isGlobal: boolean = false, userId?: string): void {
        if (isGlobal) {
            this._clearByPrefix("global_");
        } else {
            const id = userId || this._userId;
            if (id) {
                this._clearByPrefix(`user_${id}_`);
            } else {
                this._clearByPrefix(`user_default_`);
            }
        }
    }

    /**
     * 根据前缀清除数据
     * @param prefix 前缀
     */
    private _clearByPrefix(prefix: string): void {
        if (sys.platform === sys.Platform.DESKTOP_BROWSER || sys.platform === sys.Platform.MOBILE_BROWSER) {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }
            for (const key of keysToRemove) {
                sys.localStorage.removeItem(key);
            }
        } else {
            console.warn(`StorageMgr clearByPrefix is not fully supported on platform: ${sys.platform}. Only removeItem is recommended.`);
        }
    }
}
