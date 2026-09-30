import { Node, Component } from "cc";

/** UI组件 */
export class BaseUi extends Component {

    /** 遍历节点树获取符合名字的子节点
     * @param name 节点名字
     * @returns 节点
     */
    public findChild(name: string): Node {

        // 递归遍历查找子节点，直到找到第一个名字相等的节点
        if (!this.node) {
            throw new Error(`没有找到父节点`);
        }

        // 使用迭代遍历方式查找子节点，避免递归带来的性能损耗
        function find(node: Node, name: string): Node | undefined {
            if (!node) return undefined;

            // 使用数组索引而不是 shift() 来避免性能损耗
            const queue: Node[] = [node];
            let index = 0;

            while (index < queue.length) {
                const current = queue[index++];
                if (current.name === name) {
                    return current;
                }
                // 添加所有子节点到队列
                if (current.children && current.children.length > 0) {
                    for (let i = 0; i < current.children.length; i++) {
                        queue.push(current.children[i]);
                    }
                }
            }
            return undefined;
        }

        let node = find(this.node, name);
        if (!node) {
            throw new Error(`${this.node.name} 没有找到子节点  ${name}`);
        }

        return node;
    }

    /** 遍历节点树获取符合名字的子节点组件
     * @param name 节点名字
     * @param comp 组件类型
     * @returns 组件
     */
    public findComponent<T extends Component>(name: string, comp: new () => T): T {
        const node = this.findChild(name);
        return node.getComponent(comp)!;
    }

}