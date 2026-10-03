/** 用户基础信息 */
export interface IUserInfoVo {
    /** 玩家名称 */
    name: string;
    /** 等级 */
    level: number;
    /** 金币 */
    coins: number;
    /** 钻石 */
    diamonds: number;
}

/** 餐厅状态信息 */
export interface IRestaurantVo {
    /** 餐厅等级 */
    restaurantLevel: number;
    /** 已解锁的菜谱 ID 列表 */
    unlockedRecipes: number[];
}

/** 游戏数据全局值对象模型 (VO) */
export class GDataVo {
    /** 玩家信息 */
    user: IUserInfoVo = {
        name: "Chef",
        level: 1,
        coins: 100,
        diamonds: 10,
    };

    /** 餐厅信息 */
    restaurant: IRestaurantVo = {
        restaurantLevel: 1,
        unlockedRecipes: [1001],
    };
}

/** 全局数据实例 */
export const gdataVo: GDataVo = new GDataVo();

/** 重置游戏数据 */
export function gdataVoReset(): void {
    console.info(`[gdata] 重置游戏数据`);
    Object.assign(gdataVo, new GDataVo());
}
