import { IViewParams } from "db://gcore-framework/scripts/integration/mvc";

/** 主菜单视图参数接口 */
export interface IMainMenuViewParams extends IViewParams {
    /** 开始新游戏回调 */
    onNewGame?: () => Promise<void> | void;
    /** 读取/继续游戏回调 */
    onLoadGame?: () => Promise<void> | void;
    /** 设置回调 */
    onSetting?: () => Promise<void> | void;
    /** 退出游戏回调 */
    onExitGame?: () => Promise<void> | void;
}
