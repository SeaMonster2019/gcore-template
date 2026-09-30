/**
 * @file i18n-data-mgr.ts
 * @description 编辑器主进程中多语言 CSV 数据加载与查询管理器，无需 HTTP 服务即可进行编辑器内实时 IPC 通信查询
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { StorageMgr } from './storage-mgr';
import { LogCallback } from './types';

export class I18nDataMgr {
    /** 内存数据映射表: langCode -> { key -> text } */
    private static dataMap: Record<string, Record<string, string>> = {};
    /** 当前预览语言 */
    private static activePreviewLang: string = 'zh-Hans';
    /** 是否已进行过初始装载 */
    private static isLoaded = false;

    /**
     * 设置当前预览语言
     * @param lang 语言代码（如 zh-Hans / en）
     */
    public static setPreviewLang(lang: string): void {
        this.activePreviewLang = lang;
    }

    /**
     * 从工作区 CSV 表重新装载多语言数据
     * @param workspace 工作区根路径
     * @param logger 日志回调
     */
    public static loadCsvData(workspace: string, logger?: LogCallback): void {
        this.dataMap = {};
        const csvDir = join(workspace, 'design/配置/多语言/配置');

        if (!existsSync(csvDir)) {
            if (logger) logger(`未找到多语言 CSV 目录: ${csvDir}`, 'error');
            return;
        }

        try {
            const files = readdirSync(csvDir).filter((f) => f.endsWith('.csv'));
            let totalKeys = 0;

            for (const file of files) {
                const filePath = join(csvDir, file);
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split(/\r?\n/);

                if (lines.length < 2) continue;

                // 查找 ##var 行以确定 key 和 value@<lang> 的列索引
                let varLineIndex = -1;
                for (let i = 0; i < Math.min(lines.length, 10); i++) {
                    if (lines[i].startsWith('##var')) {
                        varLineIndex = i;
                        break;
                    }
                }

                if (varLineIndex === -1) continue;

                const headerCols = lines[varLineIndex].split(',').map((s) => s.trim());
                const keyColIndex = headerCols.indexOf('key');
                if (keyColIndex === -1) continue;

                const langColIndices: Record<string, number> = {};
                headerCols.forEach((col, idx) => {
                    if (col.startsWith('value@')) {
                        const langCode = col.substring(6).trim();
                        langColIndices[langCode] = idx;
                    } else if (col === 'value') {
                        langColIndices['default'] = idx;
                    }
                });

                // 解析具体数据行
                for (let i = varLineIndex + 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('##')) continue;

                    const rowCols = line.split(',');
                    const key = (rowCols[keyColIndex] ?? '').trim();
                    if (!key) continue;

                    totalKeys++;

                    Object.keys(langColIndices).forEach((langCode) => {
                        const colIdx = langColIndices[langCode];
                        const text = rowCols[colIdx] ?? '';
                        if (!this.dataMap[langCode]) {
                            this.dataMap[langCode] = {};
                        }
                        this.dataMap[langCode][key] = text;
                    });
                }
            }

            this.isLoaded = true;
            if (logger) logger(`装载 CSV 多语言表完成，包含 ${totalKeys} 条 Key 配置`, 'info');
        } catch (e) {
            if (logger) logger(`装载 CSV 多语言数据失败: ${(e as any)?.message ?? String(e)}`, 'error');
        }
    }

    /**
     * 查询单个 key 的实时文本
     * @param workspace 工作区根路径
     * @param key 多语言 key
     * @param fallback 默认文本
     * @param lang 语言代码（可选）
     * @returns 匹配的实时文本
     */
    public static getText(workspace: string, key: string, fallback = '', lang?: string): string {
        if (!key) return fallback;

        if (!this.isLoaded) {
            const state = StorageMgr.loadState(workspace);
            this.activePreviewLang = state.previewLang || 'zh-Hans';
            this.loadCsvData(workspace);
        }

        const reqLang = lang || this.activePreviewLang;
        const langDict = this.dataMap[reqLang] || this.dataMap['default'] || {};
        const foundText = langDict[key] ?? this.dataMap['default']?.[key];

        return (foundText !== undefined && foundText !== '') ? foundText : (fallback || key);
    }

    /**
     * 获取指定语言的所有多语言字典
     * @param workspace 工作区根路径
     * @param lang 语言代码（可选）
     * @returns 多语言字典映射表
     */
    public static getAllTexts(workspace: string, lang?: string): Record<string, string> {
        if (!this.isLoaded) {
            const state = StorageMgr.loadState(workspace);
            this.activePreviewLang = state.previewLang || 'zh-Hans';
            this.loadCsvData(workspace);
        }

        const reqLang = lang || this.activePreviewLang;
        return this.dataMap[reqLang] || this.dataMap['default'] || {};
    }
}
