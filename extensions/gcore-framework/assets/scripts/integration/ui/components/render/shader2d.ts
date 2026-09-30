

import {
    _decorator,
    UIRenderer,
    UITransform,
    NodeEventType,
    builtinResMgr,
    Texture2D,
} from 'cc';

const { ccclass, executionOrder, menu, executeInEditMode, property } = _decorator;

const QUAD_INDICES = Uint16Array.from([0, 1, 2, 1, 3, 2]);

/**
 * 2D Shader 专属 4 顶点 Quad 组装器
 * - 纯 Shader 渲染，不依赖 SpriteFrame 与纹理
 * - 输出固定 [0..1] 标准化 UV 坐标
 */
export const Shader2DAssembler = {
    createData(comp: Shader2D): any {
        if (!comp || !comp.node) return null;
        const renderData = (comp as any).requestRenderData();
        if (renderData) {
            renderData.dataLength = 4;
            renderData.resize(4, 6);
            if (renderData.chunk) {
                renderData.chunk.setIndexBuffer(QUAD_INDICES);
            }
        }
        return renderData;
    },

    updateRenderData(comp: Shader2D): void {
        if (!comp || !comp.node) return;
        this.updateUVs(comp);
        this.updateColor(comp);
        const renderData = comp.renderData;
        if (renderData) {
            if (renderData.vertDirty) {
                this.updateVertexData(comp);
            }
            const tex = comp.getFallbackTexture();
            if (typeof renderData.updateRenderData === 'function') {
                renderData.updateRenderData(comp, tex);
            }
        }
    },

    updateWorldVerts(comp: Shader2D, chunk: any): void {
        if (!comp || !comp.node) return;
        const renderData = comp.renderData;
        if (!renderData || !chunk || !chunk.vb) return;
        const vData = chunk.vb;
        const dataList = renderData.data;
        if (!dataList || dataList.length < 4) return;

        const node = comp.node;
        const m = node.worldMatrix;
        if (!m) return;

        const m00 = m.m00; const m01 = m.m01; const m02 = m.m02; const m03 = m.m03;
        const m04 = m.m04; const m05 = m.m05; const m06 = m.m06; const m07 = m.m07;
        const m12 = m.m12; const m13 = m.m13; const m14 = m.m14; const m15 = m.m15;

        const stride = renderData.floatStride;
        for (let i = 0; i < 4; ++i) {
            const curData = dataList[i];
            const x = curData ? curData.x : 0;
            const y = curData ? curData.y : 0;
            let rhw = m03 * x + m07 * y + m15;
            rhw = rhw ? 1 / rhw : 1;

            const offset = i * stride;
            vData[offset + 0] = (m00 * x + m04 * y + m12) * rhw;
            vData[offset + 1] = (m01 * x + m05 * y + m13) * rhw;
            vData[offset + 2] = (m02 * x + m06 * y + m14) * rhw;
        }
    },

    fillBuffers(comp: Shader2D, renderer: any): void {
        if (!comp || !comp.node) return;

        const renderData = comp.renderData;
        if (!renderData || !renderData.chunk) return;
        const chunk = renderData.chunk;
        if (!chunk.meshBuffer) return;

        const target = comp as any;
        const node = comp.node as any;

        if (target._flagChangedVersion !== node.flagChangedVersion || renderData.vertDirty) {
            this.updateWorldVerts(comp, chunk);
            renderData.vertDirty = false;
            target._flagChangedVersion = node.flagChangedVersion;
        }

        const vidOrigin = chunk.vertexOffset;
        const meshBuffer = chunk.meshBuffer;
        const ib = meshBuffer.iData;
        if (!ib) return;

        let indexOffset = meshBuffer.indexOffset;
        const vid = vidOrigin;

        // 0: 左下
        ib[indexOffset++] = vid;
        // 1: 右下
        ib[indexOffset++] = vid + 1;
        // 2: 左上
        ib[indexOffset++] = vid + 2;

        // 1: 右下
        ib[indexOffset++] = vid + 1;
        // 3: 右上
        ib[indexOffset++] = vid + 3;
        // 2: 左上
        ib[indexOffset++] = vid + 2;

        meshBuffer.indexOffset += 6;
    },

    updateVertexData(comp: Shader2D): void {
        if (!comp || !comp.node) return;
        const renderData = comp.renderData;
        if (!renderData) return;

        const uiTrans = comp.getComponent(UITransform);
        if (!uiTrans) return;

        const dataList = renderData.data;
        if (!dataList) return;

        const cw = uiTrans.width;
        const ch = uiTrans.height;
        const appX = uiTrans.anchorX * cw;
        const appY = uiTrans.anchorY * ch;

        const l = -appX;
        const b = -appY;
        const r = cw - appX;
        const t = ch - appY;

        if (dataList[0]) { dataList[0].x = l; dataList[0].y = b; }
        if (dataList[1]) { dataList[1].x = r; dataList[1].y = b; }
        if (dataList[2]) { dataList[2].x = l; dataList[2].y = t; }
        if (dataList[3]) { dataList[3].x = r; dataList[3].y = t; }

        renderData.vertDirty = true;
    },

    updateUVs(comp: Shader2D): void {
        if (!comp) return;
        const renderData = comp.renderData;
        if (!renderData || !renderData.chunk || !renderData.chunk.vb) return;
        const vData = renderData.chunk.vb;
        const stride = renderData.floatStride;

        // 不依赖图集裁剪与合图，统一生成标准的 0..1 标准化 UV
        let u0 = 0, v0 = 1; // 左下
        let u1 = 1, v1 = 1; // 右下
        let u2 = 0, v2 = 0; // 左上
        let u3 = 1, v3 = 0; // 右上

        if (comp.flipUVX) {
            u0 = 1; u1 = 0; u2 = 1; u3 = 0;
        }
        if (comp.flipUVY) {
            v0 = 0; v1 = 0; v2 = 1; v3 = 1;
        }

        let uvOffset = 3;
        vData[uvOffset] = u0;     vData[uvOffset + 1] = v0;
        uvOffset += stride;
        vData[uvOffset] = u1;     vData[uvOffset + 1] = v1;
        uvOffset += stride;
        vData[uvOffset] = u2;     vData[uvOffset + 1] = v2;
        uvOffset += stride;
        vData[uvOffset] = u3;     vData[uvOffset + 1] = v3;
    },

    updateColor(comp: Shader2D): void {
        if (!comp) return;
        const renderData = comp.renderData;
        if (!renderData || !renderData.chunk || !renderData.chunk.vb) return;
        const vData = renderData.chunk.vb;
        let colorOffset = 5;
        const color = comp.color;
        if (!color) return;

        const colorR = color.r / 255;
        const colorG = color.g / 255;
        const colorB = color.b / 255;
        const colorA = color.a / 255;
        for (let i = 0; i < 4; i++, colorOffset += renderData.floatStride) {
            vData[colorOffset] = colorR;
            vData[colorOffset + 1] = colorG;
            vData[colorOffset + 2] = colorB;
            vData[colorOffset + 3] = colorA;
        }
    },
};

/**
 * 2D Shader 专属渲染组件
 * - 不依赖任何 SpriteFrame、图集与纹理
 * - 输出标准的 0..1 范围 UV 坐标给 2D Shader 材质
 */
@ccclass('Shader2D')
@menu('GCore/Components/Render/Shader2D')
@executionOrder(110)
@executeInEditMode(true)
export class Shader2D extends UIRenderer {

    private static _fallbackTex: Texture2D | null = null;

    @property
    protected _flipUVX = false;

    @property
    protected _flipUVY = false;

    /**
     * 水平翻转 UV
     */
    @property({ displayName: 'Flip UV X', tooltip: '是否水平翻转 UV' })
    public get flipUVX(): boolean {
        return this._flipUVX;
    }
    public set flipUVX(val: boolean) {
        if (this._flipUVX === val) return;
        this._flipUVX = val;
        this._updateUVs();
    }

    /**
     * 垂直翻转 UV
     */
    @property({ displayName: 'Flip UV Y', tooltip: '是否垂直翻转 UV' })
    public get flipUVY(): boolean {
        return this._flipUVY;
    }
    public set flipUVY(val: boolean) {
        if (this._flipUVY === val) return;
        this._flipUVY = val;
        this._updateUVs();
    }

    /**
     * 获取兜底内置纹理对象，防止 2D 合批时 frame 为 null 触发 getHash 报错
     */
    public getFallbackTexture(): any {
        if (builtinResMgr) {
            const tex = builtinResMgr.get<any>('default-texture');
            if (tex && typeof tex.getHash === 'function') {
                return tex;
            }
        }
        if (!Shader2D._fallbackTex) {
            Shader2D._fallbackTex = new Texture2D();
        }
        return Shader2D._fallbackTex;
    }

    public __preload(): void {
        super.__preload();
        if (this.node) {
            this.node.on(NodeEventType.SIZE_CHANGED, this._onSizeOrAnchorChanged, this);
            this.node.on(NodeEventType.ANCHOR_CHANGED, this._onSizeOrAnchorChanged, this);
        }
    }

    public onEnable(): void {
        super.onEnable();
        this._activateMaterial();
        this._flushAssembler();
    }

    public onDisable(): void {
        super.onDisable();
    }

    public onDestroy(): void {
        if (this.node) {
            this.node.off(NodeEventType.SIZE_CHANGED, this._onSizeOrAnchorChanged, this);
            this.node.off(NodeEventType.ANCHOR_CHANGED, this._onSizeOrAnchorChanged, this);
        }
        super.onDestroy();
    }

    protected _canRender(): boolean {
        if (!this.node || !this.node.isValid) {
            return false;
        }
        return super._canRender();
    }

    protected _render(render: any): void {
        if (!render || !this.renderData) return;
        const tex = this.getFallbackTexture();
        render.commitComp(this, this.renderData, tex, (this as any)._assembler, null);
    }

    protected _flushAssembler(): void {
        const assembler = Shader2DAssembler;
        const self = this as any;

        if (self._assembler !== assembler) {
            this.destroyRenderData();
            self._assembler = assembler;
        }

        if (!this.renderData) {
            if (assembler && assembler.createData) {
                const rd = assembler.createData(this);
                if (rd) {
                    rd.material = this.getRenderMaterial(0);
                    self._markForUpdateRenderData();
                    assembler.updateUVs(this);
                    self._updateColor();
                }
            }
        }
    }

    private _activateMaterial(): void {
        const self = this as any;
        if (!this.getSharedMaterial(0) && typeof self.updateMaterial === 'function') {
            self.updateMaterial();
        }
        const material = this.getRenderMaterial(0);
        self._markForUpdateRenderData();
        if (this.renderData) {
            this.renderData.material = material;
        }
    }

    private _updateUVs(): void {
        const self = this as any;
        if (self._assembler) {
            self._assembler.updateUVs(this);
        }
    }

    private _onSizeOrAnchorChanged(): void {
        const self = this as any;
        if (this.renderData) {
            self._markForUpdateRenderData(true);
        }
    }
}
