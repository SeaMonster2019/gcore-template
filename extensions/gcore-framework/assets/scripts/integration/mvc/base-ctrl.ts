import { BaseModel } from "./base-model";
import { IMvcParams } from "./mvc-interface";

/** 基础控制器，MVC架构中的逻辑层基类 */
export class BaseCtrl {

    /** 类型id */
    private _tid: number;
    /** 数据模型实例 */
    private _data: BaseModel;

    /** 获取类型id */
    public get tid(): number {
        return this._tid;
    }

    /** 获取数据模型 */
    public get data(): BaseModel {
        return this._data;
    }

    /****************  生命周期  ****************/

    /** 构造函数
     * @param mvcParam MVC参数
     * @param data 数据模型实例
     */
    constructor(mvcParam: IMvcParams, data: BaseModel) {
        this._tid = mvcParam.tid;
        this._data = data;
    }

    /** 初始化回调，注册后由框架自动调用 */
    public onInit() { }

    /** 销毁回调 */
    public onDestroy() { }

}