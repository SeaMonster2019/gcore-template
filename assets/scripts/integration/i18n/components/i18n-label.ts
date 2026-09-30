import { _decorator, CCString, Component, Label } from "cc";
import { EDITOR } from "cc/env";
import { GCoreEvent, gcoreEvent } from "../../../system/event";
import { I18nEditorUtil } from "../editor/i18n-editor-util";
import { i18n } from "../i18n-mgr";

const { ccclass, property, menu, executeInEditMode } = _decorator;

/** 程序多语言文本组件 */
@ccclass("I18nLabel")
@menu("Game/I18n/I18nLabel")
@executeInEditMode
export class I18nLabel extends Component {

    /** 多语言 key */
    @property({ displayName: "Key", tooltip: "多语言 key" })
    public i18nKey = "";

    /** 默认文本 */
    @property({ displayName: "Fallback", tooltip: "当 key 不存在时显示的默认文本" })
    public fallback = "";

    /** 占位参数 */
    @property({ type: [CCString], displayName: "Params", tooltip: "占位参数，按顺序替换 {0}、{1}..." })
    public params: string[] = [];

    /** 文本组件 */
    @property({ displayName: "Label", tooltip: "要显示文本的 Label 组件，如果不设置会自动获取当前节点上的 Label 组件" })
    public label: Label | null = null;

    /** 在 Inspector 中点击触发原生 Key 选择菜单 */
    @property({ displayName: "🔍 选择 Key (点击弹出菜单)", tooltip: "勾选或点击此项以弹出 Cocos 编辑器原生多语言 Key 选择菜单" })
    public get selectKey(): boolean {
        return false;
    }

    public set selectKey(val: boolean) {
        if (EDITOR) {
            I18nEditorUtil.openKeySelectorMenu((selectedKey) => this.setKey(selectedKey));
        }
    }

    /****************  生命周期方法  ****************/

    /** 节点加载 */
    protected onLoad(): void {
        if (!this.label) {
            this.label = this.getComponent(Label);
        }
    }

    /** 节点使能 */
    protected onEnable(): void {
        gcoreEvent.on(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this.refresh, this);
        this.refresh();
    }

    /** 节点禁用 */
    protected onDisable(): void {
        gcoreEvent.off(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this.refresh, this);
    }

    /****************  公共方法  ****************/

    /** 设置多语言信息
     * @param key 多语言 key
     * @param fallback 默认文本
     * @param params 占位参数数组
     */
    public setKey(key: string, fallback?: string, params?: Array<string | number>): void {
        this.i18nKey = key;
        if (fallback !== undefined) {
            this.fallback = fallback;
        }
        if (params) {
            this.params = params.map((item) => String(item));
        }
        this.refresh();

        if (EDITOR) {
            I18nEditorUtil.notifyEditorUpdate(this.label);
        }
    }

    /** 刷新文本显示 */
    public refresh(): void {
        if (!this.label) {
            this.label = this.getComponent(Label);
        }
        if (!this.label || !this.i18nKey) {
            return;
        }

        if (EDITOR) {
            // 缓存获取（0ms 无阻塞）
            const cached = i18n.getEditorText(this.i18nKey, this.fallback);
            this.label.string = this.format(cached);

            // 异步从扩展获取最新文本
            i18n.getEditorTextAsync(this.i18nKey, this.fallback).then((text) => {
                if (this.node && this.node.isValid && this.label) {
                    this.label.string = this.format(text);
                    I18nEditorUtil.notifyEditorUpdate(this.label);
                }
            }).catch(() => {});
        } else {
            this.label.string = this.format(i18n.getText(this.i18nKey, this.fallback));
        }
    }

    /****************  私有方法  ****************/

    /** 格式化文本参数
     * @param text 原始文本
     * @returns 替换占位参数后的文本
     */
    private format(text: string): string {
        return text.replace(/\{(\d+)\}/g, (match, index) => this.params[Number(index)] ?? match);
    }

}
