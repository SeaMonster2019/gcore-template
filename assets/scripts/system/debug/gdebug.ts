import { Camera, EventTouch, game, Node, UITransform, Vec3 } from "cc";
import { DEBUG } from "cc/env";

/** 注入调试 */
function initDebug() {
    if (DEBUG) {
        (window as any)["game"] = game;
        (window as any)["debug"] = {};
    }
}
initDebug();

/** 调试工具集 */
class GDebug {

    /** 添加点击调试 */
    public addTouchDebug2D(node: Node, camera: Camera, func?: Function,) {
        if (DEBUG) {
            const uit = node.getComponent(UITransform);
            if (!uit) {
                console.error("节点没有UITransform组件");
                return;
            }
            node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                const uiPos = new Vec3(event.getLocation().x, event.getLocation().y, 0);
                const wpos = camera.screenToWorld(uiPos);
                const arPos = uit.convertToNodeSpaceAR(wpos);
                console.log(`点击Ui坐标 x：${uiPos.x},y ${uiPos.y}\n点击世界坐标 x:${wpos.x}, y:${wpos.y}\n点击本地坐标 x:${arPos.x}, y:${arPos.y}`);
                func?.();
            }, this);
        }
    }

    /** 添加调试函数
     * @param key 调试函数名
     * @param func 调试函数
     */
    public addDebugFunc(key: string, func: Function) {
        if (DEBUG) {
            console.log(`%c 添加调试函数:${key}`, "color: blue;");
            (window as any)["debug"][key] = func;
        }
    }

    /** 方法装饰器：类定义时直接注册到 window.debug[key]（不绑定 this，适用于不依赖实例的调试方法）
     * @param key 注册到 window.debug 上的属性名，省略时使用方法名
     * @example
     * class Foo {
     *   \@gdebug.addDebugDecorator('myFunc')
     *   myFunc(x: number) { ... }
     * }
     */
    public addDebugDecorator(key?: string) {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
            const debugKey = key ?? propertyKey;
            gdebug.addDebugFunc(debugKey, descriptor.value);
            return descriptor;
        };
    }

}

/**  调试工具集 */
export const gdebug = new GDebug();