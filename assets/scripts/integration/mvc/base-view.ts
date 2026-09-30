import { BaseUi } from "../ui/index";
import { gcoreEvent } from "../../system/event/index";
import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";
import { IViewParams, IView } from "./mvc-interface";

/** 视图基类，MVC架构中的视图层基类，继承自UiComp */
export class BaseView<P extends IViewParams | undefined = undefined> extends BaseUi implements IView {

    /** 关闭当前视图的方法，由框架在初始化时绑定 */
    public static CloseFunc: (tid: number, iid: number) => void;

    /** 类型id */
    protected declare _tid: number;
    /** 实例id */
    protected declare _iid: number;
    /** 关联的控制器实例 */
    protected declare _ctrl: BaseCtrl;
    /** 关联的数据模型实例 */
    protected declare _model: BaseModel;
    /** 视图参数 */
    protected declare _params: P;

    /****************  生命周期  ****************/

    /** 初始化视图，由框架在创建视图实例时自动调用
     * @param tid 类型id
     * @param iid 实例id
     * @param baseCtrl 控制器实例
     * @param baseData 数据模型实例
     * @param viewParams 视图参数
     */
    public onInit(tid: number, iid: number, baseCtrl: BaseCtrl, baseData: BaseModel, viewParams: P) {
        this._ctrl = baseCtrl;
        this._model = baseData;
        this._tid = tid;
        this._iid = iid;
        this._params = viewParams;
    }

    /** 视图打开回调，节点首次创建并显示后触发 */
    public onOpen(): void { }

    /** 视图显示回调，复用已有实例时触发 */
    public onShow(): void { }

    /****************  公共方法  ****************/

    /** 获取类型id
     * @returns 类型id
     */
    public getTid(): number {
        return this._tid;
    }

    /** 获取实例id
     * @returns 实例id
     */
    public getIid(): number {
        return this._iid;
    }

    /****************  保护方法  ****************/

    /** 关闭按钮点击事件，调用框架绑定的close方法 */
    protected onBtnClose(): void {
        this.close();
    }

    /** 关闭 */
    protected close() {
        BaseView.CloseFunc?.(this._tid, this._iid);
    }

}
