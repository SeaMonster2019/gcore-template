import { AudioClip, Node } from "cc";

/** 背景音乐播放选项 */
export interface IAudioMusicOptions {
    /** 资源包名称，默认为 'resources' */
    bundle?: string;
    /** 是否循环播放，默认为 true */
    loop?: boolean;
    /** 相对独立音量 (0.0 ~ 1.0)，默认为 1.0 */
    volume?: number;
    /** 淡入淡出时长（秒），默认为 0.8s，0 为立即切换 */
    fadeDuration?: number;
}

/** 音效播放选项 */
export interface IAudioEffectOptions {
    /** 资源包名称，默认为 'resources' */
    bundle?: string;
    /** 是否循环播放，默认为 false */
    loop?: boolean;
    /** 相对独立音量 (0.0 ~ 1.0)，默认为 1.0 */
    volume?: number;
    /** 防重复节流时间（毫秒），同一音效在该时间内重复调用将被忽略，默认为 50ms */
    throttleMs?: number;
    /** 播放完成回调（非循环音效有效） */
    onComplete?: () => void;
}

/** 正在播放的背景音乐记录（用于音乐栈） */
export interface IAudioMusicStackItem {
    /** 音频资源或路径 */
    source: AudioClip | string;
    /** 播放选项 */
    options?: IAudioMusicOptions;
}

/** 音频配置数据接口（包含音量大小与静音状态） */
export interface IAudioConfigData {
    /** 全局主音量，取值范围 [0.0, 1.0]，默认值为 1.0 */
    masterVolume: number;
    /** 全局主静音开关，true 表示全局静音，默认值为 false */
    masterMuted: boolean;
    /** 背景音乐（BGM）音量，取值范围 [0.0, 1.0]，默认值为 1.0 */
    musicVolume: number;
    /** 背景音乐（BGM）静音开关，true 表示音乐静音，默认值为 false */
    musicMuted: boolean;
    /** 音效（SFX）音量，取值范围 [0.0, 1.0]，默认值为 1.0 */
    effectVolume: number;
/** 音效（SFX）静音开关，true 表示音效静音，默认值为 false */
    effectMuted: boolean;
}

/** 音频剪辑加载委托函数 */
export type AudioLoadClipFunc = (path: string, bundle?: string) => Promise<AudioClip | null>;

/** 音频剪辑释放委托函数 */
export type AudioReleaseClipFunc = (path: string, bundle?: string) => void;

/** 音频管理器初始化参数接口 */
export interface IAudioInitOptions {
    /** 挂载音频组件的根节点或父节点 */
    root: Node;
    /** 音频资源加载函数（依赖注入） */
    loadClipFunc?: AudioLoadClipFunc;
    /** 音频资源释放函数（依赖注入） */
    releaseClipFunc?: AudioReleaseClipFunc;
}

