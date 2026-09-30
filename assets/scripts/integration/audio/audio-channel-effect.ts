import { AudioClip, AudioSource, isValid, Node, assetManager, resources } from "cc";
import { AudioConfig } from "./audio-config";
import { AudioLoadClipFunc, AudioReleaseClipFunc, IAudioEffectOptions } from "./audio-types";

/** 活跃音效实例信息 */
interface IActiveEffectInfo {
    /** 唯一音效句柄 ID */
    audioId: number;
    /** 负责播放的 AudioSource 实例 */
    source: AudioSource;
    /** 音频剪辑资源 */
    clip: AudioClip;
    /** 资源相对路径 */
    path: string;
    /** 资源所属 Bundle */
    bundle: string;
    /** 相对独立音量比例 (0.0 ~ 1.0) */
    relativeVol: number;
    /** 兜底超时定时器句柄 */
    timerId: any;
    /** 播放结束监听回调引用 */
    onEndCallback?: () => void;
    /** 播放完成外部回调 */
    onComplete?: () => void;
}

/** 音效通道
 * 管理 AudioSource 对象池、音效并发控制、重复播放节流防爆音及生命周期自动回收
 */
export class EffectChannel {

    /** 最大并发音效 AudioSource 数量 */
    public static readonly MAX_ACTIVE_EFFECTS = 32;
    /** 同一音效最大同时播放实例数 */
    public static readonly MAX_SAME_EFFECT_CONCURRENT = 4;
    /** 默认节流时间（毫秒） */
    public static readonly DEFAULT_THROTTLE_MS = 50;

    /** 音频配置管理器引用 */
    private _config: AudioConfig;
    /** 挂载 AudioSource 组件的主节点 */
    private _hostNode: Node | null = null;
    /** 音频剪辑加载委托 */
    private _loadClipFunc: AudioLoadClipFunc | null = null;
    /** 音频剪辑释放委托 */
    private _releaseClipFunc: AudioReleaseClipFunc | null = null;
    /** 可复用的 AudioSource 对象池 */
    private _pool: AudioSource[] = [];
    /** 正在播放的活跃音效表 (audioId -> Info) */
    private _activeMap: Map<number, IActiveEffectInfo> = new Map();
    /** 音效节流记录 (resKey -> 上次触发时间戳) */
    private _throttleMap: Map<string, number> = new Map();
    /** 自增 AudioId */
    private _nextAudioId: number = 1;
    /** 全局暂停状态 */
    private _isPaused: boolean = false;

    constructor(config: AudioConfig) {
        this._config = config;
    }

    /****************  初始化与通道挂载  ****************/

    /** 初始化音效通道并预创建初始对象池
     * @param hostNode 挂载 AudioSource 的宿主节点
     * @param loadClipFunc 音频加载委托
     * @param releaseClipFunc 音频释放委托
     * @param initialPoolSize 初始预创建的 AudioSource 数量，默认为 8
     */
    public init(hostNode: Node, loadClipFunc?: AudioLoadClipFunc | null, releaseClipFunc?: AudioReleaseClipFunc | null, initialPoolSize: number = 8): void {
        this.stopAllEffects();
        this._pool = [];
        this._activeMap.clear();
        this._throttleMap.clear();
        this._hostNode = hostNode;
        this._loadClipFunc = loadClipFunc || null;
        this._releaseClipFunc = releaseClipFunc || null;
        for (let i = 0; i < initialPoolSize; i++) {
            const src = hostNode.addComponent(AudioSource);
            src.loop = false;
            this._pool.push(src);
        }
    }

    /****************  音效播放与控制  ****************/

    /** 播放音效
     * @param source 音频剪辑实例或资源路径
     * @param options 音效配置项
     * @returns 音效句柄 audioId (<= 0 表示播放失败或被节流)
     */
    public async playEffect(source: AudioClip | string, options?: IAudioEffectOptions): Promise<number> {
        if (!this._hostNode || !isValid(this._hostNode)) {
            return -1;
        }

        const bundle = options?.bundle ?? "resources";
        const loop = options?.loop ?? false;
        const relativeVol = options?.volume ?? 1.0;
        const throttleMs = options?.throttleMs ?? EffectChannel.DEFAULT_THROTTLE_MS;
        const now = Date.now();

        let path = "";
        let clip: AudioClip | null = null;

        if (typeof source === "string") {
            path = source;
            const resKey = `${bundle}:${path}`;

            // 节流检查：防同一帧/极短时间内高频触发导致爆音
            if (throttleMs > 0) {
                const lastTime = this._throttleMap.get(resKey) || 0;
                if (now - lastTime < throttleMs) {
                    return 0; // 被节流丢弃
                }
                this._throttleMap.set(resKey, now);
            }

            // 同一音效并发上限检查
            if (this._getSameEffectCount(path) >= EffectChannel.MAX_SAME_EFFECT_CONCURRENT) {
                this._stopOldestEffectByPath(path);
            }

            try {
                clip = await this._loadClip(path, bundle);
            } catch (e) {
                console.error(`[EffectChannel] Failed to load effect: ${path} in bundle ${bundle}`, e);
                return -1;
            }
        } else {
            clip = source;
            path = clip.name || "custom_effect";
        }

        if (!clip || !isValid(this._hostNode)) {
            if (typeof source === "string") {
                this._releaseClip(path, bundle);
            }
            return -1;
        }

        // 获取或构建 AudioSource 播放组件
        const audioSource = this._acquireAudioSource();
        if (!audioSource) {
            if (typeof source === "string") {
                this._releaseClip(path, bundle);
            }
            return -1;
        }

        const audioId = this._nextAudioId++;
        const targetVolume = this._config.getActualEffectVolume(relativeVol);

        audioSource.clip = clip;
        audioSource.loop = loop;
        audioSource.volume = targetVolume;
        audioSource.play();

        let timerId: any = null;
        let onEndCallback: (() => void) | undefined = undefined;

        if (!loop) {
            // 监听音频播放结束事件进行精确回收
            onEndCallback = () => {
                this._recycleEffect(audioId);
            };
            audioSource.node.on(AudioSource.EventType.ENDED, onEndCallback, this);

            // 设置兜底超时定时器（时长 + 100ms 缓冲）
            const duration = audioSource.duration || (clip.getDuration ? clip.getDuration() : 0.1);
            const durationMs = Math.max(0.1, duration) * 1000 + 100;
            timerId = setTimeout(() => {
                this._recycleEffect(audioId);
            }, durationMs);
        }

        const info: IActiveEffectInfo = {
            audioId,
            source: audioSource,
            clip,
            path: typeof source === "string" ? path : "",
            bundle,
            relativeVol,
            timerId,
            onEndCallback,
            onComplete: options?.onComplete,
        };

        this._activeMap.set(audioId, info);
        return audioId;
    }

    /** 停止指定音效
     * @param audioId 音效句柄
     */
    public stopEffect(audioId: number): void {
        if (audioId <= 0) return;
        this._recycleEffect(audioId);
    }

    /** 停止所有正在播放的音效 */
    public stopAllEffects(): void {
        const ids = Array.from(this._activeMap.keys());
        for (const id of ids) {
            this._recycleEffect(id);
        }
    }

    /** 动态设置特定音效实例的相对音量
     * @param audioId 音效句柄
     * @param relativeVol 相对音量比例 (0.0 ~ 1.0)
     */
    public setEffectInstanceVolume(audioId: number, relativeVol: number): void {
        const info = this._activeMap.get(audioId);
        if (info && isValid(info.source)) {
            info.relativeVol = relativeVol;
            info.source.volume = this._config.getActualEffectVolume(relativeVol);
        }
    }

    /****************  音量与状态刷新  ****************/

    /** 暂停所有音效 */
    public pauseAll(): void {
        if (this._isPaused) return;
        this._isPaused = true;
        this._activeMap.forEach((info) => {
            if (isValid(info.source) && info.source.playing) {
                info.source.pause();
            }
        });
    }

    /** 恢复所有音效 */
    public resumeAll(): void {
        if (!this._isPaused) return;
        this._isPaused = false;
        this._activeMap.forEach((info) => {
            if (isValid(info.source)) {
                info.source.play();
            }
        });
    }

    /** 刷新并同步所有活跃音效的实际音量 */
    public updateVolume(): void {
        this._activeMap.forEach((info) => {
            if (isValid(info.source)) {
                info.source.volume = this._config.getActualEffectVolume(info.relativeVol);
            }
        });
    }

    /****************  对象池与实例回收  ****************/

    /** 从对象池获取 AudioSource，如池空且未超过上限则动态创建，否则抢占最旧实例
     * @returns 可用的 AudioSource 组件，超出上限且无法分配时返回 null
     */
    private _acquireAudioSource(): AudioSource | null {
        if (this._pool.length > 0) {
            return this._pool.pop()!;
        }

        // 检查总并发上限
        if (this._activeMap.size < EffectChannel.MAX_ACTIVE_EFFECTS) {
            if (this._hostNode && isValid(this._hostNode)) {
                const src = this._hostNode.addComponent(AudioSource);
                src.loop = false;
                return src;
            }
            return null;
        }

        // 达到最大并发限制，抢占最早播放的音效
        const oldestId = this._activeMap.keys().next().value;
        if (oldestId !== undefined) {
            const oldestInfo = this._activeMap.get(oldestId)!;
            const src = oldestInfo.source;
            this._recycleEffect(oldestId);
            return src;
        }

        return null;
    }

    /** 回收音效实例与释放资源引用
     * @param audioId 待回收的音效句柄
     */
    private _recycleEffect(audioId: number): void {
        const info = this._activeMap.get(audioId);
        if (!info) return;

        this._activeMap.delete(audioId);

        if (info.timerId) {
            clearTimeout(info.timerId);
            info.timerId = null;
        }

        if (isValid(info.source)) {
            if (info.onEndCallback) {
                info.source.node.off(AudioSource.EventType.ENDED, info.onEndCallback, this);
            }
            info.source.stop();
            info.source.clip = null;
            this._pool.push(info.source);
        }

        if (info.path) {
            this._releaseClip(info.path, info.bundle);
        }

        if (info.onComplete) {
            try {
                info.onComplete();
            } catch (e) {
                console.error(`[EffectChannel] onComplete callback error:`, e);
            }
        }
    }

    /** 加载音频剪辑资源 */
    private async _loadClip(path: string, bundle: string): Promise<AudioClip | null> {
        if (this._loadClipFunc) {
            return this._loadClipFunc(path, bundle);
        }
        const b = assetManager.getBundle(bundle) || resources;
        return new Promise<AudioClip | null>((resolve) => {
            b.load(path, AudioClip, (err, asset) => {
                if (err || !asset) {
                    resolve(null);
                } else {
                    resolve(asset);
                }
            });
        });
    }

    /** 释放音频剪辑资源引用 */
    private _releaseClip(path: string, bundle: string): void {
        if (this._releaseClipFunc) {
            this._releaseClipFunc(path, bundle);
            return;
        }
        const b = assetManager.getBundle(bundle) || resources;
        b.release(path, AudioClip);
    }

    /****************  并发与节流辅助  ****************/

    /** 获取同名音效当前活跃播放数量
     * @param path 音效资源路径
     * @returns 活跃播放数量
     */
    private _getSameEffectCount(path: string): number {
        let count = 0;
        for (const info of this._activeMap.values()) {
            if (info.path === path) count++;
        }
        return count;
    }

    /** 停止并回收指定路径最早播放的音效
     * @param path 音效资源路径
     */
    private _stopOldestEffectByPath(path: string): void {
        for (const [id, info] of this._activeMap.entries()) {
            if (info.path === path) {
                this._recycleEffect(id);
                break;
            }
        }
    }
}
