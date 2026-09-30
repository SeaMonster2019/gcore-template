import { Node, Prefab, Component } from "cc";
import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";

/** 视图接口，解耦 mvc 层对具体 BaseView 实现的强依赖 */
export interface IView extends Component {
    getTid(): number;
    getIid(): number;
    onInit(tid: number, iid: number, ctrl: BaseCtrl, model: BaseModel, params?: any): void;
    onOpen(): void;
    onShow(): void;
}

/** 视图参数接口，可由业务层扩展 */
export interface IViewParams {
    /** 关闭回调 */
    onClose?: () => void;
}

/** 视图类型别名，表示通用的 IView 实例 */
export type ViewType = IView;

/** MVC视图ID，从IViewParamMap中提取有效的数字键 */
export type ViewId = keyof IViewParamMap & number;

/** 视图打开参数列表，根据参数类型决定open时是否必填
 * - P为undefined时：无需传参 → []
 * - P所有字段均为可选时：参数可选 → [param?: P]
 * - P存在必填字段时：参数必填 → [param: P]
 * 使用标签元组，IDE中显示为 param 而非 args
 */
export type ViewOpenArgs<P> = P extends undefined ? [] : ({} extends P ? [param?: P] : [param: P]);

/** MVC视图ID到打开参数的映射，可在业务工程中通过模块扩展补充具体视图参数类型 */
export interface IViewParamMap {
    [tid: number]: IViewParams | undefined;
}

/** 视图打开后返回的轻量句柄，避免调用方直接依赖具体View实现 */
export interface IViewHandle {
    /** 类型id */
    readonly tid: number;
    /** 实例id */
    readonly iid: number;
    /** 关闭当前视图实例
     * @param destroy 是否销毁节点
     */
    close(destroy?: boolean): void;
}

/** MVC注册参数，定义一个完整的MVC模块配置 */
export interface IMvcParams {
    /** 类型id，唯一标识一个MVC模块 */
    tid: number;
    /** 预制体路径名 */
    prefabName: string;
    /** 预制体所属资源包名 */
    packName: string;
    /** 层级，用于控制视图的渲染层级 */
    layer: number;
    /** 控制器构造函数 */
    CtrlType?: new (...args: any[]) => BaseCtrl;
    /** 数据模型构造函数 */
    ModelType?: new (...args: any[]) => BaseModel;
    /** 视图构造函数 */
    ViewType: new (...args: any[]) => ViewType;
    /** 视图属性配置 */
    attribute: IViewAttribute;
}

/** 视图属性配置，控制视图的实例策略与适配行为 */
export interface IViewAttribute {
    /** 优先度，同层级下优先度越高越优先渲染 */
    priority?: number;
    /** 是否唯一实例，为true时重复open会复用已有实例 */
    bIsOnly?: boolean;
    /** 是否常驻节点，close时仅隐藏而非销毁（常驻节点必须设置为唯一） */
    bResident?: boolean;
    /** 是否适配屏幕，为true时视图会自动适配可见区域大小 */
    bIsdaptation?: boolean;
}

/** MVC管理器初始化参数 */
export interface IMvcMrgParams {
    /** 视图根节点，所有视图将挂载到此节点下 */
    root: Node;
    /** 预制体异步加载函数，根据预制体名和包名加载Prefab资源 */
    viewPrefabFunc: (prefab: string, pack: string) => Promise<Prefab>;
    /** 预制体释放函数，用于在实例化后释放资源引用 */
    viewPrefabReleaseFunc?: (prefab: string, pack: string) => void;
}

