import { IAudioConfigData } from "./audio-types";

/** 音频配置管理器
 * 负责运行时的音量计算、静音状态与事件分发，持久化存储由业务层自主管理
 */
export class AudioConfig {

    /** 主音量数值 (0.0 ~ 1.0) */
    private _masterVolume: number = 1.0;
    /** 主静音状态 */
    private _masterMuted: boolean = false;
    /** 背景音乐音量数值 (0.0 ~ 1.0) */
    private _musicVolume: number = 1.0;
    /** 背景音乐静音状态 */
    private _musicMuted: boolean = false;
    /** 音效应量数值 (0.0 ~ 1.0) */
    private _effectVolume: number = 1.0;
    /** 音效应量静音状态 */
    private _effectMuted: boolean = false;
    /** 音乐音量变更回调 */
    private _onMusicVolumeChange: (() => void) | null = null;
    /** 音效音量变更回调 */
    private _onEffectVolumeChange: (() => void) | null = null;

    /****************  访问器属性  ****************/

    /** 获取主音量 */
    public get masterVolume(): number {
        return this._masterVolume;
    }

    /** 设置主音量 */
    public set masterVolume(value: number) {
        const clamped = this._clampVolume(value);
        if (this._masterVolume !== clamped) {
            this._masterVolume = clamped;
            this._onMusicVolumeChange?.();
            this._onEffectVolumeChange?.();
        }
    }

    /** 获取主静音状态 */
    public get masterMuted(): boolean {
        return this._masterMuted;
    }

    /** 设置主静音状态 */
    public set masterMuted(value: boolean) {
        if (this._masterMuted !== value) {
            this._masterMuted = value;
            this._onMusicVolumeChange?.();
            this._onEffectVolumeChange?.();
        }
    }

    /** 获取背景音乐音量 */
    public get musicVolume(): number {
        return this._musicVolume;
    }

    /** 设置背景音乐音量 */
    public set musicVolume(value: number) {
        const clamped = this._clampVolume(value);
        if (this._musicVolume !== clamped) {
            this._musicVolume = clamped;
            this._onMusicVolumeChange?.();
        }
    }

    /** 获取背景音乐静音状态 */
    public get musicMuted(): boolean {
        return this._musicMuted;
    }

    /** 设置背景音乐静音状态 */
    public set musicMuted(value: boolean) {
        if (this._musicMuted !== value) {
            this._musicMuted = value;
            this._onMusicVolumeChange?.();
        }
    }

    /** 获取音效音量 */
    public get effectVolume(): number {
        return this._effectVolume;
    }

    /** 设置音效音量 */
    public set effectVolume(value: number) {
        const clamped = this._clampVolume(value);
        if (this._effectVolume !== clamped) {
            this._effectVolume = clamped;
            this._onEffectVolumeChange?.();
        }
    }

    /** 获取音效静音状态 */
    public get effectMuted(): boolean {
        return this._effectMuted;
    }

    /** 设置音效静音状态 */
    public set effectMuted(value: boolean) {
        if (this._effectMuted !== value) {
            this._effectMuted = value;
            this._onEffectVolumeChange?.();
        }
    }

    /****************  初始化与监听绑定  ****************/

    /** 初始化音频配置
     * @param config 可选的初始配置数据（如业务层从本地存储读取的配置）
     */
    public init(config?: Partial<IAudioConfigData>): void {
        if (config) {
            this.setConfig(config);
        }
    }

    /** 绑定音量更新监听
     * @param onMusicChange 音乐音量变更回调
     * @param onEffectChange 音效音量变更回调
     */
    public setListeners(onMusicChange: () => void, onEffectChange: () => void): void {
        this._onMusicVolumeChange = onMusicChange;
        this._onEffectVolumeChange = onEffectChange;
    }

    /****************  批量配置管理  ****************/

    /** 批量应用音频配置（常用于业务层加载存档后同步给框架）
     * @param config 部分或完整的音频配置
     */
    public setConfig(config: Partial<IAudioConfigData>): void {
        let musicChanged = false;
        let effectChanged = false;

        if (config.masterVolume !== undefined) {
            const clamped = this._clampVolume(config.masterVolume);
            if (this._masterVolume !== clamped) {
                this._masterVolume = clamped;
                musicChanged = true;
                effectChanged = true;
            }
        }
        if (config.masterMuted !== undefined && this._masterMuted !== config.masterMuted) {
            this._masterMuted = config.masterMuted;
            musicChanged = true;
            effectChanged = true;
        }

        if (config.musicVolume !== undefined) {
            const clamped = this._clampVolume(config.musicVolume);
            if (this._musicVolume !== clamped) {
                this._musicVolume = clamped;
                musicChanged = true;
            }
        }
        if (config.musicMuted !== undefined && this._musicMuted !== config.musicMuted) {
            this._musicMuted = config.musicMuted;
            musicChanged = true;
        }

        if (config.effectVolume !== undefined) {
            const clamped = this._clampVolume(config.effectVolume);
            if (this._effectVolume !== clamped) {
                this._effectVolume = clamped;
                effectChanged = true;
            }
        }
        if (config.effectMuted !== undefined && this._effectMuted !== config.effectMuted) {
            this._effectMuted = config.effectMuted;
            effectChanged = true;
        }

        if (musicChanged) this._onMusicVolumeChange?.();
        if (effectChanged) this._onEffectVolumeChange?.();
    }

    /** 获取当前所有配置快照
     * @returns 当前音频配置快照
     */
    public getConfig(): IAudioConfigData {
        return {
            masterVolume: this._masterVolume,
            masterMuted: this._masterMuted,
            musicVolume: this._musicVolume,
            musicMuted: this._musicMuted,
            effectVolume: this._effectVolume,
            effectMuted: this._effectMuted,
        };
    }

    /****************  实际音量计算  ****************/

    /** 获取最终输出的音乐音量 (0.0 ~ 1.0)
     * @param trackRelativeVolume 轨道自身的相对音量 (默认 1.0)
     * @returns 综合计算后的音乐音量
     */
    public getActualMusicVolume(trackRelativeVolume: number = 1.0): number {
        if (this._masterMuted || this._musicMuted) {
            return 0;
        }
        return this._clampVolume(this._masterVolume * this._musicVolume * trackRelativeVolume);
    }

    /** 获取最终输出的音效音量 (0.0 ~ 1.0)
     * @param effectRelativeVolume 音效实例自身的相对音量 (默认 1.0)
     * @returns 综合计算后的音效音量
     */
    public getActualEffectVolume(effectRelativeVolume: number = 1.0): number {
        if (this._masterMuted || this._effectMuted) {
            return 0;
        }
        return this._clampVolume(this._masterVolume * this._effectVolume * effectRelativeVolume);
    }

    /****************  私有辅助方法  ****************/

    /** 限制音量在合法范围 [0.0, 1.0]
     * @param val 待校验的原始音量数值
     * @returns 限制在 [0.0, 1.0] 范围内的有效音量
     */
    private _clampVolume(val: number): number {
        if (isNaN(val)) return 1.0;
        return Math.max(0, Math.min(1, val));
    }
}
