import { _decorator, AudioClip, Button, Component, Node } from "cc";
import { gcoreAudio } from "../index";

const { ccclass, property, menu, disallowMultiple } = _decorator;

/** 按钮点击音效组件
 * 挂载于带有 Button 的节点上，点击时自动调用 gcoreAudio.playEffect 播放音效
 */
@ccclass("AudioButton")
@menu("GCore/Audio/AudioButton")
@disallowMultiple(true)
export class AudioButton extends Component {

    /** 音效资源相对路径 (如: audio/click) */
    @property({ displayName: "音效路径", tooltip: "音效资源相对路径 (如: audio/click)" })
    public soundPath: string = "audio/click";

    /** 音效所在的 Bundle 名字，默认为 resources */
    @property({ displayName: "资源包", tooltip: "音效所在的 Bundle 名字，默认为 resources" })
    public bundle: string = "resources";

    /** 可选：直接挂载 AudioClip 资源，优先级高于路径 */
    @property({ type: AudioClip, displayName: "直接指定Clip", tooltip: "可选：直接挂载 AudioClip 资源，优先级高于路径" })
    public soundClip: AudioClip | null = null;

    /** 点击音效相对音量比例 (0.0 ~ 1.0) */
    @property({ displayName: "音量比例", range: [0, 1, 0.05], slide: true, tooltip: "点击音效相对音量比例 (0.0 ~ 1.0)" })
    public volume: number = 1.0;

    /****************  生命周期方法  ****************/

    /** 组件加载初始化监听 */
    protected onLoad(): void {
        const btn = this.getComponent(Button);
        if (btn) {
            this.node.on(Button.EventType.CLICK, this._onClick, this);
        } else {
            this.node.on(Node.EventType.TOUCH_END, this._onClick, this);
        }
    }

    /** 组件销毁注销监听 */
    protected onDestroy(): void {
        const btn = this.getComponent(Button);
        if (btn) {
            this.node.off(Button.EventType.CLICK, this._onClick, this);
        } else {
            this.node.off(Node.EventType.TOUCH_END, this._onClick, this);
        }
    }

    /****************  事件回调处理  ****************/

    /** 响应点击事件并播放指定音效 */
    private _onClick(): void {
        const source = this.soundClip || this.soundPath;
        if (source) {
            gcoreAudio.playEffect(source, {
                bundle: this.bundle,
                volume: this.volume,
            });
        }
    }

}
