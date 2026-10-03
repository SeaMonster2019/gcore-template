import { _decorator, Node, UITransform } from 'cc';
import { BaseView } from 'db://gcore-framework/scripts/integration/mvc';
import { ELanguage } from '../../game-config';
import { gOps } from '../../operation/game-ops';
import { MainMenuCtrl } from './main-menu-ctrl';
import { IMainMenuViewParams } from './main-menu-interface';
import { MainMenuModel } from './main-menu-model';

const { ccclass } = _decorator;

/** 主菜单视图 */
@ccclass('MainMenuView')
export class MainMenuView extends BaseView<IMainMenuViewParams> {

    /** 背景1 */
    private declare _bg1: Node;
    /** 背景2 */
    private declare _bg2: Node;
    /** 速度 */
    private _nSpeed: number = 0;
    /** 背景高度 */
    private _nBgHeight: number = 0;

    protected declare _ctrl: MainMenuCtrl;
    protected declare _model: MainMenuModel;
    protected declare _params: IMainMenuViewParams;

    /** 组件加载 */
    protected onLoad(): void {
        this._bg1 = this.findChild('menuBg');
        this._bg2 = this.findChild('menuBg1');
        if (this._bg1) {
            const transform = this._bg1.getComponent(UITransform);
            this._nBgHeight = transform ? transform.contentSize.height : 0;
        }
    }

    /** 打开视图回调 */
    onOpen(): void { }

    /** 帧循环 */
    protected update(dt: number): void {
        if (this._nSpeed > 1 && this._bg1 && this._bg2 && this._nBgHeight > 0) {
            const p1 = this._bg1.position;
            const p2 = this._bg2.position;
            let y1 = p1.y - this._nSpeed;
            let y2 = p2.y - this._nSpeed;
            if (y1 <= -this._nBgHeight) {
                y1 = y2 + this._nBgHeight;
            }
            if (y2 <= -this._nBgHeight) {
                y2 = y1 + this._nBgHeight;
            }
            this._bg1.setPosition(p1.x, y1, p1.z);
            this._bg2.setPosition(p2.x, y2, p2.z);
        }
    }

    /** 按钮点击事件响应 */
    onBtnClick(event: Event, data: string): void {
        switch (data) {
            case 'start': {
                this._params?.onNewGame?.();
                break;
            }
            case 'loading': {
                this._params?.onLoadGame?.();
                break;
            }
            case 'setting': {
                this._params?.onSetting?.();
                break;
            }
            case 'exit': {
                this._params?.onExitGame?.();
                break;
            }
            case 'English': {
                gOps.sys.switchLanguage(ELanguage.en);
                break;
            }
            case 'Chinese': {
                gOps.sys.switchLanguage(ELanguage.zh_Hans);
                break;
            }
            case 'speedUp': {
                this._nSpeed += 2;
                break;
            }
            default:
                break;
        }
    }
}
