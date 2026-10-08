import { BaseView } from "db://gcore-framework/scripts/integration/mvc";
import { gcoreEvent } from "db://gcore-framework/scripts/system/event";
import { gcoreRes } from "db://gcore-framework/scripts/integration/res";
import {
    _decorator, Button, Color, Graphics, Label, Node, Sprite, Widget,
} from "cc";
import {
    DESIGN_H, DESIGN_W, THEME, clearChildren, color, mkAvatar,
    mkButton, mkLabel, mkNode, mkPanel, mkScroll, stretch,
} from "../../common/ui-factory";
import {
    ALL_FACTORS, CREW_DEF, EFaction, EFactor, ENarrativeTag, FACTOR_INFO,
    FACTION_INFO, getCrewById, getRaceById,
} from "../../define/define-game-data";
import {
    ERestaurantEvent, IActiveCustomer, IGameEventData, restaurantGame,
} from "../../data/restaurant-game";
import { gdata } from "../../data/gdata";
import { GameMainCtrl } from "./game-main-ctrl";
import { IGameMainViewParams } from "./game-main-interface";

/** 产线卡片缓存 */
interface ILineCard {
    root: Node;
    inv: Label;
    bar: Graphics;
    status: Label;
}

/** 顾客卡片缓存 */
interface ICustCard {
    root: Node;
    bar: Graphics;
    time: Label;
}

const { ccclass } = _decorator;

/** 游戏主界面（经营核心循环 + 各子面板叠加层） */
@ccclass("GameMainView")
export class GameMainView extends BaseView<IGameMainViewParams> {

    /** HUD 文本 */
    private _lblDay!: Label;
    private _lblCredits!: Label;
    private _lblIntel!: Label;
    private _lblRep!: Label;

    /** 产线卡片缓存 */
    private _lineCards: Map<EFactor, ILineCard> = new Map();
    /** 顾客卡片缓存 */
    private _custCards: Map<number, ICustCard> = new Map();
    /** 顾客区容器 */
    private _custRoot!: Node;
    /** 叠加层根（弹窗） */
    private _overlay!: Node;
    /** 当前叠加层内容 */
    private _overlayContent: Node | null = null;
    /** Toast 根 */
    private _toastRoot!: Node;

    /** 组件加载：构建静态界面 */
    protected onLoad(): void {
        this._buildBackground();
        this._buildTitle();
        this._buildHud();
        this._buildLineGrid();
        this._buildCustomerArea();
        this._buildNav();
        this._buildOverlayRoot();
        this._buildToastRoot();
        this._bindEvents();
    }

    /** 视图打开：重置运行态并刷新 */
    public onOpen(): void {
        restaurantGame.resetRuntime();
        restaurantGame.paused = false;
        this._renderHud();
        this._renderLines();
        this._renderCustomers();
        this._renderNav();
    }

    /** 帧循环：推进游戏并刷新动态元素 */
    protected update(dt: number): void {
        if (!restaurantGame.paused) restaurantGame.tick(dt);
        this._renderHud();
        this._updateLineProgress();
        this._updateCustomerTimers();
    }

    /** 视图销毁：移除全局事件监听，避免重复绑定与悬空引用 */
    public onDestroy(): void {
        gcoreEvent.targetOff(this);
    }

    /****************  事件订阅  ****************/
    private _bindEvents(): void {
        gcoreEvent.on(ERestaurantEvent.StateChanged, this._onStateChanged, this);
        gcoreEvent.on(ERestaurantEvent.CustomerArrive, this._onCustomerArrive, this);
        gcoreEvent.on(ERestaurantEvent.CustomerLeave, this._onCustomerLeave, this);
        gcoreEvent.on(ERestaurantEvent.Toast, this._showToast, this);
        gcoreEvent.on(ERestaurantEvent.GameEvent, this._showEvent, this);
    }
    private _onStateChanged(): void { this._renderHud(); this._renderLines(); this._renderNav(); }
    private _onCustomerArrive(): void { this._renderCustomers(); }
    private _onCustomerLeave(): void { this._renderCustomers(); }

    /****************  背景 / 标题  ****************/
    private _buildBackground(): void {
        const bg = mkNode("bg", this.node, DESIGN_W, DESIGN_H);
        const g = bg.addComponent(Graphics);
        g.fillColor = color(THEME.bgBottom);
        g.rect(-DESIGN_W / 2, -DESIGN_H / 2, DESIGN_W, DESIGN_H);
        g.fill();
        // 赛博暖炉：底部暖光晕（矢量兜底，加载到背景图后被覆盖）
        g.fillColor = color(THEME.warm, 60);
        g.circle(0, -DESIGN_H / 2 + 180, 360);
        g.fill();
        g.fillColor = color(THEME.gold, 28);
        g.circle(0, -DESIGN_H / 2 + 120, 220);
        g.fill();
        // 接入 AI 生成的餐厅背景图（资源缺失时静默失败，保留矢量背景兜底）
        const sp = bg.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.type = Sprite.Type.SIMPLE;
        // setSprite 在目标无效时可能同步返回 false，用 Promise.resolve 兼容两种返回值
        Promise.resolve(gcoreRes.setSprite("textures/A_cozy_futuristic_space_statio_2026-10-08T14-08-16", "pack-main", sp)).catch(() => {});
    }

    private _buildTitle(): void {
        const t = mkLabel(this.node, "星恸 · 餐厅日记", { size: 34, color: THEME.gold, bold: true });
        t.node.setPosition(0, DESIGN_H / 2 - 50);
        const sub = mkLabel(this.node, "Citadel Station · 跨种族补给中枢", { size: 18, color: THEME.textDim });
        sub.node.setPosition(0, DESIGN_H / 2 - 86);
    }

    /****************  HUD  ****************/
    private _buildHud(): void {
        const w = 690, h = 110, y = DESIGN_H / 2 - 175;
        const panel = mkPanel(this.node, w, h, { fill: THEME.panel, radius: 18 });
        panel.setPosition(0, y);
        const cells: { key: string; color: string }[] = [
            { key: "day", color: THEME.gold },
            { key: "credits", color: THEME.warm },
            { key: "intel", color: "#7fd3ff" },
            { key: "rep", color: THEME.good },
        ];
        const cw = (w - 40) / 4;
        cells.forEach((c, i) => {
            const x = -w / 2 + 20 + cw * (i + 0.5);
            const name = mkLabel(panel, c.key === "day" ? "天数" : c.key === "credits" ? "星币" : c.key === "intel" ? "情报" : "声望",
                { size: 18, color: THEME.textDim });
            name.node.setPosition(x, 26);
            const val = mkLabel(panel, "0", { size: 30, color: c.color, bold: true });
            val.node.setPosition(x, -14);
            if (c.key === "day") this._lblDay = val;
            if (c.key === "credits") this._lblCredits = val;
            if (c.key === "intel") this._lblIntel = val;
            if (c.key === "rep") this._lblRep = val;
        });
    }

    private _renderHud(): void {
        const vo = gdata.vo;
        if (this._lblDay) this._lblDay.string = `第 ${vo.day} 日`;
        if (this._lblCredits) this._lblCredits.string = `${vo.credits}`;
        if (this._lblIntel) this._lblIntel.string = `${vo.intel}`;
        if (this._lblRep) this._lblRep.string = `${vo.reputation}`;
    }

    /****************  产线网格  ****************/
    private _buildLineGrid(): void {
        const cols = 3, cardW = 218, cardH = 150, gap = 14;
        const gridW = cols * cardW + (cols - 1) * gap;
        const startX = -gridW / 2 + cardW / 2;
        const rowY = [234, 70, -94];
        let i = 0;
        for (const f of ALL_FACTORS) {
            const col = i % cols, row = Math.floor(i / cols);
            const x = startX + col * (cardW + gap);
            const y = rowY[row];
            this._buildLineCard(f, x, y, cardW, cardH);
            i++;
        }
    }

    private _buildLineCard(f: EFactor, x: number, y: number, w: number, h: number): void {
        const info = FACTOR_INFO[f];
        const root = mkPanel(this.node, w, h, { fill: THEME.panelLight, radius: 14, stroke: info.color });
        root.setPosition(x, y);
        // 左侧色条
        const bar = mkNode("colorbar", root, 10, h - 20);
        bar.setPosition(-w / 2 + 14, 0);
        const bg = bar.addComponent(Graphics);
        bg.fillColor = color(info.color);
        bg.roundRect(-5, -(h - 20) / 2, 10, h - 20, 5); bg.fill();
        // 因子名 + 供应
        const name = mkLabel(root, `${info.name}线`, { size: 22, color: info.color, bold: true });
        name.node.setPosition(0, h / 2 - 26);
        const supply = mkLabel(root, info.supply, { size: 16, color: THEME.textDim, width: w - 30 });
        supply.node.setPosition(0, h / 2 - 52);
        // 状态
        const status = mkLabel(root, "", { size: 16, color: THEME.text });
        status.node.setPosition(0, h / 2 - 80);
        // 库存
        const inv = mkLabel(root, "库存 0", { size: 18, color: THEME.gold });
        inv.node.setPosition(0, -h / 2 + 44);
        // 进度条
        const pg = mkNode("prog", root, w - 40, 12);
        pg.setPosition(0, -h / 2 + 20);
        const pgBg = pg.addComponent(Graphics);
        pgBg.fillColor = color(THEME.panelDark);
        pgBg.roundRect(-(w - 40) / 2, -6, w - 40, 12, 6); pgBg.fill();
        const pgFill = pg.addComponent(Graphics);
        // 点击建造/升级 -> 打开扩建面板
        const btn = root.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        btn.target = root;
        root.on(Button.EventType.CLICK, () => { this._openBuild(f); });
        this._lineCards.set(f, { root, inv, bar: pgFill, status });
    }

    private _renderLines(): void {
        const vo = gdata.vo;
        for (const [f, card] of this._lineCards) {
            const info = FACTOR_INFO[f];
            const line = vo.lines[f];
            if (!line.unlocked) {
                card.status.string = "未建造";
                card.status.color = color(THEME.textDim);
                card.inv.string = `建造 ${restaurantGame.lineCost(f)}★`;
                card.inv.color = color(THEME.warm);
            } else {
                card.status.string = `Lv.${line.level}`;
                card.status.color = color(info.color);
                card.inv.string = `库存 ${restaurantGame.inventory[f] ?? 0}`;
                card.inv.color = color(THEME.gold);
            }
        }
    }

    private _updateLineProgress(): void {
        const vo = gdata.vo;
        const w = 218 - 40;
        for (const [f, card] of this._lineCards) {
            const line = vo.lines[f];
            card.bar.clear();
            if (!line || !line.unlocked) {
                card.bar.fillColor = color(THEME.panelDark);
                card.bar.roundRect(-w / 2, -6, w, 12, 6); card.bar.fill();
                continue;
            }
            const p = restaurantGame.progress[f] ?? 0;
            card.bar.fillColor = color(FACTOR_INFO[f].color);
            card.bar.roundRect(-w / 2, -6, Math.max(2, w * p), 12, 6); card.bar.fill();
        }
    }

    /****************  顾客泊位区  ****************/
    private _buildCustomerArea(): void {
        const title = mkLabel(this.node, "飞船泊位 · 顾客接待", { size: 20, color: THEME.textDim });
        title.node.setPosition(0, -235);
        this._custRoot = mkNode("custRoot", this.node, DESIGN_W - 40, 170);
        this._custRoot.setPosition(0, -330);
    }

    private _renderCustomers(): void {
        clearChildren(this._custRoot);
        this._custCards.clear();
        const list = restaurantGame.customers;
        if (list.length === 0) {
            const hint = mkLabel(this._custRoot, "暂无飞船泊位，等待星际来客……", { size: 18, color: THEME.textDim });
            return;
        }
        const cardW = 150, gap = 14;
        const totalW = list.length * cardW + (list.length - 1) * gap;
        const startX = -totalW / 2 + cardW / 2;
        list.forEach((c, i) => {
            this._buildCustCard(c, startX + i * (cardW + gap), cardW);
        });
    }

    private _buildCustCard(c: IActiveCustomer, x: number, w: number): void {
        const h = 160;
        const race = getRaceById(c.raceId);
        const root = mkPanel(this._custRoot, w, h, { fill: THEME.panelLight, radius: 14, stroke: race.avatarColor });
        root.setPosition(x, 0);
        const av = mkAvatar(root, 64, race.avatarColor, race.name.substring(0, 1));
        av.setPosition(0, 40);
        const nm = mkLabel(root, race.name, { size: 18, color: THEME.text, bold: true });
        nm.node.setPosition(0, 0);
        const tag = mkLabel(root, `${c.tag}`, { size: 14, color: THEME.textDim });
        tag.node.setPosition(0, -20);
        // 倒计时条
        const pg = mkNode("time", root, w - 24, 10);
        pg.setPosition(0, -44);
        const bg = pg.addComponent(Graphics);
        bg.fillColor = color(THEME.panelDark);
        bg.roundRect(-(w - 24) / 2, -5, w - 24, 10, 5); bg.fill();
        const fill = pg.addComponent(Graphics);
        const time = mkLabel(root, "", { size: 14, color: THEME.gold });
        time.node.setPosition(0, -62);
        const btn = root.addComponent(Button);
        btn.transition = Button.Transition.NONE;
        btn.target = root;
        root.on(Button.EventType.CLICK, () => this._openOrder(c.uid));
        this._custCards.set(c.uid, { root, bar: fill, time });
    }

    private _updateCustomerTimers(): void {
        for (const c of restaurantGame.customers) {
            const card = this._custCards.get(c.uid);
            if (!card) continue;
            const p = Math.max(0, c.remain / c.total);
            const w = 150 - 24;
            card.bar.clear();
            card.bar.fillColor = p > 0.3 ? color(THEME.good) : color(THEME.bad);
            card.bar.roundRect(-w / 2, -5, Math.max(2, w * p), 10, 5); card.bar.fill();
            card.time.string = `${Math.ceil(c.remain)}s`;
        }
    }

    /****************  底部导航  ****************/
    private _buildNav(): void {
        const y = -DESIGN_H / 2 + 70;
        const btns: { label: string; cb: () => void; fill?: string }[] = [
            { label: "产线研发", cb: () => this._openBuild() },
            { label: "招牌员工", cb: () => this._openCrew() },
            { label: "阵营关系", cb: () => this._openFaction() },
            { label: "餐厅日记", cb: () => this._openDiary() },
        ];
        const n = btns.length, bw = 160, gap = 14;
        const totalW = n * bw + (n - 1) * gap;
        const startX = -totalW / 2 + bw / 2;
        btns.forEach((b, i) => {
            const btn = mkButton(this.node, bw, 64, b.label, b.cb, { fill: b.fill ?? THEME.accent, size: 22 });
            btn.node.setPosition(startX + i * (bw + gap), y);
        });
        this._buildTopRight();
    }

    /** 右上角：打烊结算 + 返回主菜单 */
    private _buildTopRight(): void {
        const close = mkButton(this.node, 110, 50, "打烊→", () => {
            restaurantGame.closeDay();
            this._showToast("已打烊，进入下一日");
        }, { fill: THEME.warm, size: 20 });
        close.node.setPosition(DESIGN_W / 2 - 70, DESIGN_H / 2 - 50);
        const menu = mkButton(this.node, 56, 50, "≡", () => { (this._ctrl as GameMainCtrl).returnMenu(); }, { fill: THEME.panelLight, size: 26 });
        menu.node.setPosition(DESIGN_W / 2 - 140, DESIGN_H / 2 - 50);
    }

    private _renderNav(): void { /* 导航为静态按钮，无需刷新 */ }

    /****************  叠加层（弹窗） ****************/
    private _buildOverlayRoot(): void {
        this._overlay = mkNode("overlay", this.node, DESIGN_W, DESIGN_H);
        stretch(this._overlay);
        this._overlay.active = false;
        // 半透明遮罩
        const dim = mkNode("dim", this._overlay, DESIGN_W, DESIGN_H);
        const g = dim.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 180);
        g.rect(-DESIGN_W / 2, -DESIGN_H / 2, DESIGN_W, DESIGN_H); g.fill();
        dim.addComponent(Widget);
    }

    /** 打开一个叠加层面板 */
    private _showOverlay(title: string, builder: (panel: Node) => void, onClose?: () => void): void {
        restaurantGame.paused = true;
        this._overlay.active = true;
        this._overlayContent = mkPanel(this._overlay, DESIGN_W - 50, DESIGN_H - 160, { fill: THEME.panel, radius: 20, stroke: THEME.line });
        this._overlayContent.setPosition(0, -10);
        const titleLbl = mkLabel(this._overlayContent, title, { size: 30, color: THEME.gold, bold: true });
        titleLbl.node.setPosition(0, (DESIGN_H - 160) / 2 - 46);
        const close = mkButton(this._overlayContent, 56, 56, "✕", () => this._closeOverlay(onClose), { fill: THEME.bad, size: 28, radius: 28 });
        close.node.setPosition((DESIGN_W - 50) / 2 - 44, (DESIGN_H - 160) / 2 - 44);
        builder(this._overlayContent);
    }

    private _closeOverlay(onClose?: () => void): void {
        if (this._overlayContent) { this._overlayContent.destroy(); this._overlayContent = null; }
        this._overlay.active = false;
        restaurantGame.paused = false;
        onClose?.();
        this._renderHud(); this._renderLines(); this._renderCustomers();
    }

    /****************  产线研发 / 扩建  ****************/
    private _openBuild(focus?: EFactor): void {
        this._showOverlay("产线研发 · 空间站扩建", (panel) => {
            const sw = mkScroll(panel, DESIGN_W - 110, DESIGN_H - 320);
            sw.scroll.setPosition(0, -40);
            const vo = gdata.vo;
            for (const f of ALL_FACTORS) {
                const info = FACTOR_INFO[f];
                const line = vo.lines[f];
                const row = mkPanel(sw.content, DESIGN_W - 150, 96, { fill: THEME.panelLight, radius: 12 });
                const dot = mkNode("dot", row, 16, 16); dot.setPosition(-(DESIGN_W - 150) / 2 + 24, 0);
                const dg = dot.addComponent(Graphics); dg.fillColor = color(info.color); dg.circle(0, 0, 8); dg.fill();
                mkLabel(row, `${info.name}线 · ${info.station}`, { size: 20, color: THEME.text, bold: true })
                    .node.setPosition(-(DESIGN_W - 150) / 2 + 56, 16);
                mkLabel(row, line.unlocked ? `当前 Lv.${line.level} · 供应「${info.supply}」` : `未建造 · 供应「${info.supply}」`,
                    { size: 15, color: THEME.textDim, width: DESIGN_W - 260 }).node.setPosition(-(DESIGN_W - 150) / 2 + 56, -16);
                const cost = restaurantGame.lineCost(f);
                const btn = mkButton(row, 150, 56, line.unlocked ? `升级 ${cost}★` : `建造 ${cost}★`,
                    () => {
                        const r = restaurantGame.buildLine(f);
                        this._showToast(r.msg);
                        if (r.ok) this._openBuild(focus); // 刷新
                    }, { fill: THEME.accent, size: 18 });
                btn.node.setPosition((DESIGN_W - 150) / 2 - 90, 0);
            }
            // 泊位扩建
            const berthRow = mkPanel(sw.content, DESIGN_W - 150, 96, { fill: THEME.panelLight, radius: 12 });
            mkLabel(berthRow, `飞船泊位`, { size: 20, color: THEME.text, bold: true }).node.setPosition(-(DESIGN_W - 150) / 2 + 60, 16);
            mkLabel(berthRow, `当前可同时接待 ${vo.berthCount} 艘`, { size: 15, color: THEME.textDim }).node.setPosition(-(DESIGN_W - 150) / 2 + 60, -16);
            const bcost = 100 + vo.berthCount * 60;
            const bbtn = mkButton(berthRow, 150, 56, `扩建 ${bcost}★`, () => {
                const r = restaurantGame.expandBerth(); this._showToast(r.msg); if (r.ok) this._openBuild(focus);
            }, { fill: THEME.warm, size: 18 });
            bbtn.node.setPosition((DESIGN_W - 150) / 2 - 90, 0);
        });
    }

    /****************  招牌员工  ****************/
    private _openCrew(): void {
        this._showOverlay("招牌员工 · 星际招募", (panel) => {
            const sw = mkScroll(panel, DESIGN_W - 110, DESIGN_H - 320);
            sw.scroll.setPosition(0, -40);
            const vo = gdata.vo;
            for (const crew of CREW_DEF) {
                const row = mkPanel(sw.content, DESIGN_W - 150, 116, { fill: THEME.panelLight, radius: 12 });
                mkAvatar(row, 56, FACTOR_INFO[crew.factors[0]].color, crew.name.substring(0, 1)).setPosition(-(DESIGN_W - 150) / 2 + 44, 0);
                mkLabel(row, crew.name, { size: 20, color: THEME.text, bold: true }).node.setPosition(-(DESIGN_W - 150) / 2 + 90, 30);
                mkLabel(row, `擅长：${crew.factors.map(f => FACTOR_INFO[f].name).join("/")}`, { size: 14, color: THEME.textDim, width: DESIGN_W - 320 }).node.setPosition(-(DESIGN_W - 150) / 2 + 90, 6);
                mkLabel(row, crew.skill, { size: 13, color: THEME.textDim, width: DESIGN_W - 320 }).node.setPosition(-(DESIGN_W - 150) / 2 + 90, -18);
                const hired = vo.crews.includes(crew.id);
                const btn = mkButton(row, 140, 56, hired ? "已雇佣" : `雇佣 ${crew.hireCost}★`,
                    () => {
                        if (hired) return;
                        const r = restaurantGame.hireCrew(crew.id); this._showToast(r.msg); if (r.ok) this._openCrew();
                    }, { fill: hired ? THEME.panelDark : THEME.good, size: 17 });
                btn.node.setPosition((DESIGN_W - 150) / 2 - 86, 0);
                if (hired) btn.setEnabled(false);
            }
        });
    }

    /****************  阵营关系  ****************/
    private _openFaction(): void {
        this._showOverlay("阵营关系 · 乱纪元周旋", (panel) => {
            const sw = mkScroll(panel, DESIGN_W - 110, DESIGN_H - 320);
            sw.scroll.setPosition(0, -40);
            const vo = gdata.vo;
            for (const fac of [EFaction.Reunifier, EFaction.Expansionist, EFaction.Autonomist]) {
                const info = FACTION_INFO[fac];
                const rel = vo.factionRel[fac] ?? 0;
                const row = mkPanel(sw.content, DESIGN_W - 150, 130, { fill: THEME.panelLight, radius: 12, stroke: info.color });
                mkLabel(row, info.name, { size: 22, color: info.color, bold: true }).node.setPosition(0, 42);
                mkLabel(row, info.desc, { size: 14, color: THEME.textDim, width: DESIGN_W - 180, align: "center" }).node.setPosition(0, 8);
                // 关系条
                const barW = DESIGN_W - 230;
                const bg = mkNode("relbg", row, barW, 14); bg.setPosition(0, -40);
                const g = bg.addComponent(Graphics); g.fillColor = color(THEME.panelDark);
                g.roundRect(-barW / 2, -7, barW, 14, 7); g.fill();
                const fill = bg.addComponent(Graphics);
                const p = (rel + 100) / 200;
                fill.fillColor = color(rel >= 0 ? THEME.good : THEME.bad);
                fill.roundRect(-barW / 2, -7, Math.max(2, barW * p), 14, 7); fill.fill();
                const relTxt = mkLabel(row, `好感 ${rel > 0 ? "+" : ""}${rel}`, { size: 16, color: rel >= 0 ? THEME.good : THEME.bad });
                relTxt.node.setPosition(0, -62);
            }
            mkLabel(panel, "事件会在营业中随机发生，影响阵营好感与补给。", { size: 14, color: THEME.textDim, width: DESIGN_W - 120 })
                .node.setPosition(0, -(DESIGN_H - 320) / 2 + 30);
        });
    }

    /****************  日记  ****************/
    private _openDiary(): void {
        this._showOverlay("餐厅日记 · 星港众生相", (panel) => {
            const vo = gdata.vo;
            if (vo.diary.length === 0) {
                mkLabel(panel, "还没有记录。接待顾客后会自动生成日记。", { size: 18, color: THEME.textDim })
                    .node.setPosition(0, 0);
                return;
            }
            const sw = mkScroll(panel, DESIGN_W - 110, DESIGN_H - 300);
            sw.scroll.setPosition(0, -30);
            for (const e of vo.diary) {
                const row = mkPanel(sw.content, DESIGN_W - 150, 132, { fill: THEME.panelLight, radius: 12 });
                mkLabel(row, `第${e.day}日 · ${e.raceName}（${e.tag}）`, { size: 18, color: THEME.gold, bold: true })
                    .node.setPosition(0, 48);
                mkLabel(row, e.text, { size: 15, color: THEME.text, width: DESIGN_W - 190, align: "center" }).node.setPosition(0, 8);
                mkLabel(row, e.reward, { size: 15, color: THEME.good }).node.setPosition(0, -44);
            }
        });
    }

    /****************  顾客订单  ****************/
    private _openOrder(uid: number): void {
        const c = restaurantGame.customers.find(x => x.uid === uid);
        if (!c) { this._showToast("该顾客已离港"); return; }
        const race = getRaceById(c.raceId);
        this._showOverlay(`${race.name} · 补给需求`, (panel) => {
            mkLabel(panel, c.line, { size: 17, color: THEME.text, width: DESIGN_W - 130, align: "center" }).node.setPosition(0, (DESIGN_H - 160) / 2 - 110);
            const need = mkNode("need", panel, DESIGN_W - 130, 150); need.setPosition(0, 40);
            c.factors.forEach((f, i) => {
                const info = FACTOR_INFO[f];
                const have = restaurantGame.inventory[f] ?? 0;
                const w = (DESIGN_W - 160) / c.factors.length;
                const cx = -(DESIGN_W - 160) / 2 + w * (i + 0.5);
                const cell = mkPanel(need, w - 14, 130, { fill: THEME.panelLight, radius: 12, stroke: have > 0 ? THEME.good : THEME.bad });
                cell.setPosition(cx, 0);
                mkAvatar(cell, 48, info.color, info.name.substring(0, 1)).setPosition(0, 34);
                mkLabel(cell, info.supply, { size: 15, color: THEME.text, width: w - 24, align: "center" }).node.setPosition(0, -10);
                mkLabel(cell, have > 0 ? `✓ 库存 ${have}` : "✗ 缺货", { size: 15, color: have > 0 ? THEME.good : THEME.bad }).node.setPosition(0, -42);
            });
            const canDeliver = c.factors.every(f => (restaurantGame.inventory[f] ?? 0) > 0);
            const btn = mkButton(panel, 320, 64, canDeliver ? "交付补给" : "库存不足，继续生产",
                () => {
                    const r = restaurantGame.deliver(uid);
                    if (r.ok) { this._showToast("接待成功！" + r.msg); this._closeOverlay(); }
                    else this._showToast(r.msg);
                }, { fill: canDeliver ? THEME.good : THEME.panelDark, size: 24 });
            btn.node.setPosition(0, -(DESIGN_H - 160) / 2 + 70);
            if (!canDeliver) btn.setEnabled(false);
        });
    }

    /****************  随机事件弹窗  ****************/
    private _showEvent(data: IGameEventData): void {
        this._showOverlay(data.title, (panel) => {
            mkLabel(panel, data.desc, { size: 18, color: THEME.text, width: DESIGN_W - 130, align: "center" }).node.setPosition(0, (DESIGN_H - 160) / 2 - 120);
            const n = data.options.length;
            const bw = Math.min(420, (DESIGN_W - 160));
            const startY = -20;
            data.options.forEach((opt, i) => {
                const btn = mkButton(panel, bw, 70, opt.label, () => {
                    opt.apply();
                    this._closeOverlay();
                }, { fill: i === 0 ? THEME.accent : THEME.panelLight, size: 20 });
                btn.node.setPosition(0, startY - i * 90);
            });
        });
    }

    /****************  Toast  ****************/
    private _buildToastRoot(): void {
        this._toastRoot = mkNode("toastRoot", this.node, DESIGN_W, 200);
        this._toastRoot.setPosition(0, 200);
    }

    private _showToast(msg: string): void {
        if (!this._toastRoot) return;
        const t = mkPanel(this._toastRoot, Math.min(DESIGN_W - 80, 60 + msg.length * 16), 56, { fill: THEME.panelDark, radius: 14, stroke: THEME.gold });
        t.setPosition(0, 0);
        mkLabel(t, msg, { size: 20, color: THEME.text, width: DESIGN_W - 120, align: "center" }).node.setPosition(0, 0);
        this.scheduleOnce(() => { if (t && t.isValid) t.destroy(); }, 1.6);
    }
}
