import { game } from "cc";
import { gcoreAudio } from "db://gcore-framework/scripts/integration/audio";
import { gcoreMvc } from "db://gcore-framework/scripts/integration/mvc";
import { gcoreGfs } from "db://gcore-framework/scripts/system/fsm";
import { gdata } from "../data/gdata";
import { EGameFsmType } from "../define/define-game";
import { EPackName } from "../define/define-res";

/** 系统与全局游戏操作 */
export class SystemOps {

    /** 切换语言 */
    public async switchLanguage(languageKey: string): Promise<void> {
        console.info(`[SystemOps] 切换语言: ${languageKey}`);
    }

    /** 开始新游戏 */
    public async startGame(): Promise<void> {
        console.info(`[SystemOps] 开始新游戏`);
        gdata.newData();
        gcoreGfs.enter(EGameFsmType.Game);
    }

    /** 保存游戏 */
    public async saveGame(): Promise<void> {
        gdata.saveData();
    }

    /** 加载已有存档 */
    public async loadGame(): Promise<boolean> {
        console.info(`[SystemOps] 加载游戏存档`);
        if (gdata.loadData()) {
            gcoreGfs.enter(EGameFsmType.Game);
            return true;
        } else {
            console.warn(`[SystemOps] 未找到存档数据`);
            return false;
        }
    }

    /** 返回主菜单 */
    public returnMainMenu(): void {
        console.info(`[SystemOps] 返回主菜单`);
        gdata.saveData();
        gcoreMvc.closeAll(true);
        gcoreGfs.enter(EGameFsmType.Menu);
    }

    /** 恢复游戏主界面 */
    public async resumeGame(): Promise<void> {
        gcoreMvc.closeAll(false);
    }

    /** 关闭游戏程序 */
    public closeGame(): void {
        console.info(`[SystemOps] 退出游戏`);
        game.end();
    }

    /** 播放背景音乐
     * @param resPath 音乐资源路径
     * @param bundle 所在 Bundle 包名
     * @param options 可选配置（循环播放等）
     */
    public async playBGM(resPath: string, bundle: string = EPackName.Main, options?: { loop?: boolean }): Promise<void> {
        try {
            await gcoreAudio.playMusic(resPath, { bundle, loop: options?.loop });
        } catch (e) {
            console.warn(`[SystemOps] 播放背景音乐未找到资源: ${resPath}`);
        }
    }
}
