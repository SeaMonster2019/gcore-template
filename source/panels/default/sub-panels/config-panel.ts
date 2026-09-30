/**
 * @file config-panel.ts
 * @description 配置表转表分面板控制器，负责处理配置表 (luban.conf) 转表参数设置与执行
 */

import { bindPickerBtn, queryElement } from '../common/dom-util';
import { LubanRunner } from '../common/luban-runner';
import { normalizePathForStorage } from '../common/path-util';
import { StorageMgr } from '../common/storage-mgr';
import { PanelContext } from '../common/types';

export class ConfigPanel {
    private context: PanelContext;

    private cfgConfFileInp: HTMLInputElement | null = null;
    private cfgConfBtn: HTMLButtonElement | null = null;
    private cfgCodeDirInp: HTMLInputElement | null = null;
    private cfgCodeBtn: HTMLButtonElement | null = null;
    private cfgDataDirInp: HTMLInputElement | null = null;
    private cfgDataBtn: HTMLButtonElement | null = null;
    private genCfgBtn: HTMLButtonElement | null = null;

    constructor(context: PanelContext) {
        this.context = context;
    }

    /**
     * 初始化配置表分面板节点与事件监听
     */
    public init(): void {
        const { panel, workspace, appendLog, setAllButtonsDisabled } = this.context;
        const state = StorageMgr.loadState();

        // 检索输入框与按钮节点
        this.cfgConfFileInp = (panel.$ && panel.$.cfgConfFile) || queryElement<HTMLInputElement>(panel, '#cfg-conf-file');
        this.cfgConfBtn = (panel.$ && panel.$.cfgConfBtn) || queryElement<HTMLButtonElement>(panel, '#cfg-conf-btn');
        this.cfgCodeDirInp = (panel.$ && panel.$.cfgCodeDir) || queryElement<HTMLInputElement>(panel, '#cfg-code-dir');
        this.cfgCodeBtn = (panel.$ && panel.$.cfgCodeBtn) || queryElement<HTMLButtonElement>(panel, '#cfg-code-btn');
        this.cfgDataDirInp = (panel.$ && panel.$.cfgDataDir) || queryElement<HTMLInputElement>(panel, '#cfg-data-dir');
        this.cfgDataBtn = (panel.$ && panel.$.cfgDataBtn) || queryElement<HTMLButtonElement>(panel, '#cfg-data-btn');
        this.genCfgBtn = (panel.$ && panel.$.genCfgBtn) || queryElement<HTMLButtonElement>(panel, '#gen-cfg-btn');

        // 应用初始状态
        if (this.cfgConfFileInp) this.cfgConfFileInp.value = state.cfgConfFile;
        if (this.cfgCodeDirInp) this.cfgCodeDirInp.value = state.cfgCodeDir;
        if (this.cfgDataDirInp) this.cfgDataDirInp.value = state.cfgDataDir;

        // 绑定手动输入事件
        if (this.cfgConfFileInp) {
            this.cfgConfFileInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.cfgConfFileInp!.value, workspace);
                StorageMgr.saveState({ cfgConfFile: val });
            });
        }
        if (this.cfgCodeDirInp) {
            this.cfgCodeDirInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.cfgCodeDirInp!.value, workspace);
                StorageMgr.saveState({ cfgCodeDir: val });
            });
        }
        if (this.cfgDataDirInp) {
            this.cfgDataDirInp.addEventListener('input', () => {
                const val = normalizePathForStorage(this.cfgDataDirInp!.value, workspace);
                StorageMgr.saveState({ cfgDataDir: val });
            });
        }

        // 绑定文件/文件夹选择器按钮
        bindPickerBtn(
            this.cfgConfBtn,
            this.cfgConfFileInp,
            '选择配置表 luban.conf 文件',
            'file',
            workspace,
            (val) => StorageMgr.saveState({ cfgConfFile: val }),
            appendLog,
            [{ name: 'Luban Conf', extensions: ['conf', 'json'] }]
        );

        bindPickerBtn(
            this.cfgCodeBtn,
            this.cfgCodeDirInp,
            '选择配置表代码输出文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ cfgCodeDir: val }),
            appendLog
        );

        bindPickerBtn(
            this.cfgDataBtn,
            this.cfgDataDirInp,
            '选择配置表数据输出文件夹',
            'directory',
            workspace,
            (val) => StorageMgr.saveState({ cfgDataDir: val }),
            appendLog
        );

        // 绑定转表执行按钮
        if (this.genCfgBtn) {
            this.genCfgBtn.addEventListener('click', async () => {
                const curState = StorageMgr.loadState();
                setAllButtonsDisabled(true);
                try {
                    appendLog('=== 开始生成游戏配置表 ===');
                    await LubanRunner.run(
                        curState.cfgConfFile,
                        'client',
                        curState.cfgCodeDir,
                        curState.cfgDataDir,
                        workspace,
                        appendLog
                    );
                } finally {
                    setAllButtonsDisabled(false);
                }
            });
        }
    }
}
