/**
 * @file dom-util.ts
 * @description DOM 节点安全检索、面板弹窗交互与事件绑定工具库
 */

import { normalizePathForStorage, resolvePathForExec } from './path-util';

/**
 * 通用 DOM 元素查询工具函数，安全穿透 Shadow DOM 与 Cocos 扩展面板作用域
 * @param panel 面板实例
 * @param selector CSS 选择器
 * @returns 对应 HTML 元素或 null
 */
export function queryElement<T extends HTMLElement = HTMLElement>(panel: any, selector: string): T | null {
    if (!panel) return null;

    // 1. 尝试从 panel.shadowRoot 检索
    if (panel.shadowRoot && typeof panel.shadowRoot.querySelector === 'function') {
        const found = panel.shadowRoot.querySelector(selector);
        if (found) return found as T;
    }

    // 2. 尝试从 panel.root 检索
    if (panel.root && typeof panel.root.querySelector === 'function') {
        const found = panel.root.querySelector(selector);
        if (found) return found as T;
    }

    // 3. 尝试从 tabContent/tabHeader 的父级节点检索
    const rootContainer =
        (panel.$ && panel.$.tabContent && panel.$.tabContent.parentElement) ||
        (panel.$ && panel.$.tabHeader && panel.$.tabHeader.parentElement);

    if (rootContainer && typeof rootContainer.querySelector === 'function') {
        const found = rootContainer.querySelector(selector);
        if (found) return found as T;
    }

    // 4. 尝试从 panel.$ 定义的选择器对象中检索
    if (panel.$) {
        for (const k of Object.keys(panel.$)) {
            const el = panel.$[k];
            if (el && typeof el.querySelector === 'function') {
                const found = el.querySelector(selector);
                if (found) return found as T;
            }
        }
    }

    // 5. 尝试面板直接 querySelector
    if (typeof panel.querySelector === 'function') {
        const found = panel.querySelector(selector);
        if (found) return found as T;
    }

    return null;
}

export interface PickFilter {
    name: string;
    extensions: string[];
}

/**
 * 封装调用 Cocos 编辑器原生对话框选择文件/文件夹
 * @param title 对话框标题
 * @param defaultPath 默认路径
 * @param type 选择类型 ('file' | 'directory')
 * @param workspace 工作区根目录
 * @param filters 文件后缀名过滤器列表
 * @returns 选择的目标绝对路径，取消选择则返回空字符串
 */
export async function pickPath(
    title: string,
    defaultPath: string,
    type: 'file' | 'directory',
    workspace: string,
    filters?: PickFilter[]
): Promise<string> {
    const editor = (globalThis as any).Editor;
    if (!editor?.Dialog?.select) {
        throw new Error('Editor.Dialog.select 不可用');
    }

    const resolvedDefault = resolvePathForExec(defaultPath || '', workspace);
    const options: any = {
        title,
        type,
        path: resolvedDefault || undefined,
        button: '选择',
        multi: false,
    };

    if (type === 'file') {
        if (filters && filters.length > 0) {
            options.filters = filters;
        } else {
            options.filters = [{ name: 'All Files', extensions: ['*'] }];
        }
    }

    const result = await editor.Dialog.select(options);
    if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return '';
    }

    return result.filePaths[0] as string;
}

/**
 * 绑定选择路径按钮与输入框
 * @param btn 触发选择的按钮
 * @param inp 路径显示的输入框
 * @param title 弹窗标题
 * @param type 选择类型 ('file' | 'directory')
 * @param workspace 工作区根目录
 * @param onPick 选择完成回调函数
 * @param logger 日志打印回调
 * @param filters 文件后缀名过滤器列表
 */
export function bindPickerBtn(
    btn: HTMLButtonElement | null,
    inp: HTMLInputElement | null,
    title: string,
    type: 'file' | 'directory',
    workspace: string,
    onPick: (val: string) => void,
    logger?: (msg: string, type?: 'info' | 'success' | 'error') => void,
    filters?: PickFilter[]
): void {
    if (!btn || !inp) return;
    btn.addEventListener('click', async () => {
        try {
            const picked = await pickPath(title, inp.value.trim(), type, workspace, filters);
            if (picked) {
                const normalized = normalizePathForStorage(picked, workspace);
                inp.value = normalized;
                onPick(normalized);
                if (logger) logger(`已选择: ${normalized}`);
            }
        } catch (e) {
            if (logger) logger(`选择路径失败: ${(e as any)?.message ?? String(e)}`, 'error');
        }
    });
}

/**
 * 封装调用 Cocos 编辑器/系统原生保存文件对话框
 * @param title 对话框标题
 * @param defaultPath 默认路径
 * @param workspace 工作区根目录
 * @param filters 文件后缀名过滤器列表
 * @returns 选中的保存文件绝对路径，取消则返回空字符串
 */
export async function pickSavePath(
    title: string,
    defaultPath: string,
    workspace: string,
    filters?: PickFilter[]
): Promise<string> {
    const editor = (globalThis as any).Editor;
    const resolvedDefault = resolvePathForExec(defaultPath || '', workspace);
    const saveFilters = filters && filters.length > 0 ? filters : [
        { name: 'Font File (*.ttf)', extensions: ['ttf'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
    ];

    // 1. 优先使用 Cocos Creator 3.x 标准的 Editor.Dialog.save
    if (editor?.Dialog?.save && typeof editor.Dialog.save === 'function') {
        try {
            const result = await editor.Dialog.save({
                title,
                path: resolvedDefault || undefined,
                button: '保存',
                filters: saveFilters,
            });
            // 用户显式点击“取消”或关闭窗口，直接返回空，避免降级触发二次弹窗
            if (!result || result.canceled) {
                return '';
            }
            if (typeof result === 'string') {
                return result;
            }
            if (result.filePath) {
                return result.filePath;
            }
            return '';
        } catch (e) {
            console.warn('[pickSavePath] Editor.Dialog.save 执行异常，尝试 fallback:', e);
        }
    }

    // 2. 尝试 Electron dialog
    try {
        // @ts-ignore
        const electron = typeof require !== 'undefined' ? require('electron') : null;
        const dialog = electron?.dialog || electron?.remote?.dialog;
        if (dialog?.showSaveDialog) {
            const result = await dialog.showSaveDialog({
                title,
                defaultPath: resolvedDefault || undefined,
                buttonLabel: '保存',
                filters: saveFilters,
            });
            if (!result || result.canceled) {
                return '';
            }
            if (result.filePath) {
                return result.filePath;
            }
            return '';
        }
    } catch (e) {}

    // 3. Fallback 到 Editor.Dialog.select
    if (editor?.Dialog?.select) {
        try {
            const result = await editor.Dialog.select({
                title,
                type: 'file',
                path: resolvedDefault || undefined,
                button: '保存',
                filters: saveFilters,
            });
            if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return '';
            }
            return result.filePaths[0] as string;
        } catch (e) {}
    }

    return '';
}

/**
 * 复制纯文本内容到系统剪贴板
 * @param text 需要复制的文本
 * @returns 是否复制成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    // 1. 尝试使用 Electron native clipboard
    try {
        const electron = (window as any).require ? (window as any).require('electron') : null;
        if (electron && electron.clipboard && typeof electron.clipboard.writeText === 'function') {
            electron.clipboard.writeText(text);
            return true;
        }
    } catch (e) {}

    // 2. 尝试使用 Cocos Creator Editor.Clipboard
    try {
        const editor = (window as any).Editor;
        if (editor && editor.Clipboard && typeof editor.Clipboard.write === 'function') {
            editor.Clipboard.write('text', text);
            return true;
        }
    } catch (e) {}

    // 3. 尝试使用标准 Web navigator.clipboard
    try {
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {}

    // 4. 降级使用 textarea + document.execCommand('copy')
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (e) {
        return false;
    }
}

