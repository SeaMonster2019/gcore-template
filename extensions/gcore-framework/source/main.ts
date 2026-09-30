/**
 * @file main.ts
 * @description gcore-framework 扩展主进程入口文件
 * 负责扩展加载生命周期管理，并在编辑器启动时自动初始化多语言数据查询与 IPC 通信服务
 */

// @ts-ignore
import packageJSON from '../package.json';
import { I18nDataMgr } from './panels/default/common/i18n-data-mgr';
import { StorageMgr } from './panels/default/common/storage-mgr';

/**
 * 扩展主进程消息暴露接口
 */
export const methods: { [key: string]: (...any: any) => any } = {
    /** 打开工具面板 */
    openPanel() {
        Editor.Panel.open(packageJSON.name);
    },

    /** 通过 IPC 消息查询多语言实时文本 */
    queryI18nText(key: string, fallback?: string, lang?: string): string {
        const workspace = Editor.Project.path;
        return I18nDataMgr.getText(workspace, key, fallback, lang);
    },

    /** 通过 IPC 消息获取全量多语言字典 */
    queryI18nAll(lang?: string): Record<string, string> {
        const workspace = Editor.Project.path;
        return I18nDataMgr.getAllTexts(workspace, lang);
    },

    /** 设置预览语言并即时广播 Scene 场景脚本刷新组件 */
    setPreviewLang(previewLang: string) {
        const workspace = Editor.Project.path;
        StorageMgr.saveState({ previewLang }, workspace);
        I18nDataMgr.setPreviewLang(previewLang);

        try {
            // 通过 IPC 执行场景脚本 onPreviewLangChanged，促使 Scene 场景控件全场重绘
            Editor.Message.send('scene', 'execute-scene-script', {
                name: packageJSON.name,
                method: 'onPreviewLangChanged',
                args: [previewLang],
            });
        } catch (e) {}

        Editor.Message.send('scene', 'snapshot');
    },

    /** 重新加载多语言 CSV 数据 */
    reloadCsvData() {
        const workspace = Editor.Project.path;
        I18nDataMgr.loadCsvData(workspace, (msg, level) => console.log(`[gcore I18n] [${level || 'info'}] ${msg}`));

        try {
            Editor.Message.send('scene', 'execute-scene-script', {
                name: packageJSON.name,
                method: 'onPreviewLangChanged',
                args: [],
            });
        } catch (e) {}

        Editor.Message.send('scene', 'snapshot');
    },

    /** 接收场景进程字体替换结果广播 */
    onFontReplaceResult(result: any) {
        console.log('[gcore-framework] 场景进程字体替换结果广播:', JSON.stringify(result));
    },

    /** 接收场景进程当前编辑资源 UUID 广播 */
    onCurrentAssetUuid(data: any) {
        console.log('[gcore-framework] 场景进程当前编辑资源 UUID 广播:', JSON.stringify(data));
    },

    /** 通过 IPC 消息检测指定字体在某多语言下是否存在缺字 */
    checkFontMissing(fontPath: string, langCode: string) {
        const workspace = Editor.Project.path;
        return require('./panels/default/common/font-checker').FontChecker.check(workspace, fontPath, langCode);
    },

    /** 通过 IPC 消息执行字体抽字压缩 (子集化) */
    subsetFont(fontPath: string, textFilePath: string, targetFontPath: string, extraChars?: string) {
        const workspace = Editor.Project.path;
        return require('./panels/default/common/font-subsetter').FontSubsetter.subset(
            workspace,
            fontPath,
            textFilePath,
            targetFontPath,
            extraChars
        );
    },

    /** 通过 IPC 消息执行字体格式转换 (.ttf / .otf / .woff2 / .woff) */
    convertFont(fontPath: string, targetFormat: any, targetFontPath: string) {
        const workspace = Editor.Project.path;
        return require('./panels/default/common/font-converter').FontConverter.convert(
            workspace,
            fontPath,
            targetFormat,
            targetFontPath
        );
    },
};

/**
 * 编辑器启动 / 扩展加载时触发
 * 自动装载多语言 CSV 数据，为场景与组件提供高效的 IPC 查询服务
 */
export function load() {
    try {
        const workspace = Editor.Project.path;
        const state = StorageMgr.loadState(workspace);

        console.log('[gcore-framework] 编辑器已启动，自动加载多语言数据（支持编辑器实时 IPC 预览）...');
        I18nDataMgr.setPreviewLang(state.previewLang || 'zh-Hans');
        I18nDataMgr.loadCsvData(workspace, (msg, level) => console.log(`[gcore I18n] [${level || 'info'}] ${msg}`));
    } catch (e) {
        console.error('[gcore-framework] 自动加载多语言数据失败:', e);
    }
}

/**
 * 卸载扩展 / 编辑器关闭时触发
 */
export function unload() {}
