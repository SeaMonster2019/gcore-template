import { IMvcParams } from "db://gcore-framework/scripts/integration/mvc";
import { MainMenuCtrl } from "../module/main-menu/main-menu-ctrl";
import { MainMenuModel } from "../module/main-menu/main-menu-model";
import { MainMenuView } from "../module/main-menu/main-menu-view";
import { EPackName } from "./define-res";
import { ELayer, EModule } from "./define-view";

/** UI 视图全局配置注册表 */
export const UiDefine: IMvcParams[] = [
    {
        tid: EModule.MainMenu,
        packName: EPackName.Main,
        prefabName: "prefab/module/main-menu/main-menu-view",
        layer: ELayer.Main,
        CtrlType: MainMenuCtrl,
        ModelType: MainMenuModel,
        ViewType: MainMenuView,
        attribute: {
            bIsOnly: true,
            bIsdaptation: true,
        },
    },
];
