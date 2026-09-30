import { pickPath, queryElement } from '../common/dom-util';
import { StorageMgr } from '../common/storage-mgr';
import { PanelContext } from '../common/types';

export class SettingsPanel {
    private context: PanelContext;

    private projectRootDirInp: HTMLInputElement | null = null;
    private projectRootBtn: HTMLButtonElement | null = null;
    private projectRootClearBtn: HTMLButtonElement | null = null;

    constructor(context: PanelContext) {
        this.context = context;
    }

    /**
     * 初始化工具设置分面板节点与事件监听
     */
    public init(): void {
        const { panel, workspace, appendLog } = this.context;
        const state = StorageMgr.loadState(workspace);

        // 检索 DOM 节点
        this.projectRootDirInp = (panel.$ && panel.$.projectRootDir) || queryElement<HTMLInputElement>(panel, '#project-root-dir');
        this.projectRootBtn = (panel.$ && panel.$.projectRootBtn) || queryElement<HTMLButtonElement>(panel, '#project-root-btn');
        this.projectRootClearBtn = (panel.$ && panel.$.projectRootClearBtn) || queryElement<HTMLButtonElement>(panel, '#project-root-clear-btn');

        // 应用初始状态（首次打开若未设置，则自动通过编辑器 API 识别并填入当前工程根目录）
        let initialRoot = (state.projectRootDir || '').trim();
        if (!initialRoot) {
            const editor = (globalThis as any).Editor;
            const autoDetected = (editor?.Project?.path || workspace || '').replace(/\\/g, '/');
            if (autoDetected) {
                initialRoot = autoDetected;
                StorageMgr.saveState({ projectRootDir: autoDetected }, workspace);
                appendLog(`[工具设置] 已自动识别当前工程根目录: ${autoDetected}`, 'info');
            }
        }

        if (this.projectRootDirInp) {
            this.projectRootDirInp.value = initialRoot;
        }

        // 绑定手动输入事件
        if (this.projectRootDirInp) {
            const handleInput = () => {
                const val = this.projectRootDirInp!.value.trim().replace(/\\/g, '/');
                StorageMgr.saveState({ projectRootDir: val }, workspace);
                appendLog(`已更新工程根目录配置: ${val || '(默认当前 Cocos 工程目录)'}`, 'info');
            };
            this.projectRootDirInp.addEventListener('change', handleInput);
        }

        // 绑定文件夹选择器：工程根目录
        if (this.projectRootBtn) {
            this.projectRootBtn.addEventListener('click', async () => {
                try {
                    const defaultPath = (this.projectRootDirInp && this.projectRootDirInp.value.trim()) || workspace;
                    const picked = await pickPath(
                        '选择工程根目录 (gcore-config.json 将保存在此目录下)',
                        defaultPath,
                        'directory',
                        workspace
                    );
                    if (picked) {
                        const cleanPath = picked.replace(/\\/g, '/');
                        if (this.projectRootDirInp) {
                            this.projectRootDirInp.value = cleanPath;
                        }
                        StorageMgr.saveState({ projectRootDir: cleanPath }, workspace);
                        appendLog(`已设定工程根目录: ${cleanPath} (gcore-config.json 将依据此路径进行读取与保存)`, 'success');
                    }
                } catch (e: any) {
                    appendLog(`选择工程根目录失败: ${e?.message ?? String(e)}`, 'error');
                }
            });
        }

        // 绑定清除已选文件夹按钮（清除持久化数据）
        if (this.projectRootClearBtn) {
            this.projectRootClearBtn.addEventListener('click', () => {
                if (this.projectRootDirInp) {
                    this.projectRootDirInp.value = '';
                }
                StorageMgr.saveState({ projectRootDir: '' }, workspace);
                appendLog('[工具设置] 已清除工程根目录的持久化数据！重新打开面板即可测试自动识别。', 'info');
            });
        }
    }
}

