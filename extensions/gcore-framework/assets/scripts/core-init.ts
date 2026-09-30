import { _decorator, AudioClip, Canvas, Component, EventHandler, isValid, Node, Prefab } from "cc";
import { EventTarget } from "./system/event";
import { gcoreConfig, gcoreStorage } from "./system/storage";
import { gcoreAudio } from "./integration/audio";
import { gcoreMvc } from "./integration/mvc";
import { gcoreRes } from "./integration/res";

const { property, ccclass, menu } = _decorator;

/** GCore初始化组件 */
@ccclass("GCoreInit")
@menu("GCore/GCoreInit")
export class GCoreInit extends Component {

    /** 根节点：用于挂载所有UI界面的根节点，作为UI层级的父节点 */
    @property({ type: Node, displayName: `根节点`, tooltip: `用于挂载所有UI界面的根节点，作为UI层级的父节点` })
    private declare root: Node;

    /** 主画布：主UI画布组件，用于自适应屏幕大小 */
    @property({ type: Canvas, displayName: `主画布`, tooltip: `主UI画布组件，用于自适应屏幕大小` })
    private declare mainCanvas: Canvas;

    /** 游戏开始函数：用于在游戏开始时调用，不用生命周期函数是为了防止初始化顺序错误 */
    @property({ type: EventHandler, displayName: '游戏开始函数', tooltip: '游戏开始函数，用于在游戏开始时调用，不用生命周期函数是为了防止初始化顺序错误' })
    private gameHandler: EventHandler = new EventHandler();

    /****************  生命周期方法  ****************/

    /** 组件加载初始化 */
    protected onLoad(): void {
        this._init();
    }

    /****************  核心初始化  ****************/

    /** 执行框架各单例模块的初始化流程 */
    private _init(): void {
        // 静态注入事件系统的失效校验函数，彻底解除事件系统模块对 cc 的物理导入依赖
        EventTarget.isValidChecker = isValid;

        // 按顺序自主初始化各模块单例
        gcoreStorage.init();
        gcoreRes.init();
        gcoreConfig.init();
        gcoreAudio.init({
            root: this.root || this.node,
            loadClipFunc: (path: string, bundle: string = "resources") => {
                return gcoreRes.loadRes<AudioClip>(path, bundle || "resources");
            },
            releaseClipFunc: (path: string, bundle: string = "resources") => {
                gcoreRes.releaseRes(path, bundle || "resources");
            }
        });
        gcoreMvc.init({
            root: this.root,
            viewPrefabFunc: (prefab: string, pack: string) => {
                return gcoreRes.loadRes<Prefab>(prefab, pack);
            },
            viewPrefabReleaseFunc: (prefab: string, pack: string) => {
                gcoreRes.releaseRes(prefab, pack);
            }
        });

        EventHandler.emitEvents([this.gameHandler], null);
    }
}
