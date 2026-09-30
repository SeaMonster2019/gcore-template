import { Component } from "cc";
import { EDITOR } from "cc/env";

/** 树形菜单节点结构接口 */
interface MenuTreeNode {
    /** 当前层级的路径节点段名 (如 "cc") */
    segmentName: string;
    /** 完整的 key 字符串 (如 "aa/bb/cc") */
    fullKey?: string;
    /** 对应的预览文本 */
    text?: string;
    /** 子节点映射表 */
    children: Record<string, MenuTreeNode>;
}

/** 多语言编辑器辅助工具类 */
export class I18nEditorUtil {

    /****************  公共方法  ****************/

    /** 编辑器模式下强行刷新 Inspector 界面与 Scene 视图画布渲染
     * @param comp 要刷新的 Target Component (Label 或 RichText)
     */
    public static notifyEditorUpdate(comp?: Component | null): void {
        if (!EDITOR) {
            return;
        }

        try {
            const globalEditor = (typeof window !== 'undefined' ? (window as any).Editor : (globalThis as any).Editor);
            const globalCce = (typeof window !== 'undefined' ? (window as any).cce : (globalThis as any).cce);

            // 1. 强制刷新组件底层 RenderData
            if (comp) {
                // @ts-ignore
                if (typeof comp.updateRenderData === 'function') {
                    // @ts-ignore
                    comp.updateRenderData(true);
                }
                // @ts-ignore
                if (typeof comp.markForUpdateRenderData === 'function') {
                    // @ts-ignore
                    comp.markForUpdateRenderData();
                }
            }

            // 2. 重绘 EditMode 场景视图画布
            if (globalCce?.Engine && typeof globalCce.Engine.repaintInEditMode === 'function') {
                globalCce.Engine.repaintInEditMode();
            }

            // 3. 触发场景快照与 Inspector 属性审查同步，使输入框立即更新
            if (globalEditor?.Message && typeof globalEditor.Message.send === 'function') {
                globalEditor.Message.send('scene', 'snapshot');
            }
        } catch (e) {
            // 静默处理
        }
    }

    /** 弹出原生 Menu 多语言 Key 选择菜单 (仅在 EDITOR 模式下)
     * @param onSelectKey 选中 key 后的回调函数
     */
    public static openKeySelectorMenu(onSelectKey: (selectedKey: string) => void): void {
        if (!EDITOR) {
            return;
        }

        try {
            const reqFunc = (typeof window !== 'undefined' ? (window as any).require : (globalThis as any).require);
            const globalEditor = (typeof window !== 'undefined' ? (window as any).Editor : (globalThis as any).Editor);
            const workspace = globalEditor?.Project?.path;
            if (typeof reqFunc !== 'function' || !workspace) {
                return;
            }

            const fs = reqFunc('fs');
            const path = reqFunc('path');
            if (!fs || !path) {
                return;
            }

            // 1. 读取预览语言
            let previewLang = 'zh-Hans';
            const stateFile = path.join(workspace, 'temp', 'gcore-lang-state.json');
            if (fs.existsSync(stateFile)) {
                try {
                    const stateRaw = fs.readFileSync(stateFile, 'utf-8');
                    const stateJson = JSON.parse(stateRaw);
                    if (stateJson && stateJson.previewLang) {
                        previewLang = stateJson.previewLang;
                    }
                } catch (e) {}
            }

            // 2. 读取 CSV 数据
            const csvDir = path.join(workspace, 'design/配置/多语言/配置');
            if (!fs.existsSync(csvDir)) {
                return;
            }

            const files = fs.readdirSync(csvDir).filter((f: string) => f.endsWith('.csv'));
            const allKeys: Array<{ key: string; text: string }> = [];

            for (const file of files) {
                const filePath = path.join(csvDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split(/\r?\n/);
                if (lines.length < 2) continue;

                let varLineIndex = -1;
                for (let i = 0; i < Math.min(lines.length, 10); i++) {
                    if (lines[i].startsWith('##var')) {
                        varLineIndex = i;
                        break;
                    }
                }
                if (varLineIndex === -1) continue;

                const headerCols = lines[varLineIndex].split(',').map((s: string) => s.trim());
                const keyColIndex = headerCols.indexOf('key');
                if (keyColIndex === -1) continue;

                let langColIndex = headerCols.indexOf(`value@${previewLang}`);
                if (langColIndex === -1) {
                    const shortLang = previewLang.split('-')[0];
                    langColIndex = headerCols.findIndex((col: string) => col === `value@${shortLang}` || col.startsWith(`value@${shortLang}-`));
                }
                if (langColIndex === -1) {
                    langColIndex = headerCols.indexOf('value');
                }
                if (langColIndex === -1) continue;

                for (let i = varLineIndex + 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('##')) continue;

                    const rowCols = line.split(',');
                    const key = (rowCols[keyColIndex] ?? '').trim();
                    if (!key) continue;

                    const text = (rowCols[langColIndex] ?? '').trim();
                    allKeys.push({ key, text });
                }
            }

            // 3. 获取 Electron / Cocos 原生 Menu 类
            let MenuClass: any = null;
            let MenuItemClass: any = null;

            try {
                const remote = reqFunc('@electron/remote') || (reqFunc('electron') && reqFunc('electron').remote);
                if (remote) {
                    MenuClass = remote.Menu;
                    MenuItemClass = remote.MenuItem;
                }
            } catch (e) {}

            if (!MenuClass) {
                if (typeof globalEditor?.Menu === 'function') {
                    MenuClass = globalEditor.Menu;
                } else if (globalEditor?.Menu?.Menu) {
                    MenuClass = globalEditor.Menu.Menu;
                }
            }

            if (!MenuClass) {
                console.warn('[I18n] 未能检索到 Electron Menu 类');
                return;
            }

            // 4. 分离带 "/" 与不带 "/" 的 key
            const slashKeys: Array<{ key: string; text: string }> = [];
            const noSlashKeys: Array<{ key: string; text: string }> = [];

            allKeys.forEach((item) => {
                if (item.key.includes('/')) {
                    slashKeys.push(item);
                } else {
                    noSlashKeys.push(item);
                }
            });

            // 5. 构建树结构
            const root: MenuTreeNode = { segmentName: 'root', children: {} };

            slashKeys.forEach((item) => {
                const parts = item.key.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
                let current = root;
                for (let i = 0; i < parts.length; i++) {
                    const segment = parts[i];
                    if (i === parts.length - 1) {
                        if (!current.children[segment]) {
                            current.children[segment] = {
                                segmentName: segment,
                                fullKey: item.key,
                                text: item.text,
                                children: {},
                            };
                        } else {
                            current.children[segment].fullKey = item.key;
                            current.children[segment].text = item.text;
                        }
                    } else {
                        if (!current.children[segment]) {
                            current.children[segment] = {
                                segmentName: segment,
                                children: {},
                            };
                        }
                        current = current.children[segment];
                    }
                }
            });

            const countLeafItems = (node: MenuTreeNode): number => {
                let count = node.fullKey ? 1 : 0;
                Object.values(node.children).forEach((child) => {
                    count += countLeafItems(child);
                });
                return count;
            };

            const createMenuItem = (labelStr: string, keyVal: string) => {
                if (MenuItemClass) {
                    return new MenuItemClass({
                        label: labelStr,
                        click: () => onSelectKey(keyVal),
                    });
                }
                return {
                    label: labelStr,
                    click: () => onSelectKey(keyVal),
                };
            };

            // 递归构建菜单：文件夹子菜单优先排在前，选项列表排在后
            const buildMenuFromTree = (node: MenuTreeNode): any => {
                const childNames = Object.keys(node.children);
                if (childNames.length === 0) return null;

                const folderChildren: MenuTreeNode[] = [];
                const itemChildren: MenuTreeNode[] = [];

                childNames.forEach((childName) => {
                    const childNode = node.children[childName];
                    const subChildKeys = Object.keys(childNode.children);
                    if (subChildKeys.length > 0) {
                        folderChildren.push(childNode);
                    } else {
                        itemChildren.push(childNode);
                    }
                });

                const menuInstance = new MenuClass();

                // 1. 优先追加所有文件夹子菜单
                folderChildren.forEach((childNode) => {
                    const subMenu = buildMenuFromTree(childNode);
                    const count = countLeafItems(childNode);

                    const folderLabel = `📁 ${childNode.segmentName} (${count}条)`;
                    if (MenuItemClass) {
                        menuInstance.append(
                            new MenuItemClass({
                                label: folderLabel,
                                submenu: subMenu,
                            })
                        );
                    } else {
                        menuInstance.append({
                            label: folderLabel,
                            submenu: subMenu,
                        });
                    }
                });

                // 2. 追加文件夹节点自身的 key（若存在）
                folderChildren.forEach((childNode) => {
                    if (childNode.fullKey) {
                        const selfLabel = `📌 ${childNode.segmentName}  (${childNode.text || '无配置文本'})`;
                        menuInstance.append(createMenuItem(selfLabel, childNode.fullKey));
                    }
                });

                // 3. 追加普通选项
                itemChildren.forEach((childNode) => {
                    const displayLabel = `📄 ${childNode.segmentName}  (${childNode.text || '无配置文本'})`;
                    menuInstance.append(createMenuItem(displayLabel, childNode.fullKey!));
                });

                return menuInstance;
            };

            const rootMenu = buildMenuFromTree(root) || new MenuClass();

            // 规则1：无 "/" 的 key 归类为 "更多"，作为一级菜单的最末项
            if (noSlashKeys.length > 0) {
                const moreSubmenu = new MenuClass();
                noSlashKeys.forEach((item) => {
                    const labelStr = `📄 ${item.key}  (${item.text || '无配置文本'})`;
                    moreSubmenu.append(createMenuItem(labelStr, item.key));
                });

                const moreFolderLabel = `📁 更多 (${noSlashKeys.length}条)`;
                if (MenuItemClass) {
                    rootMenu.append(
                        new MenuItemClass({
                            label: moreFolderLabel,
                            submenu: moreSubmenu,
                        })
                    );
                } else {
                    rootMenu.append({
                        label: moreFolderLabel,
                        submenu: moreSubmenu,
                    });
                }
            }

            if (rootMenu && typeof rootMenu.popup === 'function') {
                rootMenu.popup();
            }
        } catch (e) {
            console.error('[I18n] 打开 Key 选择菜单失败:', e);
        }
    }

}
