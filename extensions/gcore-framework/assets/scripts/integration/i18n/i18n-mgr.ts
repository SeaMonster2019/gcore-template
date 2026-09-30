import { BufferAsset } from "cc";
import { EDITOR } from "cc/env";
import { GCoreEvent, gcoreEvent } from "../../system/event";
import ByteBuf from "./base/ByteBuf";

/** 程序本地化表管理器 */
export class I18nMgr {

    /** 当前语言标识 */
    private _language = "";
    /** 本地化字典映射 */
    private _textMap: { [key: string]: string } = {};
    /** 编辑器实时预览字典映射 */
    private _editorTextMap: { [key: string]: string } = {};
    /** 编辑器模式下上次加载的预览语言 */
    private _editorPreviewLang = "";
    /** 编辑器模式下 CSV 是否已载入 */
    private _editorCsvLoaded = false;

    /** 获取当前语言标识 */
    public get language(): string {
        return this._language;
    }

    /** 获取本地化字典的只读映射 */
    public get textMap(): Readonly<{ [key: string]: string }> {
        return this._textMap;
    }

    /****************  公共方法  ****************/

    /** 编辑器模式下主动强行刷新预览语言 */
    public reloadEditorPreviewLang(): void {
        if (EDITOR) {
            this._checkAndReloadEditorCsv(true);
        }
    }

    /** 编辑器模式下获取已缓存的实时预览文本
     * @param key 本地化 key
     * @param fallback 默认文本
     * @returns 实时预览文本或 fallback 文本
     */
    public getEditorText(key: string, fallback = ""): string {
        if (!key) {
            return fallback;
        }
        if (EDITOR) {
            this._checkAndReloadEditorCsv();
        }
        const val = this._editorTextMap[key];
        if (val !== undefined && val !== "") {
            return val;
        }
        return this.getText(key, fallback);
    }

    /** 编辑器模式下通过 Cocos 扩展 IPC 消息或本地 CSV 实时获取文本
     * @param key 本地化 key
     * @param fallback 默认文本
     * @param lang 可选指定预览语言
     * @returns 实时预览文本 Promise
     */
    public async getEditorTextAsync(key: string, fallback = "", lang?: string): Promise<string> {
        if (!key) {
            return fallback;
        }

        // 1. 优先检查并更新本地 CSV 预览（支持中英文等多语言实时切换）
        if (EDITOR) {
            this._checkAndReloadEditorCsv();
        }
        if (this._editorTextMap[key] !== undefined && this._editorTextMap[key] !== "") {
            return this._editorTextMap[key];
        }

        // 2. 尝试通过 IPC 向扩展主进程请求
        try {
            const globalEditor = (typeof window !== 'undefined' ? (window as any).Editor : (globalThis as any).Editor);
            if (globalEditor && globalEditor.Message && typeof globalEditor.Message.request === 'function') {
                const text = await globalEditor.Message.request('gcore-framework', 'query-i18n-text', key, fallback, lang);
                if (typeof text === 'string') {
                    this._editorTextMap[key] = text;
                    return text;
                }
            }
        } catch (e) {
            // 静默降级
        }
        return this.getText(key, fallback);
    }

    /** 将 BufferAsset 转换为多语言键值对数据
     * @param asset BufferAsset 资源
     * @returns 多语言键值对映射表
     */
    public parseBufferAsset(asset: BufferAsset): Record<string, string> {
        if (!asset || !asset.buffer()) {
            return {};
        }
        return this.parseBinary(asset.buffer());
    }

    /** 从二进制数据解析多语言键值对
     * @param buffer ArrayBuffer 或 Uint8Array 二进制字节数据
     * @returns 多语言键值对映射表
     */
    public parseBinary(buffer: ArrayBuffer | Uint8Array): Record<string, string> {
        const byteBuf = new ByteBuf(buffer);
        const map: Record<string, string> = {};
        const count = byteBuf.readInt();
        for (let i = 0; i < count; i++) {
            const key = byteBuf.readString();
            const value = byteBuf.readString();
            map[key] = value;
        }
        return map;
    }

    /** 从 JSON 数据切换语言
     * @param language 语言标识
     * @param json JSON 格式文本字符串
     */
    public async switchLanguageFromJson(language: string, json: string): Promise<void> {
        const data = JSON.parse(json);
        this.switchLanguageFromData(language, data);
    }

    /** 从 BufferAsset 资源切换语言
     * @param language 语言标识
     * @param asset BufferAsset 资源
     */
    public switchLanguageFromBufferAsset(language: string, asset: BufferAsset): void {
        const data = this.parseBufferAsset(asset);
        this.switchLanguageFromData(language, data);
    }

    /** 从二进制 Buffer 切换语言
     * @param language 语言标识
     * @param buffer ArrayBuffer 或 Uint8Array 字节数据
     */
    public switchLanguageFromBuffer(language: string, buffer: ArrayBuffer | Uint8Array): void {
        const data = this.parseBinary(buffer);
        this.switchLanguageFromData(language, data);
    }

    /** 从对象或二进制数据切换语言
     * @param language 语言标识
     * @param data 可为 Record<string, string>、BufferAsset 或 ArrayBuffer/Uint8Array
     */
    public switchLanguageFromBinary(language: string, data: { [key: string]: string } | BufferAsset | ArrayBuffer | Uint8Array): void {
        if (data instanceof BufferAsset) {
            this.switchLanguageFromBufferAsset(language, data);
        } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            this.switchLanguageFromBuffer(language, data);
        } else {
            this.switchLanguageFromData(language, data);
        }
    }

    /** 从键值对对象直接设置语言数据
     * @param language 语言标识
     * @param data 键值对对象
     */
    public switchLanguageFromData(language: string, data: { [key: string]: string }): void {
        this._language = language;
        this._textMap = data;
        this._sendEvent();
    }

    /** 获取本地化文本
     * @param key 本地化 key
     * @param fallback 默认文本
     * @returns 本地化文本，无对应 key 时返回 fallback 或 key
     */
    public getText(key: string, fallback?: string): string {
        return this._textMap?.[key] ?? fallback ?? key;
    }

    /** 是否包含指定 key
     * @param key 本地化 key
     * @returns 是否在字典中存在
     */
    public has(key: string): boolean {
        return key in this._textMap;
    }

    /** 清理本地化数据 */
    public clear(): void {
        this._language = "";
        this._textMap = {};
        this._editorTextMap = {};
        this._editorPreviewLang = "";
        this._editorCsvLoaded = false;
    }

    /****************  私有方法  ****************/

    /** 检查预览语言设置并动态重载 CSV 配置
     * @param forceEmit 是否强制发送全场重绘事件
     */
    private _checkAndReloadEditorCsv(forceEmit = false): void {
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

            // 读取选中的预览语言（优先从 temp/gcore-lang-state.json 读取）
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

            // 若预览语言变动或未曾载入，重载 CSV 数据并通知全场景组件刷新
            const isLangChanged = (this._editorPreviewLang !== previewLang);
            if (isLangChanged || !this._editorCsvLoaded || forceEmit) {
                this._editorPreviewLang = previewLang;
                this._loadEditorCsvData(previewLang, fs, path, workspace);
                this._sendEvent();
            }
        } catch (e) {
            // 静默降级
        }
    }

    /** 编辑器模式下直接解析 CSV 多语言配置
     * @param previewLang 预览语言代码
     * @param fs Node.js fs 模块
     * @param path Node.js path 模块
     * @param workspace 工作区根路径
     */
    private _loadEditorCsvData(previewLang: string, fs: any, path: any, workspace: string): void {
        try {
            const csvDir = path.join(workspace, 'design/配置/多语言/配置');
            if (!fs.existsSync(csvDir)) {
                return;
            }

            const files = fs.readdirSync(csvDir).filter((f: string) => f.endsWith('.csv'));
            const newMap: { [key: string]: string } = {};

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

                // 匹配列索引：先精确匹配 value@<lang>，再按主语言前缀匹配 (如 en-US 匹配 value@en)
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
                    newMap[key] = text;
                }
            }

            this._editorTextMap = newMap;
            this._editorCsvLoaded = true;
        } catch (e) {
            // 静默降级
        }
    }

    /** 发送语言切换事件 */
    private _sendEvent(): void {
        gcoreEvent.emit(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this._language);
    }

}

export const i18n = new I18nMgr();

// 编辑器 Scene 进程中增加轻量定时监测（500ms），双重保证面板切换语言后秒级刷新
if (EDITOR && typeof window !== 'undefined') {
    setInterval(() => {
        try {
            i18n.reloadEditorPreviewLang();
        } catch (e) {}
    }, 500);
}
