import { Button, EventHandler, EventTouch, _decorator, macro } from "cc";
const { property, ccclass, menu } = _decorator;

@ccclass(`LongButton`)
@menu(`GCore/Button/LongButton`)
export class LongButton extends Button {

    /** 触发次数 */
    @property({ displayName: "触发次数", tooltip: "0则为一直触发，否则为触发次数" })
    public longPressCount = 0;

    /** 触发延迟 */
    @property({ displayName: "触发延迟", tooltip: "触发延迟，单位秒" })
    public longPressDelay = 0;

    /** 触发间隔 */
    @property({ displayName: "触发间隔", tooltip: "触发间隔，单位秒" })
    public longPressinterval = 0;

    protected _bIsLoop = false;
    protected _currentCount = 0;
    protected _pressed: boolean = false;

    protected override _onTouchBegan(event?: EventTouch): void {
        super._onTouchBegan(event);
        if (this.longPressCount === 0) {
            this._bIsLoop = true;
        } else {
            this._currentCount = this.longPressCount;
            this._bIsLoop = false;
        }
        this.unschedule(this._startLongPress);
        this.schedule(this._startLongPress, this.longPressinterval, macro.REPEAT_FOREVER, this.longPressDelay);
    }

    protected override _onTouchEnded(event?: EventTouch): void {
        if (!this._interactable || !this.enabledInHierarchy) {
            return;
        }
        this._pressed = false;
        this._updateState();

        if (event) {
            event.propagationStopped = true;
        }

        this.unschedule(this._startLongPress);
    }

    protected override _onTouchCancel(event?: EventTouch): void {
        super._onTouchCancel();
        this.unschedule(this._startLongPress);
    }

    protected _startLongPress() {
        this._clicked();
        if (!this._bIsLoop) {
            --this._currentCount;
            if (this._currentCount <= 0) {
                this.unschedule(this._startLongPress);
            }
        }
    }

    protected _clicked() {
        EventHandler.emitEvents(this.clickEvents, null);
        this.node.emit('click', null);
    }

}