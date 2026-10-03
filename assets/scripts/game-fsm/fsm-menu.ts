import { BaseFsm } from "db://gcore-framework/scripts/system/fsm";
import { gcoreMvc } from "db://gcore-framework/scripts/integration/mvc";
import { EModule } from "../define/define-view";
import { DebugConfig } from "../game-config";
import { IMainMenuViewParams } from "../module/main-menu/main-menu-interface";
import { gOps } from "../operation/game-ops";

/** 菜单流程状态机 */
export class GFsmMenu extends BaseFsm {

    /** 标记是否首次启动进入菜单 */
    private static _isFirstLaunch: boolean = true;

    /** 进入状态 */
    public async onEnter(): Promise<void> {
        if (GFsmMenu._isFirstLaunch) {
            GFsmMenu._isFirstLaunch = false;
            if (DebugConfig.skipMainMenu) {
                await this._newGame();
                return;
            }
        }

        const menuParams: IMainMenuViewParams = {
            onNewGame: this._newGame.bind(this),
            onLoadGame: this._loadGame.bind(this),
            onExitGame: this._exitGame.bind(this),
        };

        await gcoreMvc.open(EModule.MainMenu, menuParams);
    }

    /** 退出状态 */
    public async onExit(): Promise<void> {
        gcoreMvc.close(EModule.MainMenu);
    }

    /** 开始新游戏 */
    private async _newGame(): Promise<void> {
        try {
            await gOps.sys.startGame();
        } catch (error) {
            console.error("新建游戏失败", error);
        }
    }

    /** 读取存档游戏 */
    private async _loadGame(): Promise<void> {
        try {
            await gOps.sys.loadGame();
        } catch (error) {
            console.error("加载游戏失败", error);
        }
    }

    /** 退出程序 */
    private async _exitGame(): Promise<void> {
        gOps.sys.closeGame();
    }
}
