import { gcoreAudio } from "db://gcore-framework/scripts/integration/audio";
import { gcoreMvc } from "db://gcore-framework/scripts/integration/mvc";
import { BaseFsm, gcoreGfs } from "db://gcore-framework/scripts/system/fsm";
import { gcoreConfig } from "db://gcore-framework/scripts/system/storage";
import { EGameFsmType } from "../define/define-game";
import { UiDefine } from "../define/define-view-param";
import { ELanguage, GameConfig, GameInitConfig } from "../game-config";
import { gOps } from "../operation/game-ops";
import { GFsmGame } from "./fsm-game";
import { GFsmMenu } from "./fsm-menu";
import { GFsmResLoading } from "./fsm-res-loading";

/** 启动流程状态机 */
export class GFsmLaunch extends BaseFsm {

    /** 进入启动流程 */
    public async onEnter(): Promise<void> {
        console.info("[GFsmLaunch] 注册 MVC 视图定义");
        gcoreMvc.registerAll(UiDefine);

        console.info("[GFsmLaunch] 注册全局游戏状态流程");
        gcoreGfs.register(EGameFsmType.Launch, GFsmLaunch);
        gcoreGfs.register(EGameFsmType.ResLoading, GFsmResLoading);
        gcoreGfs.register(EGameFsmType.Menu, GFsmMenu);
        gcoreGfs.register(EGameFsmType.Game, GFsmGame);

        const gameConfig = await this._initConfig();
        const initLang = gameConfig.language || GameInitConfig.initLanguage || ELanguage.zh_Hans;
        await gOps.sys.switchLanguage(initLang);

        // 同步音频设置到框架
        gcoreAudio.setConfig({
            musicVolume: (gameConfig.bgmVolume ?? 100) / 100,
            effectVolume: (gameConfig.sfxVolume ?? 100) / 100,
            masterMuted: gameConfig.isMuted ?? false,
        });

        // 进入资源加载流程
        gcoreGfs.enter(EGameFsmType.ResLoading);
    }

    /** 初始化基础用户配置 */
    private async _initConfig(): Promise<GameConfig> {
        let gameConfig = await gcoreConfig.getGameConfig<GameConfig>();
        if (!gameConfig) {
            gameConfig = new GameConfig();
            gameConfig.language = GameInitConfig.initLanguage;
            await gcoreConfig.saveGameConfig(gameConfig);
        }
        console.info("[GFsmLaunch] 游戏配置:", gameConfig);
        return gameConfig;
    }

    /** 退出启动流程 */
    public async onExit(): Promise<void> {

    }
}
