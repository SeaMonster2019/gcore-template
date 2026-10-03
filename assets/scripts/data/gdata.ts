import { gcoreStorage } from "db://gcore-framework/scripts/system/storage";
import { GameConstant } from "../define/define-game";
import { GDataVo, gdataVo, gdataVoReset } from "./gdata-vo";

/** 游戏全局数据管理类 */
class GData {

    /** 是否已加载有效数据 */
    private _hasData: boolean = false;

    /** 获取数据VO */
    public get vo(): GDataVo {
        return gdataVo;
    }

    /** 是否已经加载数据 */
    public get hasData(): boolean {
        return this._hasData;
    }

    /** 新建游戏数据 */
    public newData(): void {
        gdataVoReset();
        this._hasData = true;
        this.saveData();
        console.info(`[gdata] 新建游戏数据成功`);
    }

    /** 加载存档数据 */
    public loadData(): boolean {
        const data = gcoreStorage.get<GDataVo>(GameConstant.SAVE_KEY);
        if (!data) {
            return false;
        }
        Object.assign(gdataVo, data);
        this._hasData = true;
        console.info(`[gdata] 加载游戏数据成功`, gdataVo);
        return true;
    }

    /** 保存游戏数据 */
    public saveData(): void {
        if (this._hasData) {
            console.info(`[gdata] 保存游戏数据`);
            gcoreStorage.set(GameConstant.SAVE_KEY, gdataVo);
        }
    }

    /** 清除本地数据 */
    public clearData(): void {
        gdataVoReset();
        this._hasData = false;
    }

    /** 检查是否存在有效存档 */
    public hasSave(): boolean {
        return gcoreStorage.get(GameConstant.SAVE_KEY) != null;
    }
}

/** 游戏数据全局单例 */
export const gdata = new GData();
