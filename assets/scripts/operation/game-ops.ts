import { SystemOps } from "./system-ops";
import { TipsOps } from "./tips-ops";

/** 全局游戏操作管理器 */
class GOps {
    /** 系统操作 */
    public readonly sys: SystemOps = new SystemOps();
    /** 提示操作 */
    public readonly tips: TipsOps = new TipsOps();
}

/** 游戏全局操作实例 */
export const gOps = new GOps();
(window as any).gOps = gOps;
