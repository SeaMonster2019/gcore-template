type EventCallback = (...args: any[]) => void;
type IsValidChecker = (target: any) => boolean;

interface IEventCallbackInfo {
    callback: EventCallback;
    target?: any;
    once?: boolean;
}

export class EventTarget {

    /** 运行时状态判定函数，可由外部依赖注入（例如传入 Cocos 的 isValid），以实现防内存泄露 */
    public static isValidChecker: IsValidChecker | null = null;

    private _listeners: Map<string | number, IEventCallbackInfo[]> = new Map();

    private _checkValid(target: any): boolean {
        if (!target) return false;
        // 优先使用外部注入的判定函数
        if (EventTarget.isValidChecker) {
            return EventTarget.isValidChecker(target);
        }
        // 降级兜底：如果对象上显式声明了 isValid === false，则认为无效
        if (typeof target.isValid === 'boolean') {
            return target.isValid;
        }
        return true;
    }

    public on(type: string | number, callback: EventCallback, target?: any, once?: boolean): void {
        let listeners = this._listeners.get(type);
        if (!listeners) {
            listeners = [];
            this._listeners.set(type, listeners);
        }
        listeners.push({ callback, target, once });
    }

    public once(type: string | number, callback: EventCallback, target?: any): void {
        this.on(type, callback, target, true);
    }

    public off(type: string | number, callback?: EventCallback, target?: any): void {
        const listeners = this._listeners.get(type);
        if (!listeners) return;

        if (!callback && !target) {
            this._listeners.delete(type);
            return;
        }

        for (let i = listeners.length - 1; i >= 0; i--) {
            const listener = listeners[i];
            const isMatchCallback = !callback || listener.callback === callback;
            const isMatchTarget = !target || listener.target === target;
            if (isMatchCallback && isMatchTarget) {
                listeners.splice(i, 1);
            }
        }

        if (listeners.length === 0) {
            this._listeners.delete(type);
        }
    }

    public targetOff(target: any): void {
        if (!target) return;
        for (const [type, listeners] of this._listeners.entries()) {
            for (let i = listeners.length - 1; i >= 0; i--) {
                if (listeners[i].target === target) {
                    listeners.splice(i, 1);
                }
            }
            if (listeners.length === 0) {
                this._listeners.delete(type);
            }
        }
    }

    public cleanInvalidListeners(): void {
        for (const [type, listeners] of this._listeners.entries()) {
            for (let i = listeners.length - 1; i >= 0; i--) {
                const listener = listeners[i];
                if (listener.target && !this._checkValid(listener.target)) {
                    listeners.splice(i, 1);
                }
            }
            if (listeners.length === 0) {
                this._listeners.delete(type);
            }
        }
    }

    public emit(type: string | number, ...args: any[]): void {
        const listeners = this._listeners.get(type);
        if (!listeners) return;

        // 过滤并移除已失效的 target（防止内存泄露和空指针异常）
        for (let i = listeners.length - 1; i >= 0; i--) {
            const listener = listeners[i];
            if (listener.target && !this._checkValid(listener.target)) {
                listeners.splice(i, 1);
            }
        }

        if (listeners.length === 0) {
            this._listeners.delete(type);
            return;
        }

        const listenersCopy = [...listeners];
        for (const listener of listenersCopy) {
            if (listener.once) {
                this.off(type, listener.callback, listener.target);
            }
            if (listener.target) {
                if (!this._checkValid(listener.target)) {
                    continue;
                }
                listener.callback.apply(listener.target, args);
            } else {
                listener.callback(...args);
            }
        }
    }

    public hasEventListener(type: string | number, callback?: EventCallback, target?: any): boolean {
        const listeners = this._listeners.get(type);
        if (!listeners) return false;
        if (!callback && !target) return listeners.length > 0;
        return listeners.some(listener => {
            const isMatchCallback = !callback || listener.callback === callback;
            const isMatchTarget = !target || listener.target === target;
            return isMatchCallback && isMatchTarget;
        });
    }
}

/** 事件系统 
 * @author seamonster
 * @date 2025-11-15
 */
export class GCoreEvent extends EventTarget {

    /** ui事件 */
    public static MVC_EVENT = {
        /** 注册视图
         * @param {number} tid 类型id
         * @param {IMvcParams} viewParam 视图参数
         */
        REGISTER_VIEW: `MVC_REGISTER_VIEW`,
        /** 打开视图
         * @param {number} tid 类型id
         * @param {BaseView} view 视图脚本
         */
        OPEN_VIEW: `MVC_OPEN_VIEW`,
        /** 关闭视图
         * @param {number} tid 类型id
         * @param {BaseView} view 视图脚本
         */
        CLOSE_VIEW: `MVC_CLOSE_VIEW`,
    }

    /** 资源加载事件 */
    public static RES_LOAD_EVENT = {
        /** 资源包加载完成
         * @param {string} bundleName 资源包名字
         */
        BUNDLE_LOAD_COMPLETE: `BUNDLE_LOAD_COMPLETE`,
    }

    /** 语言切换 */
    public static LANGUAGE_CHANGED = {
        /** 切换语言 - 无参数 */
        SWITCH_LANGUAGE: `SWITCH_LANGUAGE`,
    }

    /** 流程切换 */
    public static FSM_EVENT = {
        /** 进入流程
         * @param {string} fsmType 流程类型
         */
        ENTER: `FSM_ENTER`,
        /** 退出流程
         * @param {string} fsmType 流程类型
         */
        EXIT: `FSM_EXIT`,
    }
}

export const gcoreEvent = new GCoreEvent();
