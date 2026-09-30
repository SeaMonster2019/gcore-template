/**
 * @file path-util.ts
 * @description 路径解析、格式化与 HTML 转义相关工具函数
 */

import { isAbsolute, join, relative, resolve } from 'path';

/**
 * 获取当前 Cocos 项目的工作区根目录
 * @returns 项目绝对路径
 */
export function getWorkspacePath(): string {
    const editor = (globalThis as any).Editor;
    if (editor && editor.Project && editor.Project.path) {
        return editor.Project.path;
    }
    // 回退机制：从当前编译输出目录向上解析
    return resolve(__dirname, '../../../../../');
}

/**
 * 规范化存储路径（如果是在工作区内的绝对路径，转换为相对路径存储；并统一转换为正斜杠）
 * @param inputPath 输入路径
 * @param workspace 工作区根目录
 * @returns 规范化后的路径
 */
export function normalizePathForStorage(inputPath: string, workspace: string): string {
    if (!inputPath) return '';
    const cleanPath = inputPath.trim();
    if (isAbsolute(cleanPath) && cleanPath.startsWith(workspace)) {
        return relative(workspace, cleanPath).replace(/\\/g, '/');
    }
    return cleanPath.replace(/\\/g, '/');
}

/**
 * 解析执行路径（如果是相对路径，则拼接到工作区根目录下）
 * @param inputPath 输入路径
 * @param workspace 工作区根目录
 * @returns 绝对路径
 */
export function resolvePathForExec(inputPath: string, workspace: string): string {
    const cleanPath = inputPath.trim();
    if (isAbsolute(cleanPath)) {
        return cleanPath;
    }
    return join(workspace, cleanPath);
}

/**
 * 转义 HTML 特殊字符，防止 XSS 攻击或格式渲染异常
 * @param s 原始字符串
 * @returns 转义后的 HTML 字符串
 */
export function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
