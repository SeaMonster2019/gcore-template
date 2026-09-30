import { sys } from "cc";
import { gcoreStorage } from "./index";

/** 存储系统 / 游戏配置管理器 */
export class ConfigMgr {

    /** 游戏配置 Key */
    private static readonly GAME_CONFIG_KEY = "GAME_CONFIG_KEY";

    /** 内存缓存的配置数据 */
    private _cachedConfig: any = null;

    /** 初始化配置管理器
     * @returns Promise<boolean> 是否完成初始化
     */
    async init(): Promise<boolean> {
        this.getGameConfig();
        return true;
    }

    /** 
     * 获取游戏配置
     * @template T 配置对象类型
     * @returns 游戏配置对象，若不存在则返回 undefined
     */
    getGameConfig<T>(): T | undefined {
        if (this._cachedConfig) {
            return this._cachedConfig as T;
        }

        // 优先尝试从 gcoreStorage 全局读取
        let config: T | undefined = gcoreStorage.get<T>(ConfigMgr.GAME_CONFIG_KEY, undefined, true);

        // 若框架 storage 未获取到，退回 sys.localStorage 跨平台持久化读取
        if (!config) {
            try {
                const raw = sys.localStorage.getItem(ConfigMgr.GAME_CONFIG_KEY);
                if (raw) {
                    config = JSON.parse(raw) as T;
                }
            } catch (e) {
                console.error(`[ConfigMgr] Read game config error: ${e}`);
            }
        }

        if (config) {
            this._cachedConfig = config;
        }

        return config;
    }

    /** 
     * 保存游戏配置
     * @template T 配置对象类型
     * @param config 需要保存的配置对象
     */
    saveGameConfig<T>(config: T): void {
        this._cachedConfig = config;

        // 使用框架全局 gcoreStorage 保存
        gcoreStorage.set(ConfigMgr.GAME_CONFIG_KEY, config, true);

        // 同步保存至 sys.localStorage 保证原生与 Mini-Game 跨平台兼容
        try {
            sys.localStorage.setItem(ConfigMgr.GAME_CONFIG_KEY, JSON.stringify(config));
        } catch (e) {
            console.error(`[ConfigMgr] Save game config error: ${e}`);
        }
    }

    /** 
     * 部分更新游戏配置
     * @template T 配置对象类型
     * @param partialConfig 增量更新配置对象
     * @returns 更新后的完整配置
     */
    updateGameConfig<T extends object>(partialConfig: Partial<T>): T {
        const current = (this.getGameConfig<T>() || {}) as T;
        const updated = Object.assign({}, current, partialConfig);
        this.saveGameConfig<T>(updated);
        return updated;
    }

    /** 
     * 清除本地游戏配置数据
     */
    clearGameConfig(): void {
        this._cachedConfig = null;
        gcoreStorage.remove(ConfigMgr.GAME_CONFIG_KEY, true);
        try {
            sys.localStorage.removeItem(ConfigMgr.GAME_CONFIG_KEY);
        } catch (e) {
            console.error(`[ConfigMgr] Clear game config error: ${e}`);
        }
    }
}
