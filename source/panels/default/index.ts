/**
 * @file index.ts
 * @description Luban 工具面板入口主文件（总面板控制器），负责定义 Editor.Panel、编排分面板及绑定公共通信与日志逻辑
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { queryElement } from './common/dom-util';
import { escapeHtml, getWorkspacePath } from './common/path-util';
import { StorageMgr } from './common/storage-mgr';
import { LogCallback, LogType, PanelContext, TabName } from './common/types';
import { ConfigPanel } from './sub-panels/config-panel';
import { FontPanel } from './sub-panels/font-panel';
import { LanguagePanel } from './sub-panels/language-panel';
import { SettingsPanel } from './sub-panels/settings-panel';
import { ToolsPanel } from './sub-panels/tools-panel';

/**
 * 切换页签管理器
 * @param panel 面板实例
 * @param initialTab 初始激活页签
 * @param onTabChange 页签变更回调
 */
function setupTabSwitcher(panel: any, initialTab: TabName = 'tab-1', onTabChange?: (tabId: TabName) => void): void {
    const tabHeader = (panel.$ && panel.$.tabHeader) || queryElement(panel, '.tab-header');
    if (!tabHeader) return;

    const tabButtons = tabHeader.querySelectorAll('.tab-btn');
    const tabContent = (panel.$ && panel.$.tabContent) || queryElement(panel, '.tab-content');
    const tabPanes = tabContent ? tabContent.querySelectorAll('.tab-pane') : [];

    const activateTab = (tabId: TabName) => {
        tabButtons.forEach((button: HTMLElement) => button.classList.remove('active'));
        tabPanes.forEach((pane: HTMLElement) => pane.classList.remove('active'));

        const activeButton = tabHeader.querySelector(`.tab-btn[data-tab="${tabId}"]`) as HTMLElement | null;
        const activePane = tabContent ? (tabContent.querySelector(`#${tabId}`) as HTMLElement | null) : null;

        activeButton?.classList.add('active');
        activePane?.classList.add('active');

        if (onTabChange) {
            onTabChange(tabId);
        }
    };

    tabButtons.forEach((button: HTMLElement) => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab') as TabName | null;
            if (!tabId || (tabId !== 'tab-1' && tabId !== 'tab-2' && tabId !== 'tab-3' && tabId !== 'tab-4' && tabId !== 'tab-5')) {
                return;
            }
            activateTab(tabId);
            StorageMgr.saveState({ activeTab: tabId });
        });
    });

    activateTab(initialTab);
}

/**
 * 初始化总面板及其子功能模块
 * @param panel 面板实例
 */
function initMainPanel(panel: any): void {
    const workspace = getWorkspacePath();
    const state = StorageMgr.loadState();

    // 基础公共控制节点
    const statusArea = (panel.$ && panel.$.statusArea) || queryElement<HTMLTextAreaElement>(panel, '#status-area');
    const clearLogBtn = (panel.$ && panel.$.clearLogBtn) || queryElement<HTMLButtonElement>(panel, '#clear-log-btn');

    /** 仅在扩展窗口面板日志区输出日志 */
    const appendLog: LogCallback = (msg: string, type: LogType = 'info') => {
        const targetArea = (panel.$ && panel.$.statusArea) || statusArea || queryElement<HTMLTextAreaElement>(panel, '#status-area');
        if (targetArea) {
            const prefix = type === 'error' ? '[ERROR] ' : type === 'success' ? '[SUCCESS] ' : '';
            const logLine = `${prefix}${msg}\n`;
            if ('value' in targetArea) {
                targetArea.value += logLine;
                targetArea.scrollTop = targetArea.scrollHeight;
            } else {
                const cls = type === 'error' ? 'status-error' : type === 'success' ? 'status-success' : 'status-info';
                targetArea.innerHTML += `<div class="${cls}">${escapeHtml(msg)}</div>`;
                targetArea.scrollTop = targetArea.scrollHeight;
            }
        }
    };

    /** 清空面板日志 */
    const clearLog = () => {
        const targetArea = (panel.$ && panel.$.statusArea) || statusArea || queryElement<HTMLTextAreaElement>(panel, '#status-area');
        if (targetArea) {
            if ('value' in targetArea) {
                targetArea.value = '';
            } else {
                targetArea.textContent = '';
            }
        }
    };

    /** 禁用/启用面板所有按钮 */
    const setAllButtonsDisabled = (disabled: boolean) => {
        const root = (panel.$ && panel.$.tabContent) || queryElement(panel, '.tab-content');
        if (!root) return;
        const buttons = root.querySelectorAll('button');
        buttons.forEach((b: HTMLButtonElement) => {
            b.disabled = disabled;
        });
    };

    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', clearLog);
    }

    // 构造分面板共享上下文
    const context: PanelContext = {
        panel,
        workspace,
        appendLog,
        clearLog,
        setAllButtonsDisabled,
    };

    // 实例化并初始化各分面板控制器
    const configPanel = new ConfigPanel(context);
    configPanel.init();

    const languagePanel = new LanguagePanel(context);
    languagePanel.init();

    const fontPanel = new FontPanel(context);
    fontPanel.init();

    const toolsPanel = new ToolsPanel(context);
    toolsPanel.init();

    const settingsPanel = new SettingsPanel(context);
    settingsPanel.init();

    // 初始化页签切换功能
    setupTabSwitcher(panel, state.activeTab, (tabId) => {
        if (tabId === 'tab-3') {
            fontPanel.updateLanguageOptions();
        }
    });
}

/** Cocos Creator 扩展面板标准导出定义 */
module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('[gcore-panel]: show');
        },
        hide() {
            console.log('[gcore-panel]: hide');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        tabHeader: '.tab-header',
        tabContent: '.tab-content',
        statusArea: '#status-area',
        clearLogBtn: '#clear-log-btn',

        // 配置表分面板 DOM 选择器映射
        cfgConfFile: '#cfg-conf-file',
        cfgConfBtn: '#cfg-conf-btn',
        cfgCodeDir: '#cfg-code-dir',
        cfgCodeBtn: '#cfg-code-btn',
        cfgDataDir: '#cfg-data-dir',
        cfgDataBtn: '#cfg-data-btn',
        genCfgBtn: '#gen-cfg-btn',

        // 多语言分面板 DOM 选择器映射
        langConfFile: '#lang-conf-file',
        langConfBtn: '#lang-conf-btn',
        langCodeDir: '#lang-code-dir',
        langCodeBtn: '#lang-code-btn',
        manageLangBtn: '#manage-lang-btn',
        dynamicLangDirs: '#dynamic-lang-dirs',
        dynamicLangBtns: '#dynamic-lang-btns',
        httpServerToggle: '#http-server-toggle',
        httpServerPort: '#http-server-port',
        previewLangSelect: '#preview-lang-select',

        // 语言管理弹窗 B DOM 选择器映射
        langModal: '#lang-modal',
        modalCloseBtn: '#modal-close-btn',
        modalSaveBtn: '#modal-save-btn',
        modalResetBtn: '#modal-reset-btn',
        addLangBtn: '#add-lang-btn',
        newLangCode: '#new-lang-code',
        newLangName: '#new-lang-name',
        langListTbody: '#lang-list-tbody',

        // 字体工具分面板 DOM 选择器映射 (Tab 3)
        fontCheckFilePath: '#font-check-file-path',
        fontCheckFileBtn: '#font-check-file-btn',
        fontCheckLangSelect: '#font-check-lang-select',
        checkFontBtn: '#check-font-btn',
        checkFontAndCopyBtn: '#check-font-and-copy-btn',
        fontSubsetSourceFont: '#font-subset-source-font',
        fontSubsetSourceBtn: '#font-subset-source-btn',
        fontSubsetTextFile: '#font-subset-text-file',
        fontSubsetTextBtn: '#font-subset-text-btn',
        subsetFontBtn: '#subset-font-btn',
        fontConvertSourceFont: '#font-convert-source-font',
        fontConvertSourceBtn: '#font-convert-source-btn',
        fontConvertTargetFormat: '#font-convert-target-format',
        convertFontBtn: '#convert-font-btn',
        fontFilePath: '#font-file-path',
        fontFileBtn: '#font-file-btn',
        fontTargetLoc: '#font-target-loc',
        fontTargetCurrentBtn: '#font-target-current-btn',
        fontTargetFileBtn: '#font-target-file-btn',
        fontTargetDirBtn: '#font-target-dir-btn',
        replaceFontBtn: '#replace-font-btn',

        // 小工具集合分面板 DOM 选择器映射 (Tab 4)
        metaCleanDir: '#meta-clean-dir',
        metaCleanDirBtn: '#meta-clean-dir-btn',
        cleanMetaBtn: '#clean-meta-btn',

        // 工具设置分面板 DOM 选择器映射 (Tab 5)
        projectRootDir: '#project-root-dir',
        projectRootBtn: '#project-root-btn',
        projectRootClearBtn: '#project-root-clear-btn',
    },
    methods: {
    },
    ready() {
        try {
            initMainPanel(this);
        } catch (e) {
            console.error('initMainPanel error', e);
        }
    },
    beforeClose() { },
    close() { },
});
