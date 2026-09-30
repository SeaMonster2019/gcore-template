import { instantiate, isValid, js, Node, Prefab, screen, UITransform, view } from "cc";
import { gcoreEvent, GCoreEvent } from "../../system/event/index";
import { BaseCtrl } from "./base-ctrl";
import { BaseModel } from "./base-model";
import { IMvcMrgParams, IMvcParams, IViewHandle, IViewParamMap, IViewParams, ViewId, ViewOpenArgs, ViewType } from "./mvc-interface";
import { BaseView } from "./base-view";

/** MVC管理器，负责MVC框架的注册、视图的创建与销毁等核心管理 */
export class MvcMgr {

    /** 初始化参数 */
    private declare _params: IMvcMrgParams;
    /** MVC参数映射表（tid -> IMvcParams） */
    private _paramsMap: Map<number, IMvcParams> = new Map();
    /** 控制器映射表（tid -> BaseCtrl） */
    private _ctrlMap: Map<number, BaseCtrl> = new Map();
    /** 数据模型映射表（tid -> BaseModel） */
    private _modelMap: Map<number, BaseModel> = new Map();
    /** 视图映射表（tid -> 单个View或View数组，多实例时为数组） */
    private _viewMap: Map<number, ViewType | ViewType[]> = new Map();
    /** 正在加载中的视图 Promise 映射表 */
    private _loadingViewMap: Map<number, Promise<IViewHandle>> = new Map();
    /** 实例id自增计数器 */
    private _iid: number = 0;

    /****************  初始化  ****************/

    /** 初始化MVC管理器
     * @param params 初始化参数
     */
    public init(params: IMvcMrgParams) {
        this._params = params;

        BaseView.CloseFunc = (tid: number, iid: number) => {
            this.close(tid, iid);
        }

        // 移除旧监听后重新注册，防止重复绑定
        screen.off('window-resize', this._onWindowResize, this);
        screen.on('window-resize', this._onWindowResize, this);
    }

    /** 注册单个MVC模块，创建对应的Model和Ctrl实例
     * @param params MVC参数
     */
    public register(params: IMvcParams) {
        // 将MVC参数存入映射表
        this._paramsMap.set(params.tid, params);
        // 创建数据模型实例并初始化
        const ModelClass = params.ModelType || BaseModel;
        const newModel = new ModelClass(params);
        newModel.onInit();
        this._modelMap.set(params.tid, newModel);
        // 创建控制器实例并初始化（注入数据模型）
        const CtrlClass = params.CtrlType || BaseCtrl;
        const newCtrl = new CtrlClass(params, newModel);
        newCtrl.onInit();
        this._ctrlMap.set(params.tid, newCtrl);
        // 发送注册视图事件
        gcoreEvent.emit(GCoreEvent.MVC_EVENT.REGISTER_VIEW, params.tid, params);
    }

    /** 批量注册MVC模块
     * @param params MVC参数列表
     * @param complateCallback 单个注册完成回调
     */
    public registerAll(params: Array<IMvcParams>, complateCallback?: (tid: number) => void) {
        for (const param of params) {
            this.register(param);
            complateCallback?.(param.tid);
        }
    }

    /****************  视图操作  ****************/

    /** 打开视图，若为唯一/常驻视图且已有实例则复用，否则创建新实例
     * @typeParam K 视图类型id
     * @param tid 视图类型id
     * @param param 视图参数：若对应参数类型存在必填字段，则此参数必填；否则可省略
     * @returns 视图实例句柄
     */
    public async open<K extends ViewId>(tid: K, ...args: ViewOpenArgs<IViewParamMap[K]>): Promise<IViewHandle> {

        // 根据类型id查找对应的MVC参数
        const mvcParams = this._paramsMap.get(tid);
        if (!mvcParams) {
            throw new Error(`MVC参数不存在: ${tid}`);
        }
        const param = (args[0] ?? {}) as IViewParamMap[K];

        // 检查是否已有实例
        const existing = this._viewMap.get(tid);

        // 如果唯一（bIsOnly）或常驻（bResident），并且已有实例，则直接复用
        if (mvcParams.attribute) {
            const isOnly = !!mvcParams.attribute.bIsOnly;
            const isResident = !!mvcParams.attribute.bResident;

            if (isOnly || isResident) {
                const existView = Array.isArray(existing) ? (existing[0] as ViewType) : (existing as ViewType);
                if (existView) {
                    if (existView.node && isValid(existView.node)) {
                        // 如果被隐藏了，显示它
                        if (!existView.node.active) {
                            existView.node.active = true;
                        }
                        // 触发显示回调
                        existView.onShow();
                        return this._createViewHandle(tid, existView);
                    } else {
                        // 旧实例节点已失效，移除映射，继续创建新实例
                        this._viewMap.delete(tid);
                    }
                }
            }
        }

        // 检查是否正在加载中（仅针对单实例或常驻视图）
        const isOnly = !!mvcParams.attribute?.bIsOnly;
        const isResident = !!mvcParams.attribute?.bResident;
        if (isOnly || isResident) {
            const loading = this._loadingViewMap.get(tid);
            if (loading) {
                return loading;
            }
        }

        const openPromise = (async () => {
            try {
                // 实例化界面节点
                const view = await this._createViewNode(mvcParams, param);
                if (!view) {
                    throw new Error(`视图组件不存在tid:${tid}, 请检查预制体是否正确`);
                }

                // 存储到视图映射表：若允许多个实例则保存数组，否则保存单实例
                const allowMulti = !(mvcParams.attribute && (mvcParams.attribute.bIsOnly || mvcParams.attribute.bResident));
                if (allowMulti) {
                    const entry = this._viewMap.get(tid);
                    if (!entry) {
                        this._viewMap.set(tid, [view]);
                    } else if (Array.isArray(entry)) {
                        entry.push(view);
                    } else {
                        // 将原有单实例转为数组
                        this._viewMap.set(tid, [entry as ViewType, view]);
                    }
                } else {
                    this._viewMap.set(tid, view);
                }

                // 发送打开视图事件
                gcoreEvent.emit(GCoreEvent.MVC_EVENT.OPEN_VIEW, tid, view);

                return this._createViewHandle(tid, view);
            } finally {
                // 无论成功失败，都从加载中映射表移除
                if (isOnly || isResident) {
                    this._loadingViewMap.delete(tid);
                }
            }
        })();

        if (isOnly || isResident) {
            this._loadingViewMap.set(tid, openPromise);
        }

        return openPromise;
    }

    /** 关闭视图，常驻视图仅隐藏，非常驻视图销毁节点
     * @param tid 类型id
     * @param destroy 是否销毁（常驻节点无效）
     * @param iid 实例id，指定关闭多实例中的某个
     */
    public close(tid: number, iid?: number, destroy?: boolean): void {
        const entry = this._viewMap.get(tid);
        if (!entry) return;

        const mvcParams = this._paramsMap.get(tid);
        // 判断是否为常驻视图
        const isResident = !!mvcParams?.attribute?.bResident;

        /** 关闭单个视图的内部逻辑 */
        const closeOne = (v: ViewType) => {
            if (!v || !v.node) return;
            if (!isValid(v.node)) return;
            // 发送关闭视图事件
            gcoreEvent.emit(GCoreEvent.MVC_EVENT.CLOSE_VIEW, tid, v);
            if (isResident) {
                // 常驻视图仅隐藏节点
                v.node.active = false;
            } else {
                // 非常驻视图销毁节点
                v.node.destroy();
            }
        };

        // 多实例处理
        if (Array.isArray(entry)) {
            if (typeof iid === 'number') {
                // 指定关闭某个实例
                const idx = entry.findIndex(it => it.getIid() === iid);
                if (idx >= 0) {
                    const v = entry[idx];
                    closeOne(v);
                    entry.splice(idx, 1);
                }
            } else {
                // 关闭所有同类型实例
                for (const v of entry) {
                    closeOne(v);
                }
                this._viewMap.delete(tid);
            }
            // 如果数组清空则删除映射
            if (entry.length === 0) {
                this._viewMap.delete(tid);
            }
            return;
        }

        // 单实例处理
        const v = entry as ViewType;
        // 如果指定了iid但不匹配，跳过
        if (typeof iid === 'number' && v.getIid() !== iid) {
            return;
        }
        closeOne(v);
        // 非常驻视图从映射表中移除
        if (!isResident) {
            this._viewMap.delete(tid);
        }
    }

    /** 关闭所有视图
     * @param destroy 是否销毁
     * @param excludeTids 排除的tid列表，这些视图不会被关闭
     */
    public closeAll(destroy: boolean, excludeTids?: number[]): void {
        // 收集所有已打开的视图tid
        const allTids = Array.from(this._viewMap.keys());
        // 遍历关闭所有视图
        for (const tid of allTids) {
            if (!excludeTids || excludeTids.indexOf(tid) === -1) {
                this.close(tid, undefined, destroy);
            }
        }
    }

    /****************  数据查询  ****************/

    /** 获取视图实例
     * @typeParam T 视图类型
     * @param tid 类型id
     * @param iid 实例id（多实例时指定具体实例，不传则返回首个）
     * @returns 视图组件
     */
    public getView<T extends ViewType>(tid: number, iid?: number): T {
        const entry = this._viewMap.get(tid);
        if (!entry) return null as any;
        if (Array.isArray(entry)) {
            if (typeof iid === 'number') {
                // 按实例id查找
                return entry.find(v => v.getIid() === iid) as unknown as T || null as any;
            }
            // 返回数组中第一个
            return entry[0] as unknown as T;
        }
        return entry as unknown as T;
    }

    /** 获取指定类型的所有视图实例
     * @param tid 类型id
     * @returns 视图列表
     */
    public getViews(tid: number): Array<ViewType> {
        const entry = this._viewMap.get(tid);
        if (!entry) return [];
        if (Array.isArray(entry)) return entry;
        return [entry];
    }

    /** 获取数据模型
     * @typeParam T 数据模型类型
     * @param type 类型id或模型类
     * @returns 数据模型实例
     */
    public getModel<T extends BaseModel>(type: number | (new (...args: any[]) => T)): T {
        if (typeof type === 'number') {
            // 按类型id查找
            return this._modelMap.get(type) as T;
        } else {
            // 按类类型遍历查找
            for (const [, value] of this._modelMap) {
                if (value instanceof type) {
                    return value;
                }
            }
        }
        throw new Error(`数据模型不存在: ${type.name}`);
    }

    /** 获取控制器
     * @typeParam T 控制器类型
     * @param type 类型id或控制器类
     * @returns 控制器实例
     */
    public getCtrl<T extends BaseCtrl>(type: number | (new (...args: any[]) => T)): T {
        if (typeof type === 'number') {
            // 按类型id查找
            return this._ctrlMap.get(type) as T;
        } else {
            // 按类类型遍历查找
            for (const [, value] of this._ctrlMap) {
                if (value instanceof type) {
                    return value;
                }
            }
        }
        throw new Error(`控制器不存在: ${type.name}`);
    }

    /****************  私有方法  ****************/

    /** 创建视图节点，加载预制体并实例化
     * @param mvcParams MVC参数
     * @param viewParams 视图参数
     * @returns 视图组件或null
     */
    private async _createViewNode(mvcParams: IMvcParams, viewParams?: IViewParams): Promise<ViewType | null> {

        // 通过加载函数获取Prefab资源
        const prefab = await this._params.viewPrefabFunc(mvcParams.prefabName, mvcParams.packName);

        if (!prefab) {
            console.error(`预制体不存在: ${mvcParams.prefabName}, tid:${mvcParams.tid}, 请检查预制体是否正确`);
            return null;
        }

        // 实例化预制体，创建新的节点
        const newNode = instantiate(prefab);

        // 设置新节点的父节点为根节点
        newNode.setParent(this._params.root);

        // 如果需要适配，则设置节点大小为父节点大小
        if (mvcParams.attribute?.bIsdaptation) {
            const uit = newNode.getComponent(UITransform);
            const parentUIT = this._params.root.getComponent(UITransform);
            if (uit && parentUIT) {
                uit.setContentSize(parentUIT.width, parentUIT.height);
            }
        }

        // 初始化View组件
        const view = this._initViewNode(newNode, mvcParams, viewParams);
        if (!view) {
            console.error(`视图组件不存在tid:${mvcParams.tid}, 请检查预制体是否正确`);
            newNode.destroy();
            return null;
        }

        return view;
    }

    /** 初始化视图组件并绑定控制器、数据模型和参数
     * @param newNode 新节点
     * @param mvcParams MVC参数
     * @param viewParams 视图参数
     * @returns 视图组件或null
     */
    private _initViewNode(newNode: Node, mvcParams: IMvcParams, viewParams?: IViewParams): ViewType | null {
        // 从节点上获取视图组件
        const view = newNode.getComponent(mvcParams.ViewType);

        // 如果没有获取到视图组件，报错并返回
        if (!view) {
            console.error(`视图组件不存在tid:${mvcParams.tid}, 请检查预制体是否正确`);
            return null;
        }

        const tid = mvcParams.tid;

        // 获取已注册的控制器和数据模型
        const ctrl = this._ctrlMap.get(tid);
        const model = this._modelMap.get(tid);
        if (!ctrl || !model) {
            console.error(`控制器或数据模型不存在tid:${mvcParams.tid}, 请检查控制器或数据模型是否正确`);
            return null;
        }

        // 初始化视图，注入tid、iid、控制器、数据模型和参数
        view.onInit(tid, this._getIid(), ctrl, model, viewParams || {});

        // 如果需要适配，执行适配逻辑
        if (mvcParams.attribute?.bIsdaptation) {
            this._adaptation(view.node);
        }

        // 依次触发视图打开和显示回调
        view.onOpen();
        view.onShow();

        return view;
    }

    /** 创建视图句柄，封装tid、iid和close方法
     * @param tid 类型id
     * @param view 视图实例
     * @returns 视图实例句柄
     */
    private _createViewHandle(tid: number, view: ViewType): IViewHandle {
        const iid = view.getIid();
        return {
            tid,
            iid,
            close: (destroy?: boolean) => {
                this.close(tid, iid, destroy);
            },
        };
    }

    /** 窗口大小改变回调，对需要适配的视图重新适配 */
    private _onWindowResize() {
        for (const [tid, entry] of this._viewMap) {
            const param = this._paramsMap.get(tid);
            // 跳过不需要适配的视图
            if (!param || !param.attribute?.bIsdaptation) continue;

            if (Array.isArray(entry)) {
                // 多实例遍历适配
                for (const v of entry) {
                    if (!v || !v.node) continue;
                    if (!isValid(v.node)) continue;
                    this._adaptation(v.node);
                }
            } else {
                // 单实例适配
                const v = entry as ViewType;
                if (!v || !v.node) continue;
                if (!isValid(v.node)) continue;
                this._adaptation(v.node);
            }
        }
    }

    /** 根据可见区域适配节点大小
     * @param node 需要适配的节点
     */
    private _adaptation(node: Node) {
        const uit = node.getComponent(UITransform);
        if (!uit) {
            return;
        }
        // 获取当前可见区域大小并设置节点尺寸
        const visibleSize = view.getVisibleSize();
        uit.setContentSize(visibleSize.width, visibleSize.height);
    }

    /** 获取自增的实例id
     * @returns 新的实例id
     */
    private _getIid(): number {
        return this._iid++;
    }
}
