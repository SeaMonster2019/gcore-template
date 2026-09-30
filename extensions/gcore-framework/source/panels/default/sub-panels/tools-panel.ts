/**
 * @file tools-panel.ts
 * @description 小工具集合分面板控制器，提供 .meta 无效文件扫描清理等辅助工具
 */

import { existsSync, readdirSync, unlinkSync } from 'fs';
import { join, relative } from 'path';
import { bindPickerBtn, queryElement } from '../common/dom-util';
import { normalizePathForStorage } from '../common/path-util';
import { StorageMgr } from '../common/storage-mgr';
import { PanelContext } from '../common/types';

export class ToolsPanel {
    private context: PanelContext;

    // 工具 1：.meta 清理控制节点
    private metaCleanDirInp: HTMLInputElement | null = null;
    private metaCleanDirBtn: HTMLButtonElement | null = null;
    private cleanMetaBtn: HTMLButtonElement | null = null;

    constructor(context: PanelContext) {
        this.context = context;
    }

    /**
     * 初始化小工具分面板节点与事件监听
     */
    public init(): void {
        const { panel, workspace, appendLog, setAllButtonsDisabled } = this.context;
        const state = StorageMgr.loadState(workspace);

        // 检索 DOM 节点
        this.metaCleanDirInp = (panel.$ && panel.$.metaCleanDir) || queryElement<HTMLInputElement>(panel, '#meta-clean-dir');
        this.metaCleanDirBtn = (panel.$ && panel.$.metaCleanDirBtn) || queryElement<HTMLButtonElement>(panel, '#meta-clean-dir-btn');
        this.cleanMetaBtn = (panel.$ && panel.$.cleanMetaBtn) || queryElement<HTMLButtonElement>(panel, '#clean-meta-btn');

        // 应用初始状态
        if (this.metaCleanDirInp) this.metaCleanDirInp.value = state.metaCleanDir || '';

        // 绑定手动输入事件
        if (this.metaCleanDirInp) {
            this.metaCleanDirInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.metaCleanDirInp!.value, workspace);
                StorageMgr.saveState({ metaCleanDir: val }, workspace);
            });
        }

        // 绑定文件夹选择器：.meta 清理目标目录
        bindPickerBtn(
            this.metaCleanDirBtn,
            this.metaCleanDirInp,
            '选择需要清理 .meta 文件的目标文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ metaCleanDir: val }, workspace),
            appendLog
        );

        // 绑定工具 1 执行按钮：.meta 清理
        if (this.cleanMetaBtn) {
            this.cleanMetaBtn.addEventListener('click', () => {
                setAllButtonsDisabled(true);
                try {
                    this.executeMetaClean();
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }
    }

    /**
     * 工具 1：扫描并清理指定目录下找不到对应文件/文件夹的残留 .meta 文件
     */
    private executeMetaClean(): void {
        const { workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);
        const targetDirRel = (this.metaCleanDirInp && this.metaCleanDirInp.value.trim()) || state.metaCleanDir;
        if (!targetDirRel) {
            appendLog(`[.meta 清理失败] 请先选择或输入需要清理的目标文件夹路径`, 'error');
            return;
        }
        const targetDirAbs = targetDirRel.startsWith(workspace) ? targetDirRel : join(workspace, targetDirRel);

        if (!existsSync(targetDirAbs)) {
            appendLog(`[.meta 清理失败] 目标目录不存在: ${targetDirRel}`, 'error');
            return;
        }

        appendLog(`=== 开始扫描并清理无效 .meta 文件 [${targetDirRel}] ===`, 'info');

        let scannedMetaCount = 0;
        let deletedMetaCount = 0;

        const scanAndClean = (currentDir: string) => {
            if (!existsSync(currentDir)) return;

            let entries: any[] = [];
            try {
                entries = readdirSync(currentDir, { withFileTypes: true });
            } catch (e) {
                return;
            }

            for (const entry of entries) {
                const fullPath = join(currentDir, entry.name.toString());

                if (entry.isDirectory()) {
                    scanAndClean(fullPath);
                }

                if (entry.isFile() && entry.name.toString().endsWith('.meta')) {
                    scannedMetaCount++;
                    const targetPath = fullPath.slice(0, -5);
                    if (!existsSync(targetPath)) {
                        try {
                            unlinkSync(fullPath);
                            deletedMetaCount++;
                            const relMetaPath = relative(workspace, fullPath);
                            appendLog(`[已清理] 删除残留无效 meta: ${relMetaPath}`, 'info');
                        } catch (err: any) {
                            appendLog(`[清理失败] 删除 ${fullPath} 异常: ${err?.message ?? String(err)}`, 'error');
                        }
                    }
                }
            }
        };

        scanAndClean(targetDirAbs);

        if (deletedMetaCount === 0) {
            appendLog(`扫描完成：共检索 ${scannedMetaCount} 个 .meta 文件，未发现任何残留无效的 .meta 文件。`, 'success');
        } else {
            appendLog(`=== 清理完成 === 共检索 ${scannedMetaCount} 个 .meta 文件，成功自动删除 ${deletedMetaCount} 个残留无效 .meta 文件！`, 'success');
        }
    }
}
