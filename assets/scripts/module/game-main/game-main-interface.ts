import { IViewParams } from "db://gcore-framework/scripts/integration/mvc";

/** 游戏主界面视图参数 */
export interface IGameMainViewParams extends IViewParams {
    /** 返回主菜单回调 */
    onReturnMenu?: () => void;
}
