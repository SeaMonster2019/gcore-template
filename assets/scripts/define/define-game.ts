/** 游戏流程状态枚举 */
export enum EGameFsmType {
    /** 启动 */
    Launch = "Launch",
    /** 资源加载 */
    ResLoading = "ResLoading",
    /** 菜单 */
    Menu = "Menu",
    /** 游戏 */
    Game = "Game",
}

/** 游戏常量 */
export const GameConstant = {
    /** 存储key */
    SAVE_KEY: "restaurant_diary_save_data",
};
