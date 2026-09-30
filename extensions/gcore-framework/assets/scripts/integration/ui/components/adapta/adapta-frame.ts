import { _decorator, ccenum, Component, Node, Size, Sprite, UITransform, view } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
const { ccclass, property, executeInEditMode, menu } = _decorator;

/** 适配类型 */
export enum EAddaptType {
    /** 平铺 */
    Flatten,
    /** 拉伸 */
    Stretch,
}

ccenum(EAddaptType);

/** 自适应框 */
@ccclass('AdaptaFrame')
@menu(`GCore/adapta/AdaptaFrame`)
@executeInEditMode(true)
export class AdaptaFrame extends Component {

    @property({
        type: EAddaptType, displayName: `适配类型`, tooltip:
            `适配类型: \n
Flatten:平铺 将大小设置为设计分辨率\n
Stretch:拉伸 保持宽高比，将宽或高设置为设计分辨率的宽或高`,
    })
    get adaptaType() {
        return this._adaptaType;
    }
    set adaptaType(value) {
        this._adaptaType = value;
        this._adapta();
    }
    @property
    private _adaptaType: EAddaptType = EAddaptType.Flatten;

    @property({
        type: Sprite,
        displayName: `精灵`,
        tooltip: `自适应精灵:\n
如果设置了精灵，在拉伸模式下，会以精灵图片帧作为宽高比`,
    })
    private declare imgSprite: Sprite;

    private declare _originSize: Size;

    /** 加载 */
    protected onLoad(): void {

        // 编辑器模式下，尝试绑定自己的sprite
        if (EDITOR_NOT_IN_PREVIEW) {
            this.imgSprite = this.imgSprite || this.getComponent(Sprite);
        }

        if (this.imgSprite && this.imgSprite.spriteFrame) {
            this._originSize = this.imgSprite.spriteFrame.originalSize;
        } else {
            const uit = this.getComponent(UITransform);
            if (!uit) {
                return;
            }
            this._originSize = new Size(uit.width, uit.height);
        }

    }

    /** 激活时 */
    protected onEnable(): void {
        this._adapta();
        this.node.on(`size-changed`, this._adapta, this);
    }

    /** 失活时 */
    protected onDisable(): void {
        this.node.off(`size-changed`, this._adapta, this);
    }

    /** 自适应 */
    private _adapta() {
        switch (this._adaptaType) {
            case EAddaptType.Flatten:
                this._adaptaFlatten();
                break;
            case EAddaptType.Stretch:
                this._adaptaStretch();
                break;
        }
    }

    /** 平铺适应 */
    private _adaptaFlatten() {
        const resolution = view.getVisibleSize();
        this._setSize(resolution);
    }

    /** 拉伸适应 */
    private _adaptaStretch() {

        const uit = this.getComponent(UITransform);
        if (!uit) {
            return;
        }

        const originSize = this._originSize;
        if (!originSize) {
            return;
        }
        const viewSize = view.getVisibleSize();

        if (originSize.width >= viewSize.width && originSize.height >= viewSize.height) {
            return;
        }

        const viewRate = viewSize.width / viewSize.height;
        const spriteRate = originSize.width / originSize.height;
        if (spriteRate > viewRate) {
            uit.setContentSize(new Size(viewSize.height * spriteRate, viewSize.height));
        } else {
            uit.setContentSize(new Size(viewSize.width, viewSize.width / spriteRate));
        }

    }

    /** 设置大小
     * @param size 大小
     */
    private _setSize(size: Size) {
        const uit = this.getComponent(UITransform);
        if (!uit) {
            return;
        }

        uit.setContentSize(size);
    }

}
