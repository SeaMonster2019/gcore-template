/**
 * @file storage-mgr.ts
 * @description 本地持久化存储管理器，支持在面板渲染进程 (localStorage) 与主进程 (文件存储) 之间同步状态
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GCoreProjectConfig, LubanToolState } from './types';

/** 本地存储 Key (用于非文件持久化的常规参数) */
const STORAGE_KEY = 'gcore-framework.luban-tool.state';

/** 根目录下持久化文件名 */
const GCORE_CONFIG_FILENAME = 'gcore-config.json';

/** 默认初始状态数据 */
export const DEFAULT_STATE: LubanToolState = {
    activeTab: 'tab-1',
    cfgConfFile: '',
    cfgCodeDir: '',
    cfgDataDir: '',
    langConfFile: '',
    langCodeDir: '',
    languages: [
        { code: 'zh-Hans', name: '中文' },
        { code: 'en', name: '英文' },
    ],
    langDataDirs: {},
    httpServerEnabled: false,
    httpServerPort: 8989,
    previewLang: 'zh-Hans',
    metaCleanDir: '',
    fontFilePath: '',
    fontTargetLocation: '',
    fontCheckFilePath: '',
    fontCheckLang: 'zh-Hans',
    fontSubsetSourceFont: '',
    fontSubsetTextFile: '',
    fontSubsetTargetFont: '',
    fontConvertSourceFont: '',
    fontConvertTargetFormat: 'ttf',
    fontConvertTargetFont: '',
    projectRootDir: '',
};

/**
 * 状态存储管理器类
 */
export class StorageMgr {

    /**
     * 获取项目根路径（优先使用设置的自定义工程根目录）
     */
    public static getProjectRoot(projectPath?: string): string | null {
        if (projectPath) return projectPath;

        // 尝试从持久化状态读取自定义工程根目录
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.projectRootDir && parsed.projectRootDir.trim()) {
                        return parsed.projectRootDir.trim();
                    }
                }
            }
        } catch (_) {}

        return (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path ? Editor.Project.path : null);
    }

    /**
     * 获取项目根目录下的 gcore-config.json 文件路径
     */
    public static getGCoreConfigPath(projectPath?: string): string | null {
        const root = this.getProjectRoot(projectPath);
        if (!root) return null;
        return join(root, GCORE_CONFIG_FILENAME);
    }

    /**
     * 获取常规非关键参数缓存文件路径 (temp/gcore-lang-state.json)
     */
    private static getTempFilePath(projectPath?: string): string | null {
        const root = (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path ? Editor.Project.path : projectPath);
        if (!root) return null;
        return join(root, 'temp', 'gcore-lang-state.json');
    }

    /**
     * 从项目根目录下加载 gcore-config.json
     * @param projectPath 可选项目根路径
     * @returns GCoreProjectConfig 或 null
     */
    public static loadProjectConfig(projectPath?: string): GCoreProjectConfig | null {
        try {
            const filePath = this.getGCoreConfigPath(projectPath);
            if (filePath && existsSync(filePath)) {
                const raw = readFileSync(filePath, 'utf-8');
                if (raw) {
                    return JSON.parse(raw) as GCoreProjectConfig;
                }
            }
        } catch (e) {
            console.warn('[StorageMgr] 读取 gcore-config.json 失败:', e);
        }
        return null;
    }

    /**
     * 保存关键配置到项目根目录下的 gcore-config.json
     * @param patch 待更新的关键配置
     * @param projectPath 可选项目根路径
     */
    public static saveProjectConfig(patch: Partial<GCoreProjectConfig>, projectPath?: string): void {
        try {
            const filePath = this.getGCoreConfigPath(projectPath);
            if (!filePath) return;

            const current = this.loadProjectConfig(projectPath) || {};
            const next: GCoreProjectConfig = {
                cfgConfFile: patch.cfgConfFile !== undefined ? patch.cfgConfFile : (current.cfgConfFile ?? DEFAULT_STATE.cfgConfFile),
                cfgCodeDir: patch.cfgCodeDir !== undefined ? patch.cfgCodeDir : (current.cfgCodeDir ?? DEFAULT_STATE.cfgCodeDir),
                cfgDataDir: patch.cfgDataDir !== undefined ? patch.cfgDataDir : (current.cfgDataDir ?? DEFAULT_STATE.cfgDataDir),
                langConfFile: patch.langConfFile !== undefined ? patch.langConfFile : (current.langConfFile ?? DEFAULT_STATE.langConfFile),
                langCodeDir: patch.langCodeDir !== undefined ? patch.langCodeDir : (current.langCodeDir ?? DEFAULT_STATE.langCodeDir),
                languages: patch.languages !== undefined ? patch.languages : (current.languages ?? DEFAULT_STATE.languages),
                langDataDirs: patch.langDataDirs !== undefined ? patch.langDataDirs : (current.langDataDirs ?? DEFAULT_STATE.langDataDirs),
            };

            const jsonStr = JSON.stringify(next, null, 2);
            writeFileSync(filePath, jsonStr, 'utf-8');
        } catch (e) {
            console.warn('[StorageMgr] 保存 gcore-config.json 失败:', e);
        }
    }

    /**
     * 加载持久化状态
     * 关键配置优先从 gcore-config.json 恢复，若不存在则使用默认参数；其他配置从原本持久化介质恢复
     * @param projectPath 可选项目根路径（主要用于主进程）
     * @returns LubanToolState 状态对象
     */
    public static loadState(projectPath?: string): LubanToolState {
        let otherState: Partial<LubanToolState> = {};

        try {
            // 尝试读取 localStorage（面板渲染进程）
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    otherState = JSON.parse(raw);
                }
            } else {
                // 尝试从 temp 状态文件读取（主进程）
                const tempPath = this.getTempFilePath(projectPath);
                if (tempPath && existsSync(tempPath)) {
                    const raw = readFileSync(tempPath, 'utf-8');
                    if (raw) {
                        otherState = JSON.parse(raw);
                    }
                }
            }
        } catch (e) {
            console.warn('[StorageMgr] 加载常规持久化状态失败:', e);
        }

        // 关键配置优先从项目根目录 gcore-config.json 文件读取，若无则使用 DEFAULT_STATE
        const projectConfig = this.loadProjectConfig(projectPath);

        return this.mergeState(otherState, projectConfig);
    }

    /**
     * 保存增量状态
     * 若包含关键配置（多语言、配置表路径等），同步写入项目根目录 gcore-config.json；全量状态同时保存在原本介质中
     * @param patch 待更新的增量状态
     * @param projectPath 可选项目根路径
     */
    public static saveState(patch: Partial<LubanToolState>, projectPath?: string): void {
        const current = this.loadState(projectPath);
        const next = { ...current, ...patch };

        // 1. 如果 patch 包含需要文件持久化的关键配置，写入根目录 gcore-config.json
        const hasKeyConfig = 'cfgConfFile' in patch ||
            'cfgCodeDir' in patch ||
            'cfgDataDir' in patch ||
            'langConfFile' in patch ||
            'langCodeDir' in patch ||
            'languages' in patch ||
            'langDataDirs' in patch;

        if (hasKeyConfig) {
            this.saveProjectConfig({
                cfgConfFile: next.cfgConfFile,
                cfgCodeDir: next.cfgCodeDir,
                cfgDataDir: next.cfgDataDir,
                langConfFile: next.langConfFile,
                langCodeDir: next.langCodeDir,
                languages: next.languages,
                langDataDirs: next.langDataDirs,
            }, projectPath);
        }

        // 2. 原有持久化介质（localStorage & temp 文件）
        const jsonStr = JSON.stringify(next, null, 2);

        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, jsonStr);
            }
        } catch (e) {
            console.warn('[StorageMgr] 保存 localStorage 状态失败:', e);
        }

        try {
            const tempPath = this.getTempFilePath(projectPath);
            if (tempPath) {
                const tempDir = join(tempPath, '..');
                if (!existsSync(tempDir)) {
                    mkdirSync(tempDir, { recursive: true });
                }
                writeFileSync(tempPath, jsonStr, 'utf-8');
            }
        } catch (e) {
            console.warn('[StorageMgr] 保存 temp 状态文件失败:', e);
        }
    }

    /**
     * 合并常规配置与关键文件配置
     */
    private static mergeState(other: Partial<LubanToolState>, projectCfg: GCoreProjectConfig | null): LubanToolState {
        // 关键配置：优先使用 gcore-config.json 文件恢复，否则使用默认参数
        const languages = projectCfg && Array.isArray(projectCfg.languages)
            ? projectCfg.languages
            : DEFAULT_STATE.languages;

        const langDataDirs = projectCfg && projectCfg.langDataDirs
            ? projectCfg.langDataDirs
            : { ...DEFAULT_STATE.langDataDirs };

        const cfgConfFile = projectCfg?.cfgConfFile !== undefined ? projectCfg.cfgConfFile : DEFAULT_STATE.cfgConfFile;
        const cfgCodeDir = projectCfg?.cfgCodeDir !== undefined ? projectCfg.cfgCodeDir : DEFAULT_STATE.cfgCodeDir;
        const cfgDataDir = projectCfg?.cfgDataDir !== undefined ? projectCfg.cfgDataDir : DEFAULT_STATE.cfgDataDir;
        const langConfFile = projectCfg?.langConfFile !== undefined ? projectCfg.langConfFile : DEFAULT_STATE.langConfFile;
        const langCodeDir = projectCfg?.langCodeDir !== undefined ? projectCfg.langCodeDir : DEFAULT_STATE.langCodeDir;

        // 非关键配置与 UI 状态：从原本的持久化 (other) 恢复
        const validTab = other.activeTab === 'tab-2' || other.activeTab === 'tab-3' || other.activeTab === 'tab-4' || other.activeTab === 'tab-5' ? other.activeTab : 'tab-1';

        return {
            // 关键配置 (文件优先)
            cfgConfFile,
            cfgCodeDir,
            cfgDataDir,
            langConfFile,
            langCodeDir,
            languages,
            langDataDirs,

            // 其他配置 (原本持久化)
            activeTab: validTab,
            httpServerEnabled: false,
            httpServerPort: 8989,
            previewLang: other.previewLang ?? DEFAULT_STATE.previewLang,
            metaCleanDir: other.metaCleanDir ?? DEFAULT_STATE.metaCleanDir,
            fontFilePath: other.fontFilePath ?? DEFAULT_STATE.fontFilePath,
            fontTargetLocation: other.fontTargetLocation ?? DEFAULT_STATE.fontTargetLocation,
            fontCheckFilePath: other.fontCheckFilePath ?? DEFAULT_STATE.fontCheckFilePath,
            fontCheckLang: other.fontCheckLang ?? DEFAULT_STATE.fontCheckLang,
            fontSubsetSourceFont: other.fontSubsetSourceFont ?? DEFAULT_STATE.fontSubsetSourceFont,
            fontSubsetTextFile: other.fontSubsetTextFile ?? DEFAULT_STATE.fontSubsetTextFile,
            fontSubsetTargetFont: other.fontSubsetTargetFont ?? DEFAULT_STATE.fontSubsetTargetFont,
            fontConvertSourceFont: other.fontConvertSourceFont ?? DEFAULT_STATE.fontConvertSourceFont,
            fontConvertTargetFormat: other.fontConvertTargetFormat === 'otf' ? 'otf' : 'ttf',
            fontConvertTargetFont: other.fontConvertTargetFont ?? DEFAULT_STATE.fontConvertTargetFont,
            projectRootDir: other.projectRootDir ?? DEFAULT_STATE.projectRootDir,
        };
    }
}
