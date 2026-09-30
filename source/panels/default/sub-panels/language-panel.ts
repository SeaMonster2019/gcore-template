/**
 * @file language-panel.ts
 * @description 多语言转表分面板控制器，解耦处理多语言 (luban.conf) 路径设置、动态语言生成、编辑器实时预览与多语言管理弹窗联动
 */

import { bindPickerBtn, queryElement } from '../common/dom-util';
import { LubanRunner } from '../common/luban-runner';
import { escapeHtml, normalizePathForStorage } from '../common/path-util';
import { StorageMgr } from '../common/storage-mgr';
import { PanelContext } from '../common/types';
import { LanguageModal } from './language-modal';

export class LanguagePanel {
    private context: PanelContext;
    private modal: LanguageModal;

    private langConfFileInp: HTMLInputElement | null = null;
    private langConfBtn: HTMLButtonElement | null = null;
    private manageLangBtn: HTMLButtonElement | null = null;

    private dynamicLangDirsContainer: HTMLElement | null = null;
    private dynamicLangBtnsContainer: HTMLElement | null = null;

    // 编辑器多语言预览选择控制节点
    private previewLangSelect: HTMLSelectElement | null = null;

    constructor(context: PanelContext) {
        this.context = context;
        this.modal = new LanguageModal(context, () => this.renderDynamicLangSections());
    }

    /**
     * 初始化多语言分面板节点与事件监听
     */
    public init(): void {
        const { panel, workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);

        // 检索基础节点
        this.langConfFileInp = (panel.$ && panel.$.langConfFile) || queryElement<HTMLInputElement>(panel, '#lang-conf-file');
        this.langConfBtn = (panel.$ && panel.$.langConfBtn) || queryElement<HTMLButtonElement>(panel, '#lang-conf-btn');
        this.manageLangBtn = (panel.$ && panel.$.manageLangBtn) || queryElement<HTMLButtonElement>(panel, '#manage-lang-btn');

        this.dynamicLangDirsContainer = (panel.$ && panel.$.dynamicLangDirs) || queryElement<HTMLElement>(panel, '#dynamic-lang-dirs');
        this.dynamicLangBtnsContainer = (panel.$ && panel.$.dynamicLangBtns) || queryElement<HTMLElement>(panel, '#dynamic-lang-btns');

        // 检索预览语言选择节点
        this.previewLangSelect = (panel.$ && panel.$.previewLangSelect) || queryElement<HTMLSelectElement>(panel, '#preview-lang-select');

        // 初始化弹窗 B
        this.modal.init();

        // 应用初始状态
        if (this.langConfFileInp) this.langConfFileInp.value = state.langConfFile;

        // 绑定路径输入事件
        if (this.langConfFileInp) {
            this.langConfFileInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.langConfFileInp!.value, workspace);
                StorageMgr.saveState({ langConfFile: val }, workspace);
            });
        }

        // 绑定选择器按钮
        bindPickerBtn(
            this.langConfBtn,
            this.langConfFileInp,
            '选择多语言 luban.conf 文件',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ langConfFile: val }, workspace),
            appendLog,
            [{ name: 'Luban Conf', extensions: ['conf', 'json'] }]
        );

        // 绑定“⚙ 语言管理”按钮 (按钮 A)
        if (this.manageLangBtn) {
            this.manageLangBtn.addEventListener('click', () => this.modal.open());
        }

        // 绑定预览语言切换下拉框
        if (this.previewLangSelect) {
            this.previewLangSelect.addEventListener('change', () => {
                const previewLang = this.previewLangSelect!.value;
                StorageMgr.saveState({ previewLang }, workspace);
                Editor.Message.send('gcore-framework', 'setPreviewLang', previewLang);
                appendLog(`修改编辑器预览语言为: ${previewLang}`, 'info');
            });
        }

        // 初始渲染动态语言目录与转表按钮
        this.renderDynamicLangSections();
    }

    /**
     * 动态渲染各语言数据输出路径、预览语言下拉框与转表按钮
     */
    public renderDynamicLangSections(): void {
        const { panel, workspace } = this.context;
        const currentState = StorageMgr.loadState(workspace);

        const containerDirs = (panel.$ && panel.$.dynamicLangDirs) || this.dynamicLangDirsContainer || queryElement<HTMLElement>(panel, '#dynamic-lang-dirs');
        const containerBtns = (panel.$ && panel.$.dynamicLangBtns) || this.dynamicLangBtnsContainer || queryElement<HTMLElement>(panel, '#dynamic-lang-btns');
        const selectElem = (panel.$ && panel.$.previewLangSelect) || this.previewLangSelect || queryElement<HTMLSelectElement>(panel, '#preview-lang-select');

        // 1. 渲染预览语言下拉框选项
        if (selectElem) {
            selectElem.innerHTML = '';
            currentState.languages.forEach((lang) => {
                const opt = document.createElement('option');
                opt.value = lang.code;
                opt.textContent = `${lang.name} (${lang.code})`;
                if (lang.code === currentState.previewLang) {
                    opt.selected = true;
                }
                selectElem.appendChild(opt);
            });

            // 若当前设定的预览语言不在列表中，修正默认选第一项
            if (currentState.languages.length > 0 && !currentState.languages.some((l) => l.code === currentState.previewLang)) {
                const fallbackLang = currentState.languages[0].code;
                selectElem.value = fallbackLang;
                StorageMgr.saveState({ previewLang: fallbackLang }, workspace);
                Editor.Message.send('gcore-framework', 'setPreviewLang', fallbackLang);
            }
        }

        // 2. 渲染数据输出路径列表
        if (containerDirs) {
            containerDirs.innerHTML = '';
            currentState.languages.forEach((lang) => {
                const dirPath = currentState.langDataDirs[lang.code] || '';
                const groupDiv = document.createElement('div');
                groupDiv.className = 'form-group';
                groupDiv.innerHTML = `
                    <label>${escapeHtml(lang.name)} (${escapeHtml(lang.code)}) 数据输出目录：</label>
                    <div class="file-picker">
                        <input id="lang-data-${escapeHtml(lang.code)}" type="text" value="${escapeHtml(dirPath)}" placeholder="" />
                        <button type="button" id="lang-data-btn-${escapeHtml(lang.code)}">选择文件夹</button>
                    </div>
                `;
                containerDirs.appendChild(groupDiv);

                const inp = groupDiv.querySelector(`#lang-data-${escapeHtml(lang.code)}`) as HTMLInputElement | null;
                const btn = groupDiv.querySelector(`#lang-data-btn-${escapeHtml(lang.code)}`) as HTMLButtonElement | null;

                if (inp) {
                    inp.addEventListener('input', () => {
                        const normalized = normalizePathForStorage(inp.value, workspace);
                        currentState.langDataDirs[lang.code] = normalized;
                        StorageMgr.saveState({ langDataDirs: currentState.langDataDirs }, workspace);
                    });
                }

                bindPickerBtn(btn, inp, `选择 ${lang.name} (${lang.code}) 数据输出文件夹`, 'directory', workspace, (val) => {
                    currentState.langDataDirs[lang.code] = val;
                    StorageMgr.saveState({ langDataDirs: currentState.langDataDirs }, workspace);
                });
            });
        }

        // 3. 渲染操作按钮列表
        if (containerBtns) {
            containerBtns.innerHTML = '';

            // 全量生成多语言按钮
            const allBtn = document.createElement('button');
            allBtn.id = 'gen-lang-all-btn';
            allBtn.className = 'primary-btn';
            allBtn.type = 'button';
            allBtn.textContent = `全量生成多语言 (${currentState.languages.length}种)`;
            allBtn.addEventListener('click', () => void this.executeGenerateAllLangs());
            containerBtns.appendChild(allBtn);

            // 通用单个语言转换按钮
            currentState.languages.forEach((lang) => {
                const singleBtn = document.createElement('button');
                singleBtn.type = 'button';
                singleBtn.className = 'lang-single-btn';
                singleBtn.textContent = `生成 ${lang.name} (${lang.code})`;
                singleBtn.addEventListener('click', () => void this.executeGenerateSingleLang(lang.code, lang.name));
                containerBtns.appendChild(singleBtn);
            });
        }
    }

    /**
     * 执行单个语言导出（仅导出二进制数据包，无需导出业务层 TS 模板脚本）
     */
    private async executeGenerateSingleLang(langCode: string, langName: string): Promise<boolean> {
        const { workspace, appendLog, setAllButtonsDisabled } = this.context;
        const curState = StorageMgr.loadState(workspace);
        const dataDir = curState.langDataDirs[langCode] || `assets/language/pack-${langCode}`;

        setAllButtonsDisabled(true);
        try {
            appendLog(`=== 开始生成 ${langName} (${langCode}) 多语言包 ===`);
            const ok = await LubanRunner.run(curState.langConfFile, langCode, null, dataDir, workspace, appendLog);
            if (ok) {
                Editor.Message.send('gcore-framework', 'reloadCsvData');
            }
            return ok;
        } finally {
            setAllButtonsDisabled(false);
        }
    }

    /**
     * 执行全量语言导出（仅导出二进制数据包，无需导出业务层 TS 模板脚本）
     */
    private async executeGenerateAllLangs(): Promise<void> {
        const { workspace, appendLog, setAllButtonsDisabled } = this.context;
        const curState = StorageMgr.loadState(workspace);

        if (curState.languages.length === 0) {
            appendLog('未配置任何语言，请先在“⚙ 语言管理”中添加语言。', 'error');
            return;
        }

        setAllButtonsDisabled(true);
        try {
            appendLog(`=== 开始全量生成多语言 (${curState.languages.length} 种语言) ===`);
            for (let i = 0; i < curState.languages.length; i++) {
                const lang = curState.languages[i];
                const dataDir = curState.langDataDirs[lang.code] || `assets/language/pack-${lang.code}`;
                appendLog(`[${i + 1}/${curState.languages.length}] 生成 ${lang.name} (${lang.code}) ...`);
                const ok = await LubanRunner.run(curState.langConfFile, lang.code, null, dataDir, workspace, appendLog);
                if (!ok) {
                    appendLog(`生成 ${lang.name} (${lang.code}) 失败，中断后续流程`, 'error');
                    break;
                }
            }
            Editor.Message.send('gcore-framework', 'reloadCsvData');
        } finally {
            setAllButtonsDisabled(false);
        }
    }
}
