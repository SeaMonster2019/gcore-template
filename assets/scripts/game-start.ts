import { _decorator, Component, Node, Prefab } from 'cc';
import { GCfgMgr } from './config/gcfg';
import { EGameFsmType } from './define/define-game';
import { GFsmLaunch } from './game-fsm/fsm-launch';
import { gameInfo } from './global/game-info';
import { gOps } from './operation/game-ops';

const { ccclass, property, menu } = _decorator;

@ccclass("GameStart")
@menu("Game/GameStart")
export class GameStart extends Component {

    @property({
        type: Node,
        tooltip: "轻提示根节点"
    })
    protected toastRoot: Node = null!;

    @property({
        type: Prefab,
        tooltip: "轻提示预制体"
    })
    protected toastPrefab: Prefab = null!;

    /** 游戏开始方法，由 GCoreInit 的 EventHandler 回调调用 */
    public async gameStart(): Promise<void> {
        console.info("[GameStart] 游戏开始");
        gameInfo.init();
        await GCfgMgr.LoadAllConfig();
        gOps.tips.init(this.toastRoot, this.toastPrefab);
        const launchGfsm = new GFsmLaunch();
        launchGfsm.onInit(EGameFsmType.Launch);
        await launchGfsm.onEnter();
    }
}
