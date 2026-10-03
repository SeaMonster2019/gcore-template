import { BaseFsm } from "db://gcore-framework/scripts/system/fsm";
import { gcoreMvc } from "db://gcore-framework/scripts/integration/mvc";
import { gOps } from "../operation/game-ops";

/** 游戏主状态流程 */
export class GFsmGame extends BaseFsm {

    /** 进入游戏流程 */
    public async onEnter(): Promise<void> {
        console.info("[GFsmGame] 进入游戏主流程");
        await gOps.sys.resumeGame();
    }

    /** 退出游戏流程 */
    public async onExit(): Promise<void> {
        console.info("[GFsmGame] 退出游戏主流程");
        gcoreMvc.closeAll(true);
    }
}
