/** 状态机基类 */
export class BaseFsm {

    /** 状态 */
    private _state: string = "";
    get state(): string {
        return this._state;
    }

    /** 构造函数 */
    constructor() { }

    /** 初始化 */
    public onInit(state: string) {
        this._state = state;
    }

    /** 进入状态 */
    public async onEnter(): Promise<void> { }

    /** 退出状态 */
    public async onExit(): Promise<void> { }

}
