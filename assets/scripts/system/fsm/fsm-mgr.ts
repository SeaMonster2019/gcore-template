import { gcoreEvent, GCoreEvent } from "../event/index";
import { BaseFsm } from "./base-fsm";


export class FsmMgr {

    /** 状态机列表 */
    private _fsmMap: Map<string, new () => BaseFsm> = new Map();
    /** 当前状态 */
    private _currentFsm: BaseFsm | null = null;

    /** 初始化 */
    init() { }

    /** 注册状态 */
    register(type: string, fsm: new () => BaseFsm) {
        this._fsmMap.set(type, fsm);
    }

    /** 进入状态 */
    async enter(type: string) {
        const fsmCtor = this._fsmMap.get(type);
        if (!fsmCtor) {
            console.error(`GFsmMgr: 状态${type}不存在`);
            return;
        }

        if (this._currentFsm) {
            await this._currentFsm.onExit();
            gcoreEvent.emit(GCoreEvent.FSM_EVENT.EXIT, this._currentFsm.state);
        }

        const instance = new fsmCtor();
        await instance.onInit(type);
        await instance.onEnter();
        this._currentFsm = instance;

        gcoreEvent.emit(GCoreEvent.FSM_EVENT.ENTER, type);
    }

}
