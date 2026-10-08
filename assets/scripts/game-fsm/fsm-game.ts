import { BaseFsm } from "db://gcore-framework/scripts/system/fsm";
import { gcoreMvc } from "db://gcore-framework/scripts/integration/mvc";
import { ELayer, EModule } from "../define/define-view";
import { GameMainCtrl } from "../module/game-main/game-main-ctrl";
import { GameMainModel } from "../module/game-main/game-main-model";
import { GameMainView } from "../module/game-main/game-main-view";

/** 游戏主状态流程 */
export class GFsmGame extends BaseFsm {

    private _registered = false;

    /** 进入游戏流程 */
    public async onEnter(): Promise<void> {
        console.info("[GFsmGame] 进入游戏主流程");
        // 注册游戏主界面模块（仅一次）
        if (!this._registered) {
            gcoreMvc.register({
                tid: EModule.GameMain,
                packName: "pack-main",
                prefabName: "prefab/module/game-main/game-main-view",
                layer: ELayer.Main,
                CtrlType: GameMainCtrl,
                ModelType: GameMainModel,
                ViewType: GameMainView,
                attribute: { bIsOnly: true, bIsdaptation: true },
            });
            this._registered = true;
        }
        await gcoreMvc.open(EModule.GameMain);
    }

    /** 退出游戏流程 */
    public async onExit(): Promise<void> {
        console.info("[GFsmGame] 退出游戏主流程");
        gcoreMvc.close(EModule.GameMain);
        gcoreMvc.closeAll(true);
    }
}
