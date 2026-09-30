import { AudioClip, game, Game, isValid, Node } from "cc";
import { EffectChannel } from "./audio-channel-effect";
import { MusicChannel } from "./audio-channel-music";
import { AudioConfig } from "./audio-config";
import { AudioLoadClipFunc, AudioReleaseClipFunc, IAudioConfigData, IAudioEffectOptions, IAudioInitOptions, IAudioMusicOptions } from "./audio-types";

/** GCore 音频管理器
 * 统一门面单例，提供无心智负担的背景音乐、音效、音量控制及系统生命周期管理
 */
export class AudioMgr {

    /** 挂载音频组件的专用节点名称 */
    public static readonly HOST_NODE_NAME = "__GCore_Audio_Host__";

    /** 音频配置管理器实例 */
    private _config: AudioConfig = new AudioConfig();
    /** 背景音乐通道实例 */
    private _musicChannel: MusicChannel = new MusicChannel(this._config);
    /** 音效通道实例 */
    private _effectChannel: EffectChannel = new EffectChannel(this._config);
    /** 挂载音频组件的宿主节点 */
    private _audioHostNode: Node | null = null;
    /** 是否已经完成初始化 */
    private _isInitialized: boolean = false;
    /** 切后台前背景音乐是否正在播放 */
    private _wasMusicPlayingBeforeHide: boolean = false;

    /****************  生命周期与初始化  ****************/

    /** 初始化音频管理器（支持依赖注入资源加载委托）
     * @param optionsOrRoot 框架根节点或初始化配置对象
     * @param loadClipFunc 音频资源加载委托（当首参为 Node 时有效）
     * @param releaseClipFunc 音频资源释放委托（当首参为 Node 时有效）
     */
    public init(optionsOrRoot: Node | IAudioInitOptions, loadClipFunc?: AudioLoadClipFunc, releaseClipFunc?: AudioReleaseClipFunc): void {
        let root: Node;
        let loaderFunc: AudioLoadClipFunc | undefined = loadClipFunc;
        let releaserFunc: AudioReleaseClipFunc | undefined = releaseClipFunc;

        if (optionsOrRoot instanceof Node) {
            root = optionsOrRoot;
        } else {
            root = optionsOrRoot.root;
            loaderFunc = optionsOrRoot.loadClipFunc || loaderFunc;
            releaserFunc = optionsOrRoot.releaseClipFunc || releaserFunc;
        }

        if (!root || !isValid(root)) {
            console.warn("[AudioMgr] 初始化失败：无效的 root 节点");
            return;
        }

        // 如果当前 hostNode 已经存在且有效，并且正是挂载在当前的 root 上，直接返回避免重复初始化
        if (this._audioHostNode && isValid(this._audioHostNode) && this._audioHostNode.parent === root) {
            return;
        }

        // 初始化配置与系统监听（全局单例只绑定一次）
        if (!this._isInitialized) {
            this._config.init();
            this._config.setListeners(
                () => this._musicChannel.updateVolume(),
                () => this._effectChannel.updateVolume()
            );

            game.off(Game.EVENT_HIDE, this._onAppHide, this);
            game.off(Game.EVENT_SHOW, this._onAppShow, this);
            game.on(Game.EVENT_HIDE, this._onAppHide, this);
            game.on(Game.EVENT_SHOW, this._onAppShow, this);
            this._isInitialized = true;
        }

        // 检查 root 下是否已经存在同名历史节点（如场景重启或多次触发），有则安全清理
        const existingHost = root.getChildByName(AudioMgr.HOST_NODE_NAME);
        if (existingHost && isValid(existingHost)) {
            existingHost.destroy();
        }

        // 创建唯一的音频挂载专用子节点
        const host = new Node(AudioMgr.HOST_NODE_NAME);
        root.addChild(host);
        this._audioHostNode = host;

        // 初始化/重新初始化各音频通道（注入资源加载与释放能力）
        this._musicChannel.init(host, loaderFunc, releaserFunc);
        this._effectChannel.init(host, loaderFunc, releaserFunc);
    }

    /** 获取挂载音频组件的 Host 节点
     * @returns 挂载音频组件的宿主节点
     */
    public getHostNode(): Node | null {
        return this._audioHostNode;
    }

    /** 销毁并清理音频管理器与事件监听 */
    public destroy(): void {
        game.off(Game.EVENT_HIDE, this._onAppHide, this);
        game.off(Game.EVENT_SHOW, this._onAppShow, this);

        this.stopMusic(0);
        this.stopAllEffects();

        if (this._audioHostNode && isValid(this._audioHostNode)) {
            this._audioHostNode.destroy();
            this._audioHostNode = null;
        }

        this._isInitialized = false;
    }

    /****************  背景音乐 (BGM)  ****************/

    /** 播放背景音乐
     * @param source 音频剪辑或资源路径
     * @param options 播放选项（支持淡入淡出、循环、分包等）
     * @returns 是否成功开始播放
     */
    public playMusic(source: AudioClip | string, options?: IAudioMusicOptions): Promise<boolean> {
        return this._musicChannel.playMusic(source, options);
    }

    /** 压入并播放临时背景音乐（进入战斗/副场景时使用，退出时调用 popMusic 恢复）
     * @param source 音频剪辑或资源路径
     * @param options 播放选项
     * @returns 是否成功开始播放
     */
    public pushMusic(source: AudioClip | string, options?: IAudioMusicOptions): Promise<boolean> {
        return this._musicChannel.pushMusic(source, options);
    }

    /** 弹出并恢复上一次压入的背景音乐
     * @param fadeDuration 淡入淡出过渡时间（秒）
     * @returns 是否成功恢复上一首音乐
     */
    public popMusic(fadeDuration?: number): Promise<boolean> {
        return this._musicChannel.popMusic(fadeDuration);
    }

    /** 停止背景音乐
     * @param fadeDuration 淡出时长（秒），默认为 0.5s
     */
    public stopMusic(fadeDuration: number = 0.5): void {
        this._musicChannel.stop(fadeDuration);
    }

    /** 暂停背景音乐 */
    public pauseMusic(): void {
        this._musicChannel.pause();
    }

    /** 恢复背景音乐 */
    public resumeMusic(): void {
        this._musicChannel.resume();
    }

    /** 背景音乐是否正在播放
     * @returns 当前背景音乐是否正在播放
     */
    public isMusicPlaying(): boolean {
        return this._musicChannel.isPlaying;
    }

    /** 获取当前播放的背景音乐路径
     * @returns 当前背景音乐的资源路径
     */
    public getCurrentMusicPath(): string {
        return this._musicChannel.currentPath;
    }

    /****************  音效 (SFX)  ****************/

    /** 播放音效
     * @param source 音频剪辑或资源路径
     * @param options 播放选项（音量、循环、防重复节流、回调等）
     * @returns 音效句柄 audioId (>0 表示成功，可用于单独停止或调音量)
     */
    public playEffect(source: AudioClip | string, options?: IAudioEffectOptions): Promise<number> {
        return this._effectChannel.playEffect(source, options);
    }

    /** 停止指定音效
     * @param audioId 由 playEffect 返回的音效句柄
     */
    public stopEffect(audioId: number): void {
        this._effectChannel.stopEffect(audioId);
    }

    /** 停止所有正在播放的音效 */
    public stopAllEffects(): void {
        this._effectChannel.stopAllEffects();
    }

    /** 动态设置指定音效实例的相对音量
     * @param audioId 音效句柄
     * @param volume 相对音量 (0.0 ~ 1.0)
     */
    public setEffectInstanceVolume(audioId: number, volume: number): void {
        this._effectChannel.setEffectInstanceVolume(audioId, volume);
    }

    /** 暂停所有音效 */
    public pauseAllEffects(): void {
        this._effectChannel.pauseAll();
    }

    /** 恢复所有音效 */
    public resumeAllEffects(): void {
        this._effectChannel.resumeAll();
    }

    /****************  全局配置与音量控制  ****************/

    /** 设置主音量
     * @param volume 主音量数值 (0.0 ~ 1.0)
     */
    public setMasterVolume(volume: number): void {
        this._config.masterVolume = volume;
    }

    /** 获取主音量
     * @returns 主音量数值 (0.0 ~ 1.0)
     */
    public getMasterVolume(): number {
        return this._config.masterVolume;
    }

    /** 设置主静音状态
     * @param mute 是否主静音
     */
    public setMasterMute(mute: boolean): void {
        this._config.masterMuted = mute;
    }

    /** 是否主静音
     * @returns 当前主静音状态
     */
    public isMasterMuted(): boolean {
        return this._config.masterMuted;
    }

    /** 设置背景音乐音量
     * @param volume 背景音乐音量数值 (0.0 ~ 1.0)
     */
    public setMusicVolume(volume: number): void {
        this._config.musicVolume = volume;
    }

    /** 获取背景音乐音量
     * @returns 背景音乐音量数值 (0.0 ~ 1.0)
     */
    public getMusicVolume(): number {
        return this._config.musicVolume;
    }

    /** 设置背景音乐静音状态
     * @param mute 是否静音背景音乐
     */
    public setMusicMute(mute: boolean): void {
        this._config.musicMuted = mute;
    }

    /** 背景音乐是否静音
     * @returns 背景音乐静音状态
     */
    public isMusicMuted(): boolean {
        return this._config.musicMuted;
    }

    /** 设置音效应量
     * @param volume 音效应量数值 (0.0 ~ 1.0)
     */
    public setEffectVolume(volume: number): void {
        this._config.effectVolume = volume;
    }

    /** 获取音效应量
     * @returns 音效应量数值 (0.0 ~ 1.0)
     */
    public getEffectVolume(): number {
        return this._config.effectVolume;
    }

    /** 设置音效应量静音状态
     * @param mute 是否静音音效
     */
    public setEffectMute(mute: boolean): void {
        this._config.effectMuted = mute;
    }

    /** 音效是否静音
     * @returns 音效静音状态
     */
    public isEffectMuted(): boolean {
        return this._config.effectMuted;
    }

    /** 批量应用音频配置（常用于业务层加载存档后同步给框架）
     * @param config 部分或完整的音频配置
     */
    public setConfig(config: Partial<IAudioConfigData>): void {
        this._config.setConfig(config);
    }

    /** 获取完整的音频配置快照
     * @returns 完整的音频配置快照
     */
    public getConfig(): IAudioConfigData {
        return this._config.getConfig();
    }

    /** 暂停所有音频（BGM 与 音效，例如弹窗全局暂停游戏时调用） */
    public pauseAll(): void {
        this._musicChannel.pause();
        this._effectChannel.pauseAll();
    }

    /** 恢复所有音频 */
    public resumeAll(): void {
        this._musicChannel.resume();
        this._effectChannel.resumeAll();
    }

    /****************  系统切后台响应  ****************/

    /** 应用切入后台时的自动暂停处理 */
    private _onAppHide(): void {
        this._wasMusicPlayingBeforeHide = this._musicChannel.isPlaying && !this._musicChannel.isPaused;
        if (this._wasMusicPlayingBeforeHide) {
            this._musicChannel.pause();
        }
        this._effectChannel.pauseAll();
    }

    /** 应用切回前台时的自动恢复处理 */
    private _onAppShow(): void {
        if (this._wasMusicPlayingBeforeHide) {
            this._musicChannel.resume();
            this._wasMusicPlayingBeforeHide = false;
        }
        this._effectChannel.resumeAll();
    }
}
