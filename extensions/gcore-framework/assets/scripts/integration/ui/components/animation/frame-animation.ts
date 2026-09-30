import { _decorator, Animation, AnimationClip, CCFloat, Component, Enum, Sprite, SpriteFrame } from 'cc';
export enum EFrameAnimationCurve {
    Linear = 'linear',
    Smooth = 'smooth',
    Fade = 'fade',
    Constant = 'constant',
    QuadIn = 'quadIn',
    QuadOut = 'quadOut',
    QuadInOut = 'quadInOut',
    QuadOutIn = 'quadOutIn',
    CubicIn = 'cubicIn',
    CubicOut = 'cubicOut',
    CubicInOut = 'cubicInOut',
    CubicOutIn = 'cubicOutIn',
    QuartIn = 'quartIn',
    QuartOut = 'quartOut',
    QuartInOut = 'quartInOut',
    QuartOutIn = 'quartOutIn',
    QuintIn = 'quintIn',
    QuintOut = 'quintOut',
    QuintInOut = 'quintInOut',
    QuintOutIn = 'quintOutIn',
    SineIn = 'sineIn',
    SineOut = 'sineOut',
    SineInOut = 'sineInOut',
    SineOutIn = 'sineOutIn',
    ExpoIn = 'expoIn',
    ExpoOut = 'expoOut',
    ExpoInOut = 'expoInOut',
    ExpoOutIn = 'expoOutIn',
    CircIn = 'circIn',
    CircOut = 'circOut',
    CircInOut = 'circInOut',
    CircOutIn = 'circOutIn',
    ElasticIn = 'elasticIn',
    ElasticOut = 'elasticOut',
    ElasticInOut = 'elasticInOut',
    ElasticOutIn = 'elasticOutIn',
    BackIn = 'backIn',
    BackOut = 'backOut',
    BackInOut = 'backInOut',
    BackOutIn = 'backOutIn',
    BounceIn = 'bounceIn',
    BounceOut = 'bounceOut',
    BounceInOut = 'bounceInOut',
    BounceOutIn = 'bounceOutIn'
}

const { ccclass, property, menu, requireComponent, executeInEditMode } = _decorator;

/** 程序化帧动画组件（使用 AnimationClip / Animation） */
@ccclass('FrameAnimation')
@menu(`GCore/Animation/FrameAnimation`)
@requireComponent(Sprite)
@requireComponent(Animation)
@executeInEditMode
export class FrameAnimation extends Component {

    /** 序列帧图片列表 */
    @property([SpriteFrame]) 
    protected spriteFrames: SpriteFrame[] = [];
    /** 播放速度（帧/秒） */
    @property({ type: CCFloat, displayName: "播放速度(帧/秒)", min: 0.1, tooltip: "每秒播放的帧数" })
    playSpeed: number = 10;
    /** 是否循环播放 */
    @property({ displayName: "循环播放", tooltip: "动画是否循环播放" })
    loop: boolean = true;
    /** 时间轴曲线类型 */
    @property({ type: Enum(EFrameAnimationCurve), displayName: "时间轴曲线", tooltip: "使用 Cocos Creator 内置 easing 曲线控制关键帧间的时间插值" })
    curve: EFrameAnimationCurve = EFrameAnimationCurve.Linear;

    /** 默认起始帧 */
    @property({ displayName: "起始帧", tooltip: "播放时默认从第几帧开始，索引从 0 开始" })
    startFrameIndex: number = 0;

    @property({ displayName: "编辑器预览", tooltip: "在编辑器中勾选以预览动画" })
    get preview(): boolean { return this._preview; }
    set preview(val: boolean) {
        this._preview = !!val;
        if (this._preview) {
            this._initAnimation();
            this.play();
        } else {
            this.stop();
        }
    }
    private _preview: boolean = false;

    /** Animation 组件引用 */
    private _animation?: Animation;
    /** Sprite 组件引用 */
    private _sprite?: Sprite;
    /** 动画剪辑实例 */
    private _clip?: AnimationClip;
    /** 动画剪辑名称（唯一标识） */
    private _clipName: string = '__frame_animation_clip__';
    /** 当前播放的帧索引 */
    private _currentFrameIndex: number = 0;

    /** 动态精灵帧列表，资源生命周期由调用方管理 */
    private _dynamicSpriteFrames: SpriteFrame[] = [];

    /** 获取精灵帧 */
    private get _spriteFrames(): SpriteFrame[] {
        return this._dynamicSpriteFrames.length > 0 ? this._dynamicSpriteFrames : this.spriteFrames || [];
    }

    /****************  生命周期方法  ****************/

    /** 组件加载时初始化 */
    onLoad() {
        this._sprite = this.getComponent(Sprite) || undefined;
        this._initAnimation();
    }

    /** 组件销毁时清理资源 */
    onDestroy() {
        if (this._animation) {
            try {
                this._animation.stop();
                if (this._clip) {
                    this._animation.removeClip(this._clip, true);
                }
            } catch (e) { }
        }
        this._clip = undefined;
        this._dynamicSpriteFrames = [];
    }

    /****************  播放控制方法  ****************/

    /** 播放动画（可从指定帧开始）
     * @returns 是否成功播放
     */
    public play(startFrameIndex?: number): boolean {
        if (!this._animation) {
            console.warn('[FrameAnimation] Animation 未正确初始化');
            return false;
        }

        if (!this._clip) {
            // 尝试创建剪辑（可能在编辑器中动态设置了帧）
            this._createAnimationClip();
            if (!this._clip) {
                console.warn('[FrameAnimation] AnimationClip 无法创建');
                return false;
            }
        }

        const frameIndex = this._resolveStartFrameIndex(startFrameIndex);
        this._animation.play(this._clipName);
        this._setAnimationFrameIndex(frameIndex);
        return true;
    }

    /** 从随机帧开始播放动画 */
    public playRandomFrame(): void {
        const frames = this._spriteFrames;
        if (frames.length === 0) return;
        const randomIndex = Math.floor(Math.random() * frames.length);
        this.play(randomIndex);
    }

    /** 暂停动画 */
    public pause(): void {
        if (this._animation) {
            this._animation.pause();
        }
    }

    /** 继续播放（从暂停处恢复） */
    public resume(): void {
        if (this._animation) {
            this._animation.resume();
        }
    }

    /** 停止动画并回到第一帧
     * @returns 是否成功停止
     */
    public stop(): boolean {
        if (this._animation) {
            this._animation.stop();
        }
        this._currentFrameIndex = 0;
        this._updateSpriteFrame(0);
        return true;
    }

    /****************  状态查询方法  ****************/

    /** 获取当前帧索引
     * @returns 当前帧索引（从 0 开始）
     */
    public getCurrentFrameIndex(): number {
        return this._currentFrameIndex;
    }

    /** 获取当前帧的 SpriteFrame
     * @returns 当前帧图片，索引越界时返回 null
     */
    public getCurrentFrame(): SpriteFrame | null {
        const frames = this._spriteFrames;
        if (this._currentFrameIndex >= 0 && this._currentFrameIndex < frames.length) {
            return frames[this._currentFrameIndex];
        }
        return null;
    }

    /** 检查动画是否正在播放
     * @returns 是否正在播放
     */
    public isPlaying(): boolean {
        if (!this._animation) return false;
        const state = this._animation.getState(this._clipName);
        return !!(state && state.isPlaying);
    }

    /****************  帧控制方法  ****************/

    /** 跳转到指定帧
     * @param index 目标帧索引（从 0 开始）
     */
    public setFrameIndex(index: number): void {
        // 校验索引范围
        const frames = this._spriteFrames;
        if (index < 0 || index >= frames.length) {
            console.warn(`[FrameAnimation] 帧索引 ${index} 超出范围`);
            return;
        }
        this._setAnimationFrameIndex(index);
        this._currentFrameIndex = index;
        this._updateSpriteFrame(index);
    }

    /****************  设置参数  ****************/

    /** 设置精灵帧列表
     * @param frames 精灵帧数组
     */
    public setSpriteFrames(frames: SpriteFrame[]): void {
        if (frames.length === 0) {
            this.stop();
            this._dynamicSpriteFrames = [];
            return;
        }

        const wasPlaying = this.isPlaying();
        this._dynamicSpriteFrames = frames.slice();
        this._initAnimation();
        if (wasPlaying || this._preview) {
            this.play();
        } else {
            this.stop();
        }
    }

    /****************  私有辅助方法  ****************/

    /** 初始化 Animation 组件 */
    private _initAnimation(): void {
        // 获取或添加 Animation 组件
        this._animation = this.getComponent(Animation) || this.addComponent(Animation) as Animation;
        if (this._spriteFrames.length > 0) {
            this._createAnimationClip();
        } else {
            // 清除旧剪辑引用
            this._clip = undefined;
        }
    }

    /** 程序化创建 AnimationClip */
    private _createAnimationClip(): void {
        const frames = this._spriteFrames;
        if (frames.length === 0 || !this._animation) return;

        const sample = Math.max(Math.floor(this.playSpeed), 1);
        const generatedClip = AnimationClip.createWithSpriteFrames(frames, sample);
        generatedClip.name = this._clipName;
        generatedClip.wrapMode = this.loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        this._applyTimelineCurve(generatedClip);

        try {
            if (!this._clip) {
                // 直接使用生成的实例
                this._clip = generatedClip;
                this._animation.addClip(this._clip, this._clipName);
            } else {
                // 如果已有 clip，则替换其可变数据以避免重复注册
                this._copyClipData(this._clip, generatedClip);
                // 确保 Animation 组件注册了该 clip
                if (!this._animation.getState(this._clipName)) {
                    this._animation.addClip(this._clip, this._clipName);
                }
                // 销毁中间生成体以释放资源（若引擎要求）
                try { generatedClip.destroy(); } catch (e) { }
            }
        } catch (e) {
            console.warn('[FrameAnimation] _createAnimationClip 发生异常', e);
        }
    }

    /** 解析起始帧索引 */
    private _resolveStartFrameIndex(startFrameIndex?: number): number {
        const resolvedIndex = startFrameIndex ?? this.startFrameIndex;
        if (resolvedIndex < 0) {
            return 0;
        }
        if (resolvedIndex >= this._spriteFrames.length) {
            return Math.max(this._spriteFrames.length - 1, 0);
        }
        return Math.floor(resolvedIndex);
    }

    /** 同步动画状态到指定帧 */
    private _setAnimationFrameIndex(index: number): void {
        if (!this._animation || !this._clip) {
            return;
        }
        const state = this._animation.getState(this._clipName);
        if (!state) return;
        state.time = index / Math.max(this.playSpeed, 0.0001);
    }

    /** 更新 Sprite 显示的帧
     * @param index 帧索引
     */
    private _updateSpriteFrame(index: number): void {
        const frames = this._spriteFrames;
        if (index < 0 || index >= frames.length) return;
        this._sprite = this._sprite || this.getComponent(Sprite) || undefined;
        if (this._sprite) this._sprite.spriteFrame = frames[index];
    }

    /** 应用 Cocos Creator 内置时间轴曲线
     * @param clip 目标动画剪辑
     */
    private _applyTimelineCurve(clip: AnimationClip): void {
        // 获取曲线类型（默认 Linear）
        const easingMethod = this.curve || EFrameAnimationCurve.Linear;

        // 遍历所有曲线数据并应用 easing
        for (const curve of clip.curves) {
            if (curve && curve.data) {
                curve.data.easingMethod = easingMethod;
                curve.data.easingMethods = undefined;
            }
        }

        // 同步遗留数据
        clip.syncLegacyData();
    }

    /** 复用现有剪辑实例并替换其内容 */
    private _copyClipData(target: AnimationClip, source: AnimationClip): void {
        target.sample = source.sample;
        target.speed = source.speed;
        target.wrapMode = source.wrapMode;
        target.duration = source.duration;
        target.events = source.events;
        target.keys = source.keys;
        target.curves = source.curves;
        target.commonTargets = source.commonTargets;
        target.syncLegacyData();
    }

}
