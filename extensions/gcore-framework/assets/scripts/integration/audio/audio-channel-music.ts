import { AudioClip, AudioSource, isValid, Node, Tween, tween, assetManager, resources } from "cc";
import { AudioConfig } from "./audio-config";
import { AudioLoadClipFunc, AudioReleaseClipFunc, IAudioMusicOptions, IAudioMusicStackItem } from "./audio-types";

/** 背景音乐通道
 * 提供双轨平滑淡入淡出 (CrossFade)、历史栈 (push/pop)、循环控制及资源安全管理
 */
export class MusicChannel {

    /** 音频配置管理器引用 */
    private _config: AudioConfig;
    /** 挂载 AudioSource 组件的主节点 */
    private _hostNode: Node | null = null;
    /** 音频剪辑加载委托 */
    private _loadClipFunc: AudioLoadClipFunc | null = null;
    /** 音频剪辑释放委托 */
    private _releaseClipFunc: AudioReleaseClipFunc | null = null;
    /** 双轨 AudioSource 组件，用于 CrossFade 过渡 */
    private _sources: [AudioSource, AudioSource] = [null!, null!];
    /** 当前活跃轨道索引 (0 或 1) */
    private _currentTrackIdx: number = 0;
    /** 当前播放的音频剪辑实例 */
    private _currentClip: AudioClip | null = null;
    /** 当前播放的音频资源路径 */
    private _currentPath: string = "";
    /** 当前播放的资源所在 Bundle */
    private _currentBundle: string = "resources";
    /** 当前音乐轨道相对独立音量比例 (0.0 ~ 1.0) */
    private _currentRelativeVol: number = 1.0;
    /** 当前是否处于暂停状态 */
    private _isPaused: boolean = false;
    /** 待释放的旧音乐资源路径（用于在淡入淡出被中断时兜底清理，避免内存泄漏） */
    private _pendingReleasePath: string = "";
    /** 待释放的旧音乐资源所在 Bundle */
    private _pendingReleaseBundle: string = "";
    /** 淡入淡出动画 Tween 引用 */
    private _activeTween: Tween<any> | null = null;
    /** 音乐历史栈，用于临时插播 BGM 后恢复原音乐 */
    private _musicStack: IAudioMusicStackItem[] = [];
    /** 异步加载序号标识，防止短时间内并发播放竞争 */
    private _playSerial: number = 0;

    constructor(config: AudioConfig) {
        this._config = config;
    }

    /****************  访问器属性  ****************/

    /** 获取背景音乐是否正在播放 */
    public get isPlaying(): boolean {
        const src = this.currentSource;
        return !!src && src.playing;
    }

    /** 获取背景音乐是否处于暂停状态 */
    public get isPaused(): boolean {
        return this._isPaused;
    }

    /** 获取当前活跃轨道的 AudioSource 组件 */
    public get currentSource(): AudioSource | null {
        return this._sources[this._currentTrackIdx] || null;
    }

    /** 获取当前播放的背景音乐资源路径 */
    public get currentPath(): string {
        return this._currentPath;
    }

    /****************  初始化与通道挂载  ****************/

    /** 初始化通道，在 hostNode 上挂载双轨 AudioSource
     * @param hostNode 挂载 AudioSource 的宿主节点
     * @param loadClipFunc 音频加载委托
     * @param releaseClipFunc 音频释放委托
     */
    public init(hostNode: Node, loadClipFunc?: AudioLoadClipFunc | null, releaseClipFunc?: AudioReleaseClipFunc | null): void {
        this._stopTweens();
        this._hostNode = hostNode;
        this._loadClipFunc = loadClipFunc || null;
        this._releaseClipFunc = releaseClipFunc || null;
        const trackA = hostNode.addComponent(AudioSource);
        const trackB = hostNode.addComponent(AudioSource);
        trackA.loop = true;
        trackB.loop = true;
        trackA.volume = 0;
        trackB.volume = 0;
        this._sources = [trackA, trackB];
        this._currentTrackIdx = 0;
        this._currentClip = null;
        this._currentPath = "";
        this._isPaused = false;
    }

    /****************  音乐播放与状态控制  ****************/

    /** 播放背景音乐
     * @param source 音频剪辑实例或资源路径
     * @param options 播放选项
     * @returns 是否成功开始播放
     */
    public async playMusic(source: AudioClip | string, options?: IAudioMusicOptions): Promise<boolean> {
        const serial = ++this._playSerial;
        const bundle = options?.bundle ?? "resources";
        const loop = options?.loop ?? true;
        const relativeVol = options?.volume ?? 1.0;
        const fadeDuration = options?.fadeDuration ?? 0.8;

        let clip: AudioClip | null = null;
        let path = "";

        if (typeof source === "string") {
            path = source;
            try {
                clip = await this._loadClip(path, bundle);
            } catch (e) {
                console.error(`[MusicChannel] Failed to load BGM: ${path} in bundle ${bundle}`, e);
                return false;
            }
        } else {
            clip = source;
            path = clip.name || "custom_clip";
        }

        // 如果在加载期间有新的播放请求发生，则丢弃本次结果并释放加载的资源
        if (serial !== this._playSerial) {
            if (typeof source === "string") {
                this._releaseClip(path, bundle);
            }
            return false;
        }

        if (!clip || !this._hostNode || !isValid(this._hostNode)) {
            if (typeof source === "string") {
                this._releaseClip(path, bundle);
            }
            return false;
        }

        // 如果播放的是当前已经在播放且未暂停的相同曲目，直接调整音量并平衡引用计数
        if (this._currentClip === clip && this.isPlaying && !this._isPaused) {
            if (typeof source === "string") {
                this._releaseClip(path, bundle);
            }
            this._currentRelativeVol = relativeVol;
            this.updateVolume();
            return true;
        }

        const oldPath = this._currentPath;
        const oldBundle = this._currentBundle;

        // 切换到下一个轨道
        const nextTrackIdx = (this._currentTrackIdx + 1) % 2;
        const oldSource = this._sources[this._currentTrackIdx];
        const nextSource = this._sources[nextTrackIdx];

        this._currentTrackIdx = nextTrackIdx;
        this._currentClip = clip;
        this._currentPath = path;
        this._currentBundle = bundle;
        this._currentRelativeVol = relativeVol;
        this._isPaused = false;

        // 准备新轨道
        nextSource.clip = clip;
        nextSource.loop = loop;

        const targetVolume = this._config.getActualMusicVolume(relativeVol);

        // 停止之前的过渡动画并释放可能遗留的旧资源
        this._stopTweens();

        if (fadeDuration <= 0) {
            // 即时切换
            oldSource.stop();
            oldSource.volume = 0;
            if (oldPath && oldPath !== path) {
                this._releaseClip(oldPath, oldBundle);
            }

            nextSource.volume = targetVolume;
            nextSource.play();
        } else {
            // 平滑交叉淡入淡出
            nextSource.volume = 0;
            nextSource.play();

            if (oldPath && oldPath !== path) {
                this._pendingReleasePath = oldPath;
                this._pendingReleaseBundle = oldBundle;
            }

            const oldStartVol = oldSource.volume;
            const state = { oldVol: oldStartVol, newVol: 0 };

            this._activeTween = tween(state)
                .to(fadeDuration, { oldVol: 0, newVol: targetVolume }, {
                    onUpdate: (target?: typeof state) => {
                        if (target) {
                            if (isValid(oldSource)) oldSource.volume = target.oldVol;
                            if (isValid(nextSource)) nextSource.volume = target.newVol;
                        }
                    }
                })
                .call(() => {
                    if (isValid(oldSource)) {
                        oldSource.stop();
                        oldSource.volume = 0;
                    }
                    this._flushPendingRelease();
                    this._activeTween = null;
                })
                .start();
        }

        return true;
    }

    /** 停止背景音乐
     * @param fadeDuration 淡出时间（秒），默认 0.5s
     */
    public stop(fadeDuration: number = 0.5): void {
        this._playSerial++;
        this._stopTweens();

        const curSource = this.currentSource;
        const oldPath = this._currentPath;
        const oldBundle = this._currentBundle;

        this._currentClip = null;
        this._currentPath = "";
        this._isPaused = false;

        if (!curSource || !curSource.playing) {
            if (oldPath) this._releaseClip(oldPath, oldBundle);
            return;
        }

        if (fadeDuration <= 0) {
            curSource.stop();
            curSource.volume = 0;
            if (oldPath) this._releaseClip(oldPath, oldBundle);
        } else {
            this._pendingReleasePath = oldPath;
            this._pendingReleaseBundle = oldBundle;

            const state = { vol: curSource.volume };
            this._activeTween = tween(state)
                .to(fadeDuration, { vol: 0 }, {
                    onUpdate: (target?: typeof state) => {
                        if (target && isValid(curSource)) {
                            curSource.volume = target.vol;
                        }
                    }
                })
                .call(() => {
                    if (isValid(curSource)) {
                        curSource.stop();
                        curSource.volume = 0;
                    }
                    this._flushPendingRelease();
                    this._activeTween = null;
                })
                .start();
        }
    }

    /** 暂停背景音乐 */
    public pause(): void {
        const src = this.currentSource;
        if (src && src.playing) {
            src.pause();
            this._isPaused = true;
        }
    }

    /** 恢复背景音乐 */
    public resume(): void {
        const src = this.currentSource;
        if (src && this._isPaused) {
            src.play();
            this._isPaused = false;
        }
    }

    /** 同步并刷新当前活跃音乐轨道的音量 */
    public updateVolume(): void {
        const curSource = this.currentSource;
        if (!curSource || !curSource.playing) return;

        // 若当前未在淡入淡出动画中，直接应用计算后的音量
        if (!this._activeTween) {
            curSource.volume = this._config.getActualMusicVolume(this._currentRelativeVol);
        }
    }

    /****************  音乐历史栈管理  ****************/

    /** 压入并播放新的背景音乐（保留上一首现场在栈中）
     * @param source 音频剪辑实例或资源路径
     * @param options 播放选项
     * @returns 是否成功开始播放
     */
    public async pushMusic(source: AudioClip | string, options?: IAudioMusicOptions): Promise<boolean> {
        if (this._currentClip || this._currentPath) {
            this._musicStack.push({
                source: this._currentClip || this._currentPath,
                options: {
                    bundle: this._currentBundle,
                    loop: this.currentSource?.loop ?? true,
                    volume: this._currentRelativeVol,
                    fadeDuration: options?.fadeDuration ?? 0.8,
                }
            });
        }
        return this.playMusic(source, options);
    }

    /** 弹出并恢复上一次压入的背景音乐
     * @param fadeDuration 淡入淡出过渡时间（秒）
     * @returns 是否成功恢复上一首音乐
     */
    public async popMusic(fadeDuration?: number): Promise<boolean> {
        if (this._musicStack.length === 0) {
            this.stop(fadeDuration);
            return false;
        }
        const prev = this._musicStack.pop()!;
        const opts = prev.options || {};
        if (fadeDuration !== undefined) {
            opts.fadeDuration = fadeDuration;
        }
        return this.playMusic(prev.source, opts);
    }

    /****************  私有辅助方法  ****************/

    /** 停止正在进行的淡入淡出动画并清理旧资源 */
    private _stopTweens(): void {
        if (this._activeTween) {
            this._activeTween.stop();
            this._activeTween = null;
        }
        this._flushPendingRelease();
    }

    /** 释放尚未清理的旧音乐资源引用 */
    private _flushPendingRelease(): void {
        if (this._pendingReleasePath) {
            this._releaseClip(this._pendingReleasePath, this._pendingReleaseBundle);
            this._pendingReleasePath = "";
            this._pendingReleaseBundle = "";
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
}
