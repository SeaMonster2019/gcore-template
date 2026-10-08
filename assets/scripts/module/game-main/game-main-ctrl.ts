import { BaseCtrl } from "db://gcore-framework/scripts/integration/mvc";
import { gOps } from "../../operation/game-ops";

/** 游戏主界面控制器 */
export class GameMainCtrl extends BaseCtrl {
    /** 返回主菜单 */
    public returnMenu(): void {
        gOps.sys.returnMainMenu();
    }
}
