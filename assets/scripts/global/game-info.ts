import { director } from "cc";
import { GCoreEvent, gcoreEvent } from "db://gcore-framework/scripts/system/event";
import { EModule } from "../define/define-view";

/** 游戏全局调试与事件监听信息类 */
class GameInfo {

    /** 初始化事件监听 */
    init(): void {
        director.targetOff(this);
        gcoreEvent.targetOff(this);

        this._initMvcEvent();
        this._initResLoadEvent();
        this._initFsmEvent();
    }

    /** 初始化 MVC 事件监听 */
    private _initMvcEvent(): void {
        gcoreEvent.on(GCoreEvent.MVC_EVENT.REGISTER_VIEW, (tid) => {
            console.log(`[MVC] 注册视图: ${EModule[tid]}`);
        });
        gcoreEvent.on(GCoreEvent.MVC_EVENT.OPEN_VIEW, (tid) => {
            console.log(`%c [MVC] 打开视图: ${EModule[tid]}`, "color:rgb(62, 184, 32)");
        }, this);
        gcoreEvent.on(GCoreEvent.MVC_EVENT.CLOSE_VIEW, (tid) => {
            console.log(`%c [MVC] 关闭视图: ${EModule[tid]}`, "color:rgb(218, 29, 29)");
        }, this);
    }

    /** 初始化资源加载事件监听 */
    private _initResLoadEvent(): void {
        gcoreEvent.on(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, (bundleName) => {
            console.log(`%c [Res] 资源包加载完成: ${bundleName}`, "color:rgb(62, 184, 32)");
        }, this);
    }

    /** 初始化状态机流程切换事件监听 */
    private _initFsmEvent(): void {
        gcoreEvent.on(GCoreEvent.FSM_EVENT.ENTER, (fsmType) => {
            console.log(`%c [FSM] 进入流程: ${fsmType}`, "color:rgb(62, 184, 32)");
        }, this);
        gcoreEvent.on(GCoreEvent.FSM_EVENT.EXIT, (fsmType) => {
            console.log(`%c [FSM] 退出流程: ${fsmType}`, "color:rgb(218, 29, 29)");
        }, this);
    }
}

export const gameInfo = new GameInfo();
