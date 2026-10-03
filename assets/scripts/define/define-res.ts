import { EResBundlePolicy } from "db://gcore-framework/scripts/integration/res";

/** 资源包名称枚举 */
export enum EPackName {
    /** 公共资源包 */
    Common = "pack-common",
    /** 核心/基础资源包 */
    Core = "pack-core",
    /** 主业务资源包 */
    Main = "pack-main",
}

/** 资源包初始加载配置 */
export class ResConfig {
    /** 启动时自动加载的 Bundle 配置 */
    static initLoadPack: {
        packName: string;
        packParam: EResBundlePolicy;
    }[] = [
        {
            packName: EPackName.Common,
            packParam: EResBundlePolicy.Hot,
        },
        {
            packName: EPackName.Core,
            packParam: EResBundlePolicy.Core,
        },
        {
            packName: EPackName.Main,
            packParam: EResBundlePolicy.Hot,
        },
    ];
}
