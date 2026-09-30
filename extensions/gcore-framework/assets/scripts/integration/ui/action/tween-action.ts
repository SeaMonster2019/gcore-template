import { Node, Tween, tween, Vec3 } from "cc";

/** 移动节点
 * @param node 节点
 * @param target 目标位置
 * @param duration 持续时间
 * @param callback 回调
 * @returns 返回 tween 实例，可用于停止动画；如果节点无效则返回 null
 */
export function ActionMoveTo(node: Node, target: Vec3, duration: number, callback?: () => void): Tween<Node> | null {
    // 检查节点是否有效
    if (!node || !node.isValid) {
        console.warn("[ActionMoveTo] 节点无效，无法执行动画");
        return null;
    }

    // 检查参数有效性
    if (!target || duration < 0) {
        console.warn("[ActionMoveTo] 参数无效，target 或 duration 不正确");
        return null;
    }

    // 克隆目标位置，避免外部修改影响动画
    const targetPos = target.clone();

    const tweenInstance = tween(node)
        .to(duration, { position: targetPos })
        .call(() => {
            // 动画完成后再次检查节点是否有效
            if (node && node.isValid) {
                callback?.();
            }
        })
        .start();

    return tweenInstance;
}

/** 来回动作
 * @param node 节点
 * @param offset 相对位移（从起始位置的偏移量）
 * @param duration 持续时间
 * @returns 返回包含 back 和 forth 方法的对象
 */
export function ActionBackAndForth(node: Node, offset: Vec3, duration: number): { back: () => void; forth: () => void } {

    const startPos = node.position.clone();
    // 目标位置 = 起始位置 + 相对位移
    const targetPos = startPos.clone().add(offset);
    let currentTween: Tween<Node> | null = null;

    const back = () => {
        // 检查节点是否有效
        if (!node || !node.isValid) {
            return;
        }

        // 停止之前的动画
        if (currentTween) {
            currentTween.stop();
            currentTween = null;
        }

        // 从当前位置移动到起始位置
        currentTween = tween(node)
            .to(duration, { position: startPos })
            .call(() => {
                currentTween = null;
            })
            .start();
    };

    const forth = () => {
        // 检查节点是否有效
        if (!node || !node.isValid) {
            return;
        }

        // 停止之前的动画
        if (currentTween) {
            currentTween.stop();
            currentTween = null;
        }

        // 从当前位置移动到目标位置
        currentTween = tween(node)
            .to(duration, { position: targetPos })
            .call(() => {
                currentTween = null;
            })
            .start();
    };

    return { back, forth };
}

/** 缩放动作（来回缩放）
 * @param node 目标节点
 * @param targetScale 目标缩放值（绝对缩放值）
 * @param duration 持续时间
 * @param displayNode 可选的显示节点，缩放到目标时显示，回到初始时隐藏
 * @returns 返回包含 forth 和 back 方法的对象
 */
export function ActionScaleTo(node: Node, targetScale: Vec3, duration: number, displayNode?: Node): { forth: () => void; back: () => void } {

    const initialScale = node.scale.clone();
    const targetScaleValue = targetScale.clone();
    let currentTween: Tween<Node> | null = null;

    const forth = () => {
        // 检查节点是否有效
        if (!node || !node.isValid) {
            return;
        }

        // 停止之前的动画
        if (currentTween) {
            currentTween.stop();
            currentTween = null;
        }

        // 从当前缩放到目标缩放
        currentTween = tween(node)
            .to(duration, { scale: targetScaleValue })
            .call(() => {
                currentTween = null;
                // 缩放到目标完成，显示 displayNode
                if (displayNode && displayNode.isValid) {
                    displayNode.active = true;
                }
            })
            .start();
    };

    const back = () => {
        // 检查节点是否有效
        if (!node || !node.isValid) {
            return;
        }

        // 开始回到初始缩放，立即隐藏 displayNode
        if (displayNode && displayNode.isValid) {
            displayNode.active = false;
        }

        // 停止之前的动画
        if (currentTween) {
            currentTween.stop();
            currentTween = null;
        }

        // 从当前缩放回到初始缩放
        currentTween = tween(node)
            .to(duration, { scale: initialScale })
            .call(() => {
                currentTween = null;
            })
            .start();
    };

    return { forth, back };
}