import {
    _decorator,
    Animation,
    animation,
    AnimationClip, AnimationState,
    CCFloat,
    Component, Node,
    RealCurve, RealInterpolationMode,
    Vec3
} from 'cc';
import { EDITOR } from 'cc/env';

const { ccclass, property, menu, executeInEditMode, requireComponent } = _decorator;

/**
 * 节点缩放动画组件
 *
 * 通过动态构建 AnimationClip 实现在最小缩放和最大缩放之间的往返动画。
 * 支持自定义目标节点、缩放范围、持续时间以及循环模式。
 * 依赖 Animation 组件，可在编辑器下实时预览动画效果。
 */
@ccclass('ActionScale')
@menu('GCore/Action/2d/ActionScale')
@requireComponent(Animation)
@executeInEditMode
export class ActionScale extends Component {

    // ==================== 静态只读成员 ====================

    /** 动画剪辑的固定名称，用于查找与清理 */
    public static readonly CLIP_NAME = '__ActionScale_ScaleClip__';

    // ==================== 实例成员 ====================

    /** 缩放动画的实际作用节点，默认为 null 时使用宿主节点自身 */
    private _targetNode: Node | null = null;

    /** 动画到达的最大缩放值，内部存储 */
    @property
    private _maxScale: Vec3 = new Vec3(1.2, 1.2, 1);

    /** 动画起始/回归的最小缩放值，内部存储 */
    @property
    private _minScale: Vec3 = new Vec3(1, 1, 1);

    /** 单程持续时间（最小值→最大值），内部存储 */
    @property
    private _duration: number = 1.0;

    /** 是否循环播放动画，内部存储 */
    @property
    private _loop: boolean = true;

    /** 是否在 onLoad 时自动开始播放动画 */
    @property({ displayName: "OnLoad自动播放" })
    public playOnLoad: boolean = true;

    /** 缓存的 Animation 组件引用 */
    private _animation: Animation | null = null;

    /** 当前播放的 AnimationState 引用 */
    private _state: AnimationState | null = null;

    // ==================== get/set 访问器 ====================

    /** 缩放动画的目标节点，设置为 null 时默认对宿主节点自身执行缩放 */
    @property({ type: Node, displayName: "目标节点" })
    get targetNode() { return this._targetNode; }
    set targetNode(v) {
        if (this._targetNode === v) return;
        this._targetNode = v;
        this._updateAnimation();
    }

    /** 缩放动画的最大值，修改后会自动重新构建动画剪辑 */
    @property({ displayName: "最大缩放" })
    get maxScale() { return this._maxScale; }
    set maxScale(v) { this._maxScale.set(v); this._updateAnimation(); }

    /** 缩放动画的最小值，修改后会自动重新构建动画剪辑 */
    @property({ displayName: "最小缩放" })
    get minScale() { return this._minScale; }
    set minScale(v) { this._minScale.set(v); this._updateAnimation(); }

    /** 缩放动画的持续时间（单位：秒），循环模式下完整周期 = duration * 2 */
    @property({ type: CCFloat, displayName: "持续时间(秒)", min: 0.01 })
    get duration() { return this._duration; }
    set duration(v) { this._duration = v; this._updateAnimation(); }

    /** 是否循环播放缩放动画，非循环模式下仅执行一次 最小→最大 的过渡 */
    @property({ displayName: "是否循环" })
    get loop() { return this._loop; }
    set loop(v) { this._loop = v; this._updateAnimation(); }

    /**************** 生命周期方法  ****************/

    /** 组件启用时获取 Animation 组件并构建动画 */
    onEnable() {
        this._animation = this.getComponent(Animation);
        this._rebuildAndPlay();
    }

    /** 组件禁用时停止动画并还原节点缩放；编辑器模式下会重置目标节点缩放至最小值，避免预览残留 */
    onDisable() {
        this._stopClip();
        // 编辑器下销毁或禁用时还原目标节点缩放，避免残留
        if (EDITOR) {
            const actualTarget = this._targetNode && this._targetNode.isValid ? this._targetNode : this.node;
            if (actualTarget && actualTarget.isValid) {
                actualTarget.setScale(this._minScale);
            }
        }
    }

    /**************** 公共方法  ****************/

    /** 播放缩放动画；编辑器模式下会将动画定格在最大缩放时间点以便视觉预览 */
    public play() {
        if (!this._animation || !this._animation.isValid || !this._state) return;

        this._state.wrapMode = this._loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        this._state.time = 0;
        this._state.play();

        if (EDITOR) {
            // 在场景中改变属性时，将预览定格在最大缩放时间点，方便看到视觉反馈
            this._state.time = this._duration;
            this._state.sample();
        }
    }

    /** 停止缩放动画 */
    public stop() {
        this._stopClip();
    }

    /**************** 私有方法  ****************/

    /** 属性变更后重新构建并播放动画；仅在节点有效且处于层级激活状态时执行 */
    private _updateAnimation() {
        if (!this.isValid || !this.enabledInHierarchy) return;
        this._rebuildAndPlay();
    }

    /** 重建动画剪辑并根据条件播放；编辑器模式下始终播放以便预览 */
    private _rebuildAndPlay() {
        this._buildClip();
        if (this.playOnLoad || EDITOR) {
            this.play();
        }
    }

    /** 动态计算目标节点相对于 Animation 宿主节点的相对路径
     * @param target 目标节点
     * @param root 宿主根节点
     * @returns 相对路径字符串；若 target 不在 root 子树下则返回空字符串
     */
    private _getRelativePath(target: Node, root: Node): string {
        if (target === root) return '';
        const paths: string[] = [];
        let curr: Node | null = target;
        while (curr && curr !== root) {
            paths.push(curr.name);
            curr = curr.parent;
        }
        // 如果寻址树断了，说明 target 不在 root 的子树下，回退根路径
        if (!curr) return '';
        return paths.reverse().join('/');
    }

    /** 动态构建缩放动画剪辑；工作流程：1.清理旧剪辑释放内存 2.创建 VectorTrack 并设置三个通道（x,y,z） 3.根据循环模式设置关键帧：循环=min→max→min，非循环=min→max 4.注册剪辑到 Animation 组件并创建 AnimationState */
    private _buildClip() {
        if (!this._animation || !this._animation.isValid) {
            this._animation = this.getComponent(Animation);
        }
        if (!this._animation) return;

        const clipName = ActionScale.CLIP_NAME;

        this._stopClip();
        this._state = null;

        // 彻底清理旧 clip 释放物理内存，避免编辑器高频刷新引起泄漏
        const existing = this._animation.clips.find(c => c && c.name === clipName);
        if (existing) {
            this._animation.removeClip(existing, true);
            existing.destroy();
        }

        const clip = new AnimationClip();
        clip.name = clipName;
        clip.wrapMode = this._loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;

        const track = new animation.VectorTrack();
        track.componentsCount = 3;

        // 正确寻址，支持宿主节点自身或任意深度的子节点缩放动画
        const actualTarget = this._targetNode && this._targetNode.isValid ? this._targetNode : this.node;
        const relativePath = this._getRelativePath(actualTarget, this.node);
        track.path = new animation.TrackPath().toHierarchy(relativePath).toProperty('scale');

        const halfDur = this._duration;
        const fullDur = this._duration * 2;
        const [chX, chY, chZ] = track.channels();
        const interpMode = RealInterpolationMode.LINEAR;

        const pairs: [RealCurve, number, number][] = [
            [chX.curve, this._minScale.x, this._maxScale.x],
            [chY.curve, this._minScale.y, this._maxScale.y],
            [chZ.curve, this._minScale.z, this._maxScale.z],
        ];

        for (const [curve, minV, maxV] of pairs) {
            if (this._loop) {
                curve.assignSorted([
                    [0, { interpolationMode: interpMode, value: minV }],
                    [halfDur, { interpolationMode: interpMode, value: maxV }],
                    [fullDur, { interpolationMode: interpMode, value: minV }],
                ]);
            } else {
                curve.assignSorted([
                    [0, { interpolationMode: interpMode, value: minV }],
                    [halfDur, { interpolationMode: interpMode, value: maxV }],
                ]);
            }
        }

        clip.addTrack(track);
        clip.duration = this._loop ? fullDur : halfDur;

        this._state = this._animation.createState(clip, clipName);
    }

    /** 停止当前动画状态的播放 */
    private _stopClip() {
        if (this._state && this._state.isPlaying) {
            this._state.stop();
        }
    }
}
