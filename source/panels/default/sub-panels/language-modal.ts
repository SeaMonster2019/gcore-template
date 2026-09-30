/**
 * @file language-modal.ts
 * @description 多语言管理弹窗 (弹窗 B) 控制器，负责多语言列表增加、删除、重置与保存
 */

import { queryElement } from '../common/dom-util';

import { escapeHtml } from '../common/path-util';
import { StorageMgr } from '../common/storage-mgr';
import { LanguageItem, PanelContext } from '../common/types';

export class LanguageModal {
    private context: PanelContext;
    private onStateChanged: () => void;

    private tempLanguages: LanguageItem[] = [];

    private langModal: HTMLElement | null = null;
    private modalCloseBtn: HTMLButtonElement | null = null;
    private modalSaveBtn: HTMLButtonElement | null = null;
    private modalResetBtn: HTMLButtonElement | null = null;
    private addLangBtn: HTMLButtonElement | null = null;
    private newLangCodeInp: HTMLInputElement | null = null;
    private newLangNameInp: HTMLInputElement | null = null;
    private langListTbody: HTMLElement | null = null;

    constructor(context: PanelContext, onStateChanged: () => void) {
        this.context = context;
        this.onStateChanged = onStateChanged;
    }

    /**
     * 初始化弹窗 DOM 节点与事件绑定
     */
    public init(): void {
        const { panel, appendLog } = this.context;

        this.langModal = (panel.$ && panel.$.langModal) || queryElement<HTMLElement>(panel, '#lang-modal');
        this.modalCloseBtn = (panel.$ && panel.$.modalCloseBtn) || queryElement<HTMLButtonElement>(panel, '#modal-close-btn');
        this.modalSaveBtn = (panel.$ && panel.$.modalSaveBtn) || queryElement<HTMLButtonElement>(panel, '#modal-save-btn');
        this.modalResetBtn = (panel.$ && panel.$.modalResetBtn) || queryElement<HTMLButtonElement>(panel, '#modal-reset-btn');
        this.addLangBtn = (panel.$ && panel.$.addLangBtn) || queryElement<HTMLButtonElement>(panel, '#add-lang-btn');
        this.newLangCodeInp = (panel.$ && panel.$.newLangCode) || queryElement<HTMLInputElement>(panel, '#new-lang-code');
        this.newLangNameInp = (panel.$ && panel.$.newLangName) || queryElement<HTMLInputElement>(panel, '#new-lang-name');
        this.langListTbody = (panel.$ && panel.$.langListTbody) || queryElement<HTMLElement>(panel, '#lang-list-tbody');

        // 关闭弹窗
        if (this.modalCloseBtn) {
            this.modalCloseBtn.addEventListener('click', () => this.close());
        }

        // 添加语言项
        if (this.addLangBtn) {
            this.addLangBtn.addEventListener('click', () => {
                const code = this.newLangCodeInp?.value.trim();
                const name = this.newLangNameInp?.value.trim();

                if (!code || !name) {
                    appendLog('新增语言失败：语言代码与语言名称均不能为空。', 'error');
                    return;
                }

                if (this.tempLanguages.some((l) => l.code.toLowerCase() === code.toLowerCase())) {
                    appendLog(`新增语言失败：语言代码 [${code}] 已存在。`, 'error');
                    return;
                }

                this.tempLanguages.push({ code, name });
                if (this.newLangCodeInp) this.newLangCodeInp.value = '';
                if (this.newLangNameInp) this.newLangNameInp.value = '';
                this.renderModalTable();
            });
        }

        // 保存设置按钮
        if (this.modalSaveBtn) {
            this.modalSaveBtn.addEventListener('click', () => {
                const currentState = StorageMgr.loadState();
                currentState.languages = [...this.tempLanguages];
                // 确保新语言存在默认数据输出路径
                currentState.languages.forEach((l) => {
                    if (!currentState.langDataDirs[l.code]) {
                        currentState.langDataDirs[l.code] = `assets/language/pack-${l.code}`;
                    }
                });
                StorageMgr.saveState({
                    languages: currentState.languages,
                    langDataDirs: currentState.langDataDirs,
                });
                this.close();
                this.onStateChanged();
                appendLog('语言列表设置已保存！', 'success');
            });
        }

        // 重置为默认中英文按钮
        if (this.modalResetBtn) {
            this.modalResetBtn.addEventListener('click', () => {
                this.tempLanguages = [
                    { code: 'zh-Hans', name: '中文' },
                    { code: 'en', name: '英文' },
                ];
                const currentState = StorageMgr.loadState();
                currentState.languages = [...this.tempLanguages];
                currentState.languages.forEach((l) => {
                    if (!currentState.langDataDirs[l.code]) {
                        currentState.langDataDirs[l.code] = `assets/language/pack-${l.code}`;
                    }
                });
                StorageMgr.saveState({
                    languages: currentState.languages,
                    langDataDirs: currentState.langDataDirs,
                });
                this.renderModalTable();
                this.close();
                this.onStateChanged();
                appendLog('语言列表已重置为默认中文与英文并保存！', 'success');
            });
        }
    }

    /**
     * 打开语言管理弹窗
     */
    public open(): void {
        const currentState = StorageMgr.loadState();
        this.tempLanguages = [...currentState.languages];
        if (this.langModal) {
            this.langModal.style.display = 'flex';
        }
        this.renderModalTable();
    }

    /**
     * 关闭语言管理弹窗
     */
    public close(): void {
        if (this.langModal) {
            this.langModal.style.display = 'none';
        }
    }

    /**
     * 渲染弹窗内语言表格列表
     */
    private renderModalTable(): void {
        const tbody = (this.context.panel.$ && this.context.panel.$.langListTbody) || this.langListTbody || queryElement<HTMLElement>(this.context.panel, '#lang-list-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.tempLanguages.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--color-normal-contrast-weakest);">暂未配置任何语言</td></tr>`;
            return;
        }

        this.tempLanguages.forEach((item) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${escapeHtml(item.code)}</code></td>
                <td>${escapeHtml(item.name)}</td>
                <td><button type="button" class="danger-btn del-btn" data-code="${escapeHtml(item.code)}">删除</button></td>
            `;
            const delBtn = tr.querySelector('.del-btn') as HTMLButtonElement | null;
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    this.tempLanguages = this.tempLanguages.filter((l) => l.code !== item.code);
                    this.renderModalTable();
                });
            }
            tbody.appendChild(tr);
        });
    }
}
