/** 语言类型枚举 */
export enum ELanguage {
    zh_Hans = "zh-Hans",
    en = "en",
}

/** 游戏配置-默认配置 */
export class GameConfig {
    /** 语言 */
    language: string = ELanguage.zh_Hans;
    /** 主音量 */
    volume: number = 1;
    /** BGM 音量 (0 - 100) */
    bgmVolume: number = 100;
    /** SFX 音量 (0 - 100) */
    sfxVolume: number = 100;
    /** 是否静音 */
    isMuted: boolean = false;
}

/** 游戏初始化配置 */
export const GameInitConfig = {
    /** 版本字符串 */
    versionStr: "0.0.1",
    /** 版本号 */
    version: 1,
    /** 初始化语言 */
    initLanguage: ELanguage.zh_Hans,
};

/** 调试配置 */
export const DebugConfig = {
    /** 是否跳过主菜单直接开始（调试期直接进入游戏主界面） */
    skipMainMenu: true,
};
