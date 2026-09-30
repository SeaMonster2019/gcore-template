/**
 * @file font-panel.ts
 * @description 字体工具分面板控制器，汇聚字体缺字检测、抽字压缩 (子集化)、TTF/OTF 格式互转以及预制体/场景字体批量替换等字体全链路处理工具
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, relative } from 'path';
import { bindPickerBtn, copyToClipboard, pickSavePath, queryElement } from '../common/dom-util';
import { FontChecker } from '../common/font-checker';
import { FontConverter, SupportedFontFormat } from '../common/font-converter';
import { FontSubsetter } from '../common/font-subsetter';
import { normalizePathForStorage } from '../common/path-util';
import { StorageMgr } from '../common/storage-mgr';
import { PanelContext } from '../common/types';

/**
 * 字体工具分面板控制器类 (Tab 3)
 */
export class FontPanel {
    /** 面板上下文，包含 workspace、日志输出等共享方法 */
    private context: PanelContext;

    // ==================== 工具 1：字体缺字检测控制节点 ====================
    /** 缺字检测：待检测字体文件路径输入框 */
    private fontCheckFilePathInp: HTMLInputElement | null = null;
    /** 缺字检测：选择字体文件按钮 */
    private fontCheckFileBtn: HTMLButtonElement | null = null;
    /** 缺字检测：目标检测语言下拉选择框 */
    private fontCheckLangSelect: HTMLSelectElement | null = null;
    /** 缺字检测：开始检测按钮 */
    private checkFontBtn: HTMLButtonElement | null = null;
    /** 缺字检测：开始检测并复制缺字按钮 */
    private checkFontAndCopyBtn: HTMLButtonElement | null = null;

    // ==================== 工具 2：字体抽字压缩控制节点 ====================
    /** 抽字压缩：源字体文件路径输入框 */
    private fontSubsetSourceFontInp: HTMLInputElement | null = null;
    /** 抽字压缩：选择源字体文件按钮 */
    private fontSubsetSourceBtn: HTMLButtonElement | null = null;
    /** 抽字压缩：参考文本文件路径输入框 */
    private fontSubsetTextFileInp: HTMLInputElement | null = null;
    /** 抽字压缩：选择参考文本文件按钮 */
    private fontSubsetTextBtn: HTMLButtonElement | null = null;
    /** 抽字压缩：开始压缩并导出按钮 */
    private subsetFontBtn: HTMLButtonElement | null = null;

    // ==================== 工具 3：字体格式互转控制节点 ====================
    /** 格式互转：源字体文件路径输入框 */
    private fontConvertSourceFontInp: HTMLInputElement | null = null;
    /** 格式互转：选择源字体文件按钮 */
    private fontConvertSourceBtn: HTMLButtonElement | null = null;
    /** 格式互转：目标转换格式下拉选择框 */
    private fontConvertTargetFormatSelect: HTMLSelectElement | null = null;
    /** 格式互转：开始转换并导出按钮 */
    private convertFontBtn: HTMLButtonElement | null = null;

    // ==================== 工具 4：字体批量替换控制节点 ====================
    /** 批量替换：目标字体资源文件路径输入框 */
    private fontFilePathInp: HTMLInputElement | null = null;
    /** 批量替换：选择字体文件按钮 */
    private fontFileBtn: HTMLButtonElement | null = null;
    /** 批量替换：目标预制体/场景位置输入框 */
    private fontTargetLocInp: HTMLInputElement | null = null;
    /** 批量替换：选中当前打开场景/预制体按钮 */
    private fontTargetCurrentBtn: HTMLButtonElement | null = null;
    /** 批量替换：选择目标文件按钮 */
    private fontTargetFileBtn: HTMLButtonElement | null = null;
    /** 批量替换：选择目标文件夹按钮 */
    private fontTargetDirBtn: HTMLButtonElement | null = null;
    /** 批量替换：执行批量替换按钮 */
    private replaceFontBtn: HTMLButtonElement | null = null;

    constructor(context: PanelContext) {
        this.context = context;
    }

    /**
     * 初始化字体工具分面板节点与事件监听
     */
    public init(): void {
        const { panel, workspace, appendLog, setAllButtonsDisabled } = this.context;
        const state = StorageMgr.loadState(workspace);

        // ==================== 工具 1：字体缺字检测 ====================
        this.fontCheckFilePathInp = (panel.$ && panel.$.fontCheckFilePath) || queryElement<HTMLInputElement>(panel, '#font-check-file-path');
        this.fontCheckFileBtn = (panel.$ && panel.$.fontCheckFileBtn) || queryElement<HTMLButtonElement>(panel, '#font-check-file-btn');
        this.fontCheckLangSelect = (panel.$ && panel.$.fontCheckLangSelect) || queryElement<HTMLSelectElement>(panel, '#font-check-lang-select');
        this.checkFontBtn = (panel.$ && panel.$.checkFontBtn) || queryElement<HTMLButtonElement>(panel, '#check-font-btn');
        this.checkFontAndCopyBtn = (panel.$ && panel.$.checkFontAndCopyBtn) || queryElement<HTMLButtonElement>(panel, '#check-font-and-copy-btn');

        if (this.fontCheckFilePathInp) this.fontCheckFilePathInp.value = state.fontCheckFilePath || '';

        if (this.fontCheckFilePathInp) {
            this.fontCheckFilePathInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.fontCheckFilePathInp!.value, workspace);
                StorageMgr.saveState({ fontCheckFilePath: val }, workspace);
            });
        }

        bindPickerBtn(
            this.fontCheckFileBtn,
            this.fontCheckFilePathInp,
            '选择待检测字体文件 (.ttf / .otf / .fnt)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ fontCheckFilePath: val }, workspace),
            appendLog,
            [
                { name: 'Font Files (*.ttf, *.otf, *.fnt)', extensions: ['ttf', 'otf', 'fnt', 'font', 'TTF', 'OTF', 'FNT'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        if (this.fontCheckLangSelect) {
            this.fontCheckLangSelect.addEventListener('change', () => {
                const selectedLang = this.fontCheckLangSelect!.value;
                StorageMgr.saveState({ fontCheckLang: selectedLang }, workspace);
            });
        }

        this.updateLanguageOptions();

        if (this.checkFontBtn) {
            this.checkFontBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeFontCheck(false);
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        if (this.checkFontAndCopyBtn) {
            this.checkFontAndCopyBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeFontCheck(true);
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        // ==================== 工具 2：字体抽字压缩 (子集化) ====================
        this.fontSubsetSourceFontInp = (panel.$ && panel.$.fontSubsetSourceFont) || queryElement<HTMLInputElement>(panel, '#font-subset-source-font');
        this.fontSubsetSourceBtn = (panel.$ && panel.$.fontSubsetSourceBtn) || queryElement<HTMLButtonElement>(panel, '#font-subset-source-btn');
        this.fontSubsetTextFileInp = (panel.$ && panel.$.fontSubsetTextFile) || queryElement<HTMLInputElement>(panel, '#font-subset-text-file');
        this.fontSubsetTextBtn = (panel.$ && panel.$.fontSubsetTextBtn) || queryElement<HTMLButtonElement>(panel, '#font-subset-text-btn');
        this.subsetFontBtn = (panel.$ && panel.$.subsetFontBtn) || queryElement<HTMLButtonElement>(panel, '#subset-font-btn');

        if (this.fontSubsetSourceFontInp) this.fontSubsetSourceFontInp.value = state.fontSubsetSourceFont || '';
        if (this.fontSubsetTextFileInp) this.fontSubsetTextFileInp.value = state.fontSubsetTextFile || '';

        if (this.fontSubsetSourceFontInp) {
            this.fontSubsetSourceFontInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.fontSubsetSourceFontInp!.value, workspace);
                StorageMgr.saveState({ fontSubsetSourceFont: val }, workspace);
            });
        }

        if (this.fontSubsetTextFileInp) {
            this.fontSubsetTextFileInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.fontSubsetTextFileInp!.value, workspace);
                StorageMgr.saveState({ fontSubsetTextFile: val }, workspace);
            });
        }

        bindPickerBtn(
            this.fontSubsetSourceBtn,
            this.fontSubsetSourceFontInp,
            '选择源字体文件 (.ttf / .otf)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ fontSubsetSourceFont: val }, workspace),
            appendLog,
            [
                { name: 'Font Files (*.ttf, *.otf)', extensions: ['ttf', 'otf', 'TTF', 'OTF'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        bindPickerBtn(
            this.fontSubsetTextBtn,
            this.fontSubsetTextFileInp,
            '选择参考文本文件 (.txt / .json / .csv / .md 等)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ fontSubsetTextFile: val }, workspace),
            appendLog,
            [
                { name: 'Text / Config Files (*.txt, *.json, *.csv, *.md)', extensions: ['txt', 'json', 'csv', 'md', 'ts', 'js', 'html', 'xml'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        if (this.subsetFontBtn) {
            this.subsetFontBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeFontSubset();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        // ==================== 工具 3：字体格式互转 ====================
        this.fontConvertSourceFontInp = (panel.$ && panel.$.fontConvertSourceFont) || queryElement<HTMLInputElement>(panel, '#font-convert-source-font');
        this.fontConvertSourceBtn = (panel.$ && panel.$.fontConvertSourceBtn) || queryElement<HTMLButtonElement>(panel, '#font-convert-source-btn');
        this.fontConvertTargetFormatSelect = (panel.$ && panel.$.fontConvertTargetFormat) || queryElement<HTMLSelectElement>(panel, '#font-convert-target-format');
        this.convertFontBtn = (panel.$ && panel.$.convertFontBtn) || queryElement<HTMLButtonElement>(panel, '#convert-font-btn');

        if (this.fontConvertSourceFontInp) this.fontConvertSourceFontInp.value = state.fontConvertSourceFont || '';
        if (this.fontConvertTargetFormatSelect) this.fontConvertTargetFormatSelect.value = state.fontConvertTargetFormat || 'ttf';

        if (this.fontConvertSourceFontInp) {
            this.fontConvertSourceFontInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.fontConvertSourceFontInp!.value, workspace);
                StorageMgr.saveState({ fontConvertSourceFont: val }, workspace);
            });
        }

        if (this.fontConvertTargetFormatSelect) {
            this.fontConvertTargetFormatSelect.addEventListener('change', () => {
                const fmt = this.fontConvertTargetFormatSelect!.value as SupportedFontFormat;
                StorageMgr.saveState({ fontConvertTargetFormat: fmt }, workspace);
            });
        }

        bindPickerBtn(
            this.fontConvertSourceBtn,
            this.fontConvertSourceFontInp,
            '选择待转换源字体文件 (.ttf / .otf)',
            'file',
            workspace,
            (val) => {
                StorageMgr.saveState({ fontConvertSourceFont: val }, workspace);
                // 智能切换目标格式：选了 ttf 默认转为 otf，选了 otf 默认转为 ttf
                const lower = val.toLowerCase();
                const nextFmt: SupportedFontFormat = lower.endsWith('.otf') ? 'ttf' : 'otf';
                if (this.fontConvertTargetFormatSelect) {
                    this.fontConvertTargetFormatSelect.value = nextFmt;
                }
                StorageMgr.saveState({ fontConvertTargetFormat: nextFmt }, workspace);
            },
            appendLog,
            [
                { name: 'Font Files (*.ttf, *.otf)', extensions: ['ttf', 'otf', 'TTF', 'OTF'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        if (this.convertFontBtn) {
            this.convertFontBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeFontConvert();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        // ==================== 工具 4：字体批量替换 ====================
        this.fontFilePathInp = (panel.$ && panel.$.fontFilePath) || queryElement<HTMLInputElement>(panel, '#font-file-path');
        this.fontFileBtn = (panel.$ && panel.$.fontFileBtn) || queryElement<HTMLButtonElement>(panel, '#font-file-btn');

        this.fontTargetLocInp = (panel.$ && panel.$.fontTargetLoc) || queryElement<HTMLInputElement>(panel, '#font-target-loc');
        this.fontTargetCurrentBtn = (panel.$ && panel.$.fontTargetCurrentBtn) || queryElement<HTMLButtonElement>(panel, '#font-target-current-btn');
        this.fontTargetFileBtn = (panel.$ && panel.$.fontTargetFileBtn) || queryElement<HTMLButtonElement>(panel, '#font-target-file-btn');
        this.fontTargetDirBtn = (panel.$ && panel.$.fontTargetDirBtn) || queryElement<HTMLButtonElement>(panel, '#font-target-dir-btn');

        this.replaceFontBtn = (panel.$ && panel.$.replaceFontBtn) || queryElement<HTMLButtonElement>(panel, '#replace-font-btn');

        if (this.fontFilePathInp) this.fontFilePathInp.value = state.fontFilePath || '';
        if (this.fontTargetLocInp) this.fontTargetLocInp.value = state.fontTargetLocation || '';

        if (this.fontFilePathInp) {
            this.fontFilePathInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.fontFilePathInp!.value, workspace);
                StorageMgr.saveState({ fontFilePath: val }, workspace);
            });
        }

        if (this.fontTargetLocInp) {
            this.fontTargetLocInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.fontTargetLocInp!.value, workspace);
                StorageMgr.saveState({ fontTargetLocation: val }, workspace);
            });
        }

        bindPickerBtn(
            this.fontFileBtn,
            this.fontFilePathInp,
            '选择目标字体资源文件 (.ttf / .otf / .fnt)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ fontFilePath: val }, workspace),
            appendLog,
            [
                { name: 'Font Files (*.ttf, *.otf, *.fnt)', extensions: ['ttf', 'otf', 'fnt', 'font', 'TTF', 'OTF', 'FNT'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        if (this.fontTargetCurrentBtn) {
            this.fontTargetCurrentBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.selectCurrentEditingAsset();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }

        bindPickerBtn(
            this.fontTargetFileBtn,
            this.fontTargetLocInp,
            '选择目标预制体或场景文件 (.prefab / .scene)',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ fontTargetLocation: val }, workspace),
            appendLog,
            [
                { name: 'Prefab / Scene (*.prefab, *.scene)', extensions: ['prefab', 'scene', 'PREFAB', 'SCENE'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        bindPickerBtn(
            this.fontTargetDirBtn,
            this.fontTargetLocInp,
            '选择包含预制体或场景的目标文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ fontTargetLocation: val }, workspace),
            appendLog
        );

        if (this.replaceFontBtn) {
            this.replaceFontBtn.addEventListener('click', async () => {
                setAllButtonsDisabled(true);
                try {
                    await this.executeFontReplaceFiles();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }
    }

    /**
     * 动态同步渲染多语言下拉选项列表（根据第二页多语言的多语言配置）
     */
    public updateLanguageOptions(): void {
        const { panel, workspace } = this.context;
        const selectElem = (panel.$ && panel.$.fontCheckLangSelect) || this.fontCheckLangSelect || queryElement<HTMLSelectElement>(panel, '#font-check-lang-select');
        if (!selectElem) return;

        const state = StorageMgr.loadState(workspace);
        const languages = state.languages || [];
        const currentSavedLang = state.fontCheckLang || state.previewLang || (languages[0] ? languages[0].code : 'zh-Hans');

        selectElem.innerHTML = '';
        languages.forEach((lang) => {
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = `${lang.name} (${lang.code})`;
            if (lang.code === currentSavedLang) {
                opt.selected = true;
            }
            selectElem.appendChild(opt);
        });

        if (languages.length > 0 && !languages.some((l) => l.code === currentSavedLang)) {
            const fallback = languages[0].code;
            selectElem.value = fallback;
            StorageMgr.saveState({ fontCheckLang: fallback }, workspace);
        }
    }

    /**
     * 工具 1：执行字体缺字检测
     * @param copyToClipboardFlag 是否将检测出的全部缺字自动复制到系统剪贴板
     */
    public async executeFontCheck(copyToClipboardFlag: boolean = false): Promise<void> {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const fontPath = (this.fontCheckFilePathInp && this.fontCheckFilePathInp.value.trim()) || state.fontCheckFilePath || '';
        const langCode = (this.fontCheckLangSelect && this.fontCheckLangSelect.value) || state.fontCheckLang || 'zh-Hans';

        if (!fontPath) {
            appendLog('请先选择待检测的字体文件 (.ttf / .otf / .fnt)。', 'error');
            return;
        }

        appendLog('=== 开始检测字体语言字符完整性 ===', 'info');
        const result = FontChecker.check(workspace, fontPath, langCode);

        if (result.error) {
            appendLog(`[检测失败] ${result.error}`, 'error');
            return;
        }

        appendLog(`目标字体: ${result.fontPath} (${result.fontType}, 包含 ${result.fontCharCount} 个字符字形)`, 'info');
        appendLog(`检测语言: ${result.langName} (${result.langCode})`, 'info');
        appendLog(`多语言表统计: 检索到 ${result.totalKeys} 条文本 Key，总字符量 ${result.totalChars}，去重后需支持 ${result.totalUniqueChars} 个独立字符。`, 'info');

        if (result.ok) {
            appendLog(`🎉【检测通过】字体完整覆盖多语言【${result.langName} (${result.langCode})】全部字符！(共 ${result.totalUniqueChars} 个字符，字符覆盖率 100%，无缺字)`, 'success');
            if (copyToClipboardFlag) {
                appendLog('ℹ️ 当前字体无任何缺失字符，未执行剪贴板写入。', 'info');
            }
        } else {
            appendLog(`⚠️【检测到缺字】当前字体缺少 ${result.missingChars.length} 个字符！(字符覆盖率: ${result.coveragePercent}%)`, 'error');
            appendLog(`--- 缺失字符列表（共 ${result.missingChars.length} 个）---`, 'error');

            const maxLogCount = 50;
            const displayMissing = result.missingChars.slice(0, maxLogCount);
            for (const item of displayMissing) {
                const sampleKeys = item.keys.slice(0, 3).join(', ') + (item.keys.length > 3 ? ` ...等${item.keys.length}处` : '');
                appendLog(`  • 缺字: '${item.char}' (Unicode: ${item.codeHex}) -> 引用 Key: [${sampleKeys}]`, 'error');
            }

            if (result.missingChars.length > maxLogCount) {
                appendLog(`  ... 还有 ${result.missingChars.length - maxLogCount} 个缺失字符未在日志中全部展开。`, 'info');
            }

            const missingCharSummary = result.missingChars.map((m) => m.char).join('');
            appendLog(`缺失字符合集: ${missingCharSummary}`, 'info');

            // 若点击的是“检测并复制”，将所有缺字拼接复制到剪贴板
            if (copyToClipboardFlag) {
                const copied = await copyToClipboard(missingCharSummary);
                if (copied) {
                    appendLog(`📋【复制成功】已将全部 ${result.missingChars.length} 个缺失字符复制到剪贴板！`, 'success');
                } else {
                    appendLog(`⚠️ 复制到剪贴板失败，请手动从上方“缺失字符合集”中复制。`, 'error');
                }
            }
        }
    }

    /**
     * 工具 2：执行字体抽字压缩 (子集化) 并导出 (另存为弹窗)
     */
    public async executeFontSubset(): Promise<void> {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const sourceFont = (this.fontSubsetSourceFontInp && this.fontSubsetSourceFontInp.value.trim()) || state.fontSubsetSourceFont || '';
        const textFile = (this.fontSubsetTextFileInp && this.fontSubsetTextFileInp.value.trim()) || state.fontSubsetTextFile || '';

        if (!sourceFont) {
            appendLog('请先选择源字体文件 (.ttf / .otf)。', 'error');
            return;
        }

        if (!textFile) {
            appendLog('请先选择参考文本文件 (.txt / .json / .csv / .md 等)。', 'error');
            return;
        }

        // 调起系统原生另存为文件对话框
        const defaultExportName = sourceFont.replace(/(\.[^.]+)$/, '_min.ttf');
        appendLog('请选择保存路径', 'info');
        const picked = await pickSavePath(
            '另存为 - 导出抽字压缩字体',
            defaultExportName,
            workspace,
            [
                { name: 'TrueType Font (*.ttf)', extensions: ['ttf'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        if (!picked) {
            appendLog('已取消导出保存操作。', 'info');
            return;
        }

        const targetFont = normalizePathForStorage(picked, workspace);

        appendLog('=== 开始执行字体抽字压缩 (子集化) ===', 'info');
        const result = FontSubsetter.subset(workspace, sourceFont, textFile, targetFont);

        if (!result.ok || result.error) {
            appendLog(`[压缩失败] ${result.error}`, 'error');
            return;
        }

        const origKb = (result.originalSize / 1024).toFixed(2);
        const newKb = (result.newSize / 1024).toFixed(2);

        appendLog(`源字体文件: ${result.sourceFontPath} (原文件大小: ${origKb} KB)`, 'info');
        appendLog(`参考文本文件: ${result.textFilePath}`, 'info');
        appendLog(`提取字符统计: 共提取 ${result.uniqueCharCount} 个独立字符`, 'info');
        appendLog(`字符样本: [${result.charSample}]`, 'info');

        if (result.warnings && result.warnings.length > 0) {
            appendLog(`--- 底层字形解析/清洗提示 (${result.warnings.length} 条) ---`, 'info');
            const maxShow = 10;
            for (const w of result.warnings.slice(0, maxShow)) {
                appendLog(`  ⚠️ ${w}`, 'info');
            }
            if (result.warnings.length > maxShow) {
                appendLog(`  ... 其余 ${result.warnings.length - maxShow} 条类似字形警告已合并处理，已安全重构为标准 TrueType 轮廓。`, 'info');
            }
        }

        appendLog(`🎉【抽字压缩成功】字体文件体积由 ${origKb} KB 降至 ${newKb} KB，整体压缩率达 ${result.compressionRatio}%！`, 'success');
        appendLog(`💾 导出目标文件: ${result.targetFontPath}`, 'success');
    }

    /**
     * 工具 3：执行字体格式互转并导出 (另存为弹窗)
     */
    public async executeFontConvert(): Promise<void> {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const sourceFont = (this.fontConvertSourceFontInp && this.fontConvertSourceFontInp.value.trim()) || state.fontConvertSourceFont || '';
        const targetFormat = ((this.fontConvertTargetFormatSelect && this.fontConvertTargetFormatSelect.value) || state.fontConvertTargetFormat || 'ttf') as SupportedFontFormat;

        if (!sourceFont) {
            appendLog('请先选择需要转换的源字体文件 (.ttf / .otf)。', 'error');
            return;
        }

        // 调起系统原生另存为文件对话框
        const defaultExportName = sourceFont.replace(/\.[^.]+$/, `.${targetFormat}`);
        const extUpper = targetFormat.toUpperCase();
        appendLog('请选择保存路径', 'info');
        const picked = await pickSavePath(
            `另存为 - 导出 ${extUpper} 字体`,
            defaultExportName,
            workspace,
            [
                { name: `${extUpper} Font (*.${targetFormat})`, extensions: [targetFormat] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ]
        );

        if (!picked) {
            appendLog('已取消导出保存操作。', 'info');
            return;
        }

        const targetFont = normalizePathForStorage(picked, workspace);

        appendLog(`=== 开始执行字体格式转换 [${targetFormat.toUpperCase()}] ===`, 'info');
        const result = await FontConverter.convert(workspace, sourceFont, targetFormat, targetFont);

        if (!result.ok || result.error) {
            appendLog(`[转换失败] ${result.error}`, 'error');
            return;
        }

        const origKb = (result.originalSize / 1024).toFixed(2);
        const newKb = (result.newSize / 1024).toFixed(2);
        const changeLabel = result.sizeChangePercent < 0 ? `减小 ${Math.abs(result.sizeChangePercent)}%` : `变化 ${result.sizeChangePercent}%`;

        appendLog(`源字体文件: ${result.sourceFontPath} (格式: ${result.sourceFormat}, 大小: ${origKb} KB)`, 'info');
        appendLog(`目标转换格式: ${result.targetFormat} (共重构 ${result.glyphCount} 个字形)`, 'info');
        appendLog(`🎉【格式转换成功】文件体积由 ${origKb} KB 变为 ${newKb} KB (${changeLabel})！`, 'success');
        appendLog(`💾 导出目标文件: ${result.targetFontPath}`, 'success');
    }

    /**
     * 工具 4：直接解析并修改 .prefab / .scene 文件 JSON 结构批量替换字体
     */
    private async executeFontReplaceFiles(): Promise<void> {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const fontPathRel = (this.fontFilePathInp && this.fontFilePathInp.value.trim()) || state.fontFilePath;
        const targetLocRel = (this.fontTargetLocInp && this.fontTargetLocInp.value.trim()) || state.fontTargetLocation;

        if (!fontPathRel) {
            appendLog('请先选择目标字体资源文件 (.ttf / .otf / .fnt)。', 'error');
            return;
        }

        if (!targetLocRel) {
            appendLog('请先选择目标预制体/场景文件或文件夹路径。', 'error');
            return;
        }

        const normalizedFontPath = normalizePathForStorage(fontPathRel, workspace);
        const absFontPath = fontPathRel.startsWith(workspace) ? fontPathRel : join(workspace, normalizedFontPath);

        if (!existsSync(absFontPath)) {
            appendLog(`字体资源文件不存在: ${normalizedFontPath}`, 'error');
            return;
        }

        // 构建 Cocos Asset DB db:// 资源路径并查询 UUID
        let dbUrl = normalizedFontPath;
        if (!dbUrl.startsWith('db://')) {
            dbUrl = `db://${normalizedFontPath}`;
        }

        let fontUuid: string | null = null;
        let fontType = extname(normalizedFontPath).toLowerCase() === '.fnt' ? 'cc.BitmapFont' : 'cc.TTFFont';

        try {
            if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                const info: any = await Editor.Message.request('asset-db', 'query-asset-info', dbUrl);
                if (info) {
                    fontUuid = info.uuid || null;
                    if (info.type === 'cc.BitmapFont') fontType = 'cc.BitmapFont';
                    else if (info.type === 'cc.TTFFont') fontType = 'cc.TTFFont';

                    if (info.subAssets && Object.keys(info.subAssets).length > 0) {
                        for (const key of Object.keys(info.subAssets)) {
                            const sub = info.subAssets[key];
                            if (sub && (sub.type === 'cc.BitmapFont' || sub.type === 'cc.TTFFont' || sub.type === 'cc.Font')) {
                                fontUuid = sub.uuid;
                                fontType = sub.type === 'cc.BitmapFont' ? 'cc.BitmapFont' : 'cc.TTFFont';
                                break;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[FontPanel] query-asset-info 尝试失败...', e);
        }

        if (!fontUuid) {
            try {
                if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                    fontUuid = await Editor.Message.request('asset-db', 'query-uuid', dbUrl);
                    if (!fontUuid) {
                        fontUuid = await Editor.Message.request('asset-db', 'query-uuid', normalizedFontPath);
                    }
                }
            } catch (e) {}
        }

        if (!fontUuid) {
            appendLog(`无法获取字体文件 [${normalizedFontPath}] 的 Asset UUID。请确认文件位于项目 assets 目录内并由 Cocos 导入。`, 'error');
            return;
        }

        // 解析目标文件或文件夹
        const normalizedTargetLoc = normalizePathForStorage(targetLocRel, workspace);
        const absTargetLoc = targetLocRel.startsWith(workspace) ? targetLocRel : join(workspace, normalizedTargetLoc);

        if (!existsSync(absTargetLoc)) {
            appendLog(`目标预制体/场景位置不存在: ${normalizedTargetLoc}`, 'error');
            return;
        }

        const filesToProcess: string[] = [];
        const stat = statSync(absTargetLoc);

        if (stat.isFile()) {
            if (absTargetLoc.endsWith('.prefab') || absTargetLoc.endsWith('.scene')) {
                filesToProcess.push(absTargetLoc);
            } else {
                appendLog(`选中的文件不是 .prefab 或 .scene 预制体/场景文件: ${normalizedTargetLoc}`, 'error');
                return;
            }
        } else if (stat.isDirectory()) {
            const collectFiles = (dir: string) => {
                let entries: any[] = [];
                try {
                    entries = readdirSync(dir, { withFileTypes: true });
                } catch (e) {
                    return;
                }
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name.toString());
                    if (entry.isDirectory()) {
                        collectFiles(fullPath);
                    } else if (entry.isFile()) {
                        const nameLower = entry.name.toString().toLowerCase();
                        if (nameLower.endsWith('.prefab') || nameLower.endsWith('.scene')) {
                            filesToProcess.push(fullPath);
                        }
                    }
                }
            };
            collectFiles(absTargetLoc);
        }

        if (filesToProcess.length === 0) {
            appendLog(`在 [${normalizedTargetLoc}] 中未找到任何 .prefab 或 .scene 文件。`, 'error');
            return;
        }

        appendLog(`=== 开始批量替换预制体/场景 JSON 字体结构 ===`, 'info');
        appendLog(`目标字体: ${normalizedFontPath} (UUID: ${fontUuid}, Type: ${fontType})`, 'info');
        appendLog(`扫描预制体/场景文件数量: ${filesToProcess.length}`, 'info');

        let totalModifiedFiles = 0;
        let totalReplacedComponents = 0;

        for (const filePath of filesToProcess) {
            let rawContent = '';
            try {
                rawContent = readFileSync(filePath, 'utf-8');
            } catch (e) {
                continue;
            }

            let jsonArray: any[];
            try {
                jsonArray = JSON.parse(rawContent);
            } catch (e) {
                continue;
            }

            if (!Array.isArray(jsonArray)) continue;

            // 递归构建节点全路径 (Node/Parent/Child...)
            const getNodePath = (nodeId: number): string => {
                const parts: string[] = [];
                let currId = nodeId;
                const visited = new Set<number>();
                while (currId !== undefined && currId !== null && jsonArray[currId] && jsonArray[currId].__type__ === 'cc.Node' && !visited.has(currId)) {
                    visited.add(currId);
                    const nodeObj = jsonArray[currId];
                    if (nodeObj._name) {
                        parts.unshift(nodeObj._name);
                    }
                    if (nodeObj._parent && typeof nodeObj._parent.__id__ === 'number') {
                        currId = nodeObj._parent.__id__;
                    } else {
                        break;
                    }
                }
                return parts.join('/') || 'Node';
            };

            let fileReplacedCount = 0;
            const replacedNodeNames: string[] = [];

            for (let i = 0; i < jsonArray.length; i++) {
                const item = jsonArray[i];
                if (!item || typeof item !== 'object') continue;

                const typeName = item.__type__ || '';
                const isLabel = typeName === 'cc.Label';
                const isRichText = typeName === 'cc.RichText';
                const hasFontProp = '_font' in item || '_isSystemFontUsed' in item;

                if (isLabel || isRichText || hasFontProp) {
                    let changed = false;

                    const newFontObj = {
                        __uuid__: fontUuid,
                        __expectedType__: fontType,
                    };

                    if (JSON.stringify(item._font) !== JSON.stringify(newFontObj)) {
                        item._font = newFontObj;
                        changed = true;
                    }

                    if (isRichText || '_userDefinedFont' in item) {
                        if (JSON.stringify(item._userDefinedFont) !== JSON.stringify(newFontObj)) {
                            item._userDefinedFont = newFontObj;
                            changed = true;
                        }
                    }

                    if (item._isSystemFontUsed !== false) {
                        item._isSystemFontUsed = false;
                        changed = true;
                    }

                    if (changed) {
                        fileReplacedCount++;
                        if (item.node && typeof item.node.__id__ === 'number') {
                            replacedNodeNames.push(getNodePath(item.node.__id__));
                        }
                    }
                }
            }

            if (fileReplacedCount > 0) {
                totalModifiedFiles++;
                totalReplacedComponents += fileReplacedCount;
                const relFilePath = relative(workspace, filePath).replace(/\\/g, '/');

                try {
                    writeFileSync(filePath, JSON.stringify(jsonArray, null, 2), 'utf-8');
                    appendLog(`[已修改] ${relFilePath} (替换了 ${fileReplacedCount} 处组件字体)`, 'success');
                    appendLog(`  节点: ${replacedNodeNames.join(', ')}`, 'info');

                    // 尝试以安全方式通知 AssetDB 刷新单个资源（无需重启编辑器）
                    try {
                        if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                            Editor.Message.request('asset-db', 'refresh-asset', `db://${relFilePath}`).catch(() => {});
                        }
                    } catch (e) {}
                } catch (err: any) {
                    appendLog(`[写入失败] 修改文件 ${relFilePath} 异常: ${err?.message ?? String(err)}`, 'error');
                }
            }
        }

        if (totalModifiedFiles === 0) {
            appendLog(`=== 替换完成 === 共检索 ${filesToProcess.length} 个文件，未发现需要更新的 Label / RichText 组件。`, 'info');
        } else {
            appendLog(`=== 替换完成 === 共扫描 ${filesToProcess.length} 个预制体/场景，成功修改 ${totalModifiedFiles} 个文件，累计替换了 ${totalReplacedComponents} 处文本组件字体！`, 'success');
        }
    }

    /**
     * 自动查询当前处于打开/编辑模式下的场景 (.scene) 或预制体 (.prefab) 路径并填入输入框
     */
    private async selectCurrentEditingAsset(): Promise<void> {
        const { workspace, appendLog } = this.context;
        appendLog('正在查询 Cocos 编辑器当前打开的场景/预制体文件...', 'info');

        let targetUuid: string | null = null;
        let diagInfo = '';

        // 1. 尝试从场景脚本获取当前打开的场景/预制体 UUID
        try {
            if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                const res: any = await Editor.Message.request('scene', 'execute-scene-script', {
                    name: 'gcore-framework',
                    method: 'getCurrentEditingAssetUuid',
                    args: [],
                });
                if (res && res.uuid) {
                    targetUuid = res.uuid;
                } else if (res && res.error) {
                    diagInfo = res.error;
                }
            }
        } catch (e: any) {
            console.warn('[FontPanel] 查询场景脚本当前编辑 UUID 异常:', e);
        }

        // 2. 机制 fallback：尝试从 Editor.Selection 获取在资源管理器中选中的 asset
        if (!targetUuid) {
            try {
                if (typeof Editor !== 'undefined' && Editor.Selection && typeof Editor.Selection.getSelected === 'function') {
                    const selectedAssets = Editor.Selection.getSelected('asset');
                    if (selectedAssets && selectedAssets.length > 0) {
                        for (const sUuid of selectedAssets) {
                            const info: any = await Editor.Message.request('asset-db', 'query-asset-info', sUuid);
                            if (info && info.url && (info.url.endsWith('.prefab') || info.url.endsWith('.scene'))) {
                                targetUuid = sUuid;
                                appendLog(`[自动感知] 检测到在资源管理器中选中了预制体/场景: ${info.url}`, 'info');
                                break;
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        const applyUuidPath = async (uuid: string): Promise<boolean> => {
            try {
                let assetUrl = '';
                if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.request) {
                    const info: any = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
                    if (info && info.url) {
                        assetUrl = info.url;
                    } else {
                        const urlRes = await Editor.Message.request('asset-db', 'query-url', uuid);
                        assetUrl = urlRes || '';
                    }
                }
                if (assetUrl) {
                    let cleanRel = assetUrl;
                    if (cleanRel.startsWith('db://')) {
                        cleanRel = cleanRel.substring(5);
                    }
                    cleanRel = normalizePathForStorage(cleanRel, workspace);
                    if (this.fontTargetLocInp) {
                        this.fontTargetLocInp.value = cleanRel;
                    }
                    StorageMgr.saveState({ fontTargetLocation: cleanRel }, workspace);
                    appendLog(`[定位成功] 已自动选中当前打开/选中的资源文件: ${cleanRel}`, 'success');
                    return true;
                }
            } catch (err: any) {
                console.warn('[FontPanel] 解析 UUID 资源路径失败:', err);
            }
            return false;
        };

        if (targetUuid) {
            const ok = await applyUuidPath(targetUuid);
            if (ok) return;
        }

        if (diagInfo) {
            appendLog(`[信息] 场景诊断提示: ${diagInfo}`, 'info');
        }
        appendLog('未能自动获取到当前打开的场景/预制体路径。请在资源管理器中单击选中目标 .prefab/.scene 文件，或使用“选择文件”按钮。', 'error');
    }
}
