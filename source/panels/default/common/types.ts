/**
 * @file types.ts
 * @description Luban 工具面板的核心数据接口与类型定义文件
 */

/** 页签名称类型 */
export type TabName = 'tab-1' | 'tab-2' | 'tab-3' | 'tab-4' | 'tab-5';

/** 日志类型 */
export type LogType = 'info' | 'success' | 'error';

/** 日志回调函数类型 */
export type LogCallback = (msg: string, type?: LogType) => void;

/** 单个语言配置接口 */
export interface LanguageItem {
    /** 语言代码 (如: zh-Hans, en, ja) */
    code: string;
    /** 语言展示名称 (如: 中文, 英文, 日文) */
    name: string;
}

/** 项目根目录下 gcore-config.json 的持久化配置结构 */
export interface GCoreProjectConfig {
    /** 配置表配置文件路径 (luban.conf) */
    cfgConfFile?: string;
    /** 配置表代码输出目录 (outputCodeDir) */
    cfgCodeDir?: string;
    /** 配置表数据输出目录 (outputDataDir) */
    cfgDataDir?: string;
    /** 多语言配置文件路径 (luban.conf) */
    langConfFile?: string;
    /** 多语言代码输出目录 (outputCodeDir) */
    langCodeDir?: string;
    /** 已配置的多语言列表 */
    languages?: LanguageItem[];
    /** 各语言的数据输出目录映射表 (langCode -> outputDataDir) */
    langDataDirs?: Record<string, string>;
}

/** Luban 工具面板完整持久化状态数据结构 */
export interface LubanToolState {
    /** 当前激活的页签 */
    activeTab: TabName;
    /** 配置表配置文件路径 (luban.conf) */
    cfgConfFile: string;
    /** 配置表代码输出目录 (outputCodeDir) */
    cfgCodeDir: string;
    /** 配置表数据输出目录 (outputDataDir) */
    cfgDataDir: string;
    /** 多语言配置文件路径 (luban.conf) */
    langConfFile: string;
    /** 多语言代码输出目录 (outputCodeDir) */
    langCodeDir: string;
    /** 已配置的多语言列表 */
    languages: LanguageItem[];
    /** 各语言的数据输出目录映射表 (langCode -> outputDataDir) */
    langDataDirs: Record<string, string>;

    /** 编辑器 HTTP 实时预览服务开关 */
    httpServerEnabled: boolean;
    /** 编辑器 HTTP 实时预览服务端口号 */
    httpServerPort: number;
    /** 当前选中的预览语言代码 */
    previewLang: string;

    /** .meta 清理目标目录 */
    metaCleanDir: string;
    /** 字体替换目标资源文件路径 */
    fontFilePath: string;
    /** 字体替换目标预制体/场景文件或文件夹路径 */
    fontTargetLocation: string;
    /** 字体缺字检测目标字体文件路径 */
    fontCheckFilePath: string;
    /** 字体缺字检测目标语言代码 */
    fontCheckLang: string;
    /** 字体抽字压缩源字体文件路径 */
    fontSubsetSourceFont: string;
    /** 字体抽字压缩参考文本文件路径 */
    fontSubsetTextFile: string;
    /** 字体抽字压缩导出的目标字体文件路径 */
    fontSubsetTargetFont: string;
    /** 字体格式转换源字体文件路径 */
    fontConvertSourceFont: string;
    /** 字体格式转换目标格式 ('ttf' | 'otf') */
    fontConvertTargetFormat: 'ttf' | 'otf';
    /** 字体格式转换导出的目标字体文件路径 */
    fontConvertTargetFont: string;
    /** 自定义工程根目录路径 (为空时默认使用当前 Cocos 工程根目录) */
    projectRootDir: string;
}

/** 面板上下文接口，用于向分面板传递全局能力 */
export interface PanelContext {
    /** 面板实例 */
    panel: any;
    /** 工作区根目录 */
    workspace: string;
    /** 日志打印方法 (仅向窗口面板输出) */
    appendLog: LogCallback;
    /** 清空日志方法 */
    clearLog: () => void;
    /** 禁用/启用界面全部按钮 */
    setAllButtonsDisabled: (disabled: boolean) => void;
}
