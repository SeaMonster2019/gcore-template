import { BaseFsm, gcoreGfs } from "db://gcore-framework/scripts/system/fsm";
import { gcoreRes } from "db://gcore-framework/scripts/integration/res";
import { EGameFsmType } from "../define/define-game";
import { ResConfig } from "../define/define-res";

/** 资源加载流程状态机 */
export class GFsmResLoading extends BaseFsm {

    /** 进入状态 */
    public async onEnter(): Promise<void> {
        console.info("[GFsmResLoading] 开始加载初始资源包");

        for (const item of ResConfig.initLoadPack) {
            try {
                const { packName, packParam } = item;
                await gcoreRes.loadBundle(packName, packParam);
                console.info(`[GFsmResLoading] 资源包加载完成: ${packName}`);
            } catch (error) {
                console.warn(`[GFsmResLoading] 加载资源包提示: ${error}`);
            }
        }

        // 资源加载完成，进入主菜单
        gcoreGfs.enter(EGameFsmType.Menu);
    }

    /** 退出状态 */
    public async onExit(): Promise<void> {

    }
}
