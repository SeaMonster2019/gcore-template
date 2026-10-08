import { gcoreEvent } from "db://gcore-framework/scripts/system/event";
import { EFaction, EFactor, ENarrativeTag, EGameEvent, FACTOR_INFO, RACE_DEF, getCrewById, getRaceById } from "../define/define-game-data";
import { gdata } from "./gdata";
import { IDiaryEntry, ILineState } from "./gdata-vo";

/** 运行时顾客（泊位中的飞船） */
export interface IActiveCustomer {
    /** 运行时唯一 id */
    uid: number;
    /** 种族 id */
    raceId: string;
    /** 需求因子 */
    factors: EFactor[];
    /** 叙事标签 */
    tag: ENarrativeTag;
    /** 剩余泊位时间（秒） */
    remain: number;
    /** 总泊位时间（秒） */
    total: number;
    /** 一句对话/故事碎片 */
    line: string;
}

/** 游戏运行事件名 */
export enum ERestaurantEvent {
    /** 数据整体变化（HUD/列表需刷新） */
    StateChanged = "restaurant:state-changed",
    /** 新顾客泊位 */
    CustomerArrive = "restaurant:customer-arrive",
    /** 顾客离港（成功或超时） */
    CustomerLeave = "restaurant:customer-leave",
    /** 产生一条 toast 提示 */
    Toast = "restaurant:toast",
    /** 触发一个事件弹窗 {event, title, desc, options} */
    GameEvent = "restaurant:game-event",
    /** 日志（事件/系统） */
    Log = "restaurant:log",
}

/** 事件弹窗选项 */
export interface IEventOption {
    label: string;
    /** 选择后回调（在事件系统内部处理） */
    apply: () => void;
}

/** 事件弹窗数据 */
export interface IGameEventData {
    title: string;
    desc: string;
    options: IEventOption[];
}

/** 单个随机事件配置 */
interface IEventRule {
    type: EGameEvent;
    weight: number;
    build: () => IGameEventData | null;
}

/**
 * 餐厅经营运行时管理器（单例）
 * 负责：顾客生成、产线生产结算、交付奖励、事件调度，并通过事件总线通知视图刷新。
 * 存档进度（星币/线/员工/阵营/日记）挂在 gdata.vo，本类在关键操作后落盘。
 */
class RestaurantGame {
    /** 单例 */
    public static readonly inst = new RestaurantGame();

    /** 各因子库存（可交付数量） */
    public inventory: Record<EFactor, number> = {} as any;
    /** 各因子产线生产进度 0~1 */
    public progress: Record<EFactor, number> = {} as any;
    /** 当前泊位顾客 */
    public customers: IActiveCustomer[] = [];
    /** 当日计时（秒） */
    public dayTimer: number = 0;
    /** 单日长度（秒） */
    public dayLength: number = 120;
    /** 是否暂停（弹窗打开时） */
    public paused: boolean = false;

    private _uidSeq: number = 1;
    private _spawnTimer: number = 0;
    private _spawnInterval: number = 9;
    private _eventTimer: number = 0;
    private _eventInterval: number = 35;

    /** 初始化/新游戏时重置运行时 */
    public resetRuntime(): void {
        this.inventory = {} as any;
        this.progress = {} as any;
        for (const f of Object.values(EFactor)) {
            if (typeof f === "number") {
                this.inventory[f] = 0;
                this.progress[f] = 0;
            }
        }
        this.customers = [];
        this.dayTimer = 0;
        this._spawnTimer = 2;
        this._eventTimer = this._eventInterval;
        this.paused = false;
    }

    /** 帧驱动 */
    public tick(dt: number): void {
        if (this.paused) return;
        const vo = gdata.vo;

        // 生产推进
        for (const f of Object.values(EFactor)) {
            if (typeof f !== "number") continue;
            const line = vo.lines[f];
            if (!line || !line.unlocked) continue;
            const rate = this._lineRate(f);
            this.progress[f] = Math.min(1, this.progress[f] + rate * dt);
            if (this.progress[f] >= 1) {
                this.progress[f] = 0;
                this.inventory[f] = Math.min(99, this.inventory[f] + (1 + Math.floor((line.level - 1) / 2)));
                gcoreEvent.emit(ERestaurantEvent.StateChanged);
            }
        }

        // 顾客倒计时
        let changed = false;
        for (const c of this.customers) {
            c.remain -= dt;
        }
        const expired = this.customers.filter(c => c.remain <= 0);
        if (expired.length > 0) {
            for (const c of expired) {
                this._removeCustomer(c.uid, false);
            }
            vo.reputation = Math.max(0, vo.reputation - 3 * expired.length);
            gcoreEvent.emit(ERestaurantEvent.Toast, `有${expired.length}艘飞船超时离港，声望下降`);
            changed = true;
        }

        // 顾客生成
        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0 && this.customers.length < vo.berthCount) {
            this._spawnTimer = this._spawnInterval + Math.random() * 4;
            this._spawnCustomer();
            changed = true;
        }

        // 事件调度
        this._eventTimer -= dt;
        if (this._eventTimer <= 0) {
            this._eventTimer = this._eventInterval + Math.random() * 20;
            this._tryTriggerEvent();
        }

        // 当日推进
        this.dayTimer += dt;
        if (this.dayTimer >= this.dayLength) {
            this._advanceDay();
            changed = true;
        }

        if (changed) gcoreEvent.emit(ERestaurantEvent.StateChanged);
    }

    /** 产线单位时间产出进度速率 */
    private _lineRate(f: EFactor): number {
        const vo = gdata.vo;
        const line = vo.lines[f];
        if (!line || !line.unlocked) return 0;
        const base = 0.16;                       // 基础速率
        const lvMul = 1 + (line.level - 1) * 0.28; // 等级加成
        const crewBonus = this._crewBonus(f);      // 员工加成
        return base * lvMul * (1 + crewBonus);
    }

    /** 某因子线获得的员工效率加成（0~1+） */
    private _crewBonus(f: EFactor): number {
        const vo = gdata.vo;
        let bonus = 0;
        for (const cid of vo.crews) {
            const crew = getCrewById(cid);
            if (crew && crew.factors.includes(f)) {
                bonus += crew.bonusPerLevel / 100;
            }
        }
        return bonus;
    }

    /** 随机生成一名顾客 */
    private _spawnCustomer(): void {
        const race = RACE_DEF[Math.floor(Math.random() * RACE_DEF.length)];
        const tag = race.tags[Math.floor(Math.random() * race.tags.length)];
        const total = 18 + race.factors.length * 8 + Math.random() * 8; // 双因子顾客停留更久
        const c: IActiveCustomer = {
            uid: this._uidSeq++,
            raceId: race.id,
            factors: race.factors.slice(),
            tag,
            remain: total,
            total,
            line: this._pickLine(race.name, tag),
        };
        this.customers.push(c);
        gcoreEvent.emit(ERestaurantEvent.CustomerArrive, c);
    }

    /** 根据种族与标签挑一句开场白 */
    private _pickLine(name: string, tag: ENarrativeTag): string {
        const pool: Record<ENarrativeTag, string[]> = {
            [ENarrativeTag.Refugee]:   [`${name}：谢天谢地，这里还有光和饭香。`, `${name}：我们漂了太久，求一份补给。`],
            [ENarrativeTag.Smuggler]:  [`${name}：别声张，按黑市价结。`, `${name}：货我懂，价你定？`],
            [ENarrativeTag.Explorer]:  [`${name}：星图残片还能换点情报吗？`, `${name}：又发现一片失联空域。`],
            [ENarrativeTag.Spy]:       [`${name}：我只是……路过查询数据。`, `${name}：别多问，补给给我。`],
            [ENarrativeTag.Scholar]:   [`${name}：旧联邦的配方还有人记得吗？`, `${name}：信标若复苏，记得通知我。`],
            [ENarrativeTag.Merchant]:  [`${name}：老规矩，先补货再谈生意。`, `${name}：通货紧，给个好价？`],
        };
        const arr = pool[tag];
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /** 移除顾客 */
    private _removeCustomer(uid: number, success: boolean): void {
        const idx = this.customers.findIndex(c => c.uid === uid);
        if (idx < 0) return;
        this.customers.splice(idx, 1);
        gcoreEvent.emit(ERestaurantEvent.CustomerLeave, uid, success);
    }

    /** 尝试交付（满足全部需求因子即可） */
    public deliver(uid: number): { ok: boolean; msg: string } {
        const c = this.customers.find(x => x.uid === uid);
        if (!c) return { ok: false, msg: "顾客已离港" };
        const vo = gdata.vo;
        // 校验库存
        for (const f of c.factors) {
            if ((this.inventory[f] ?? 0) < 1) {
                return { ok: false, msg: `缺少【${FACTOR_INFO[f].supply}】` };
            }
        }
        // 消耗
        for (const f of c.factors) this.inventory[f] -= 1;

        // 奖励计算
        const factorCnt = c.factors.length;
        let credits = 28 + factorCnt * 22;
        let rep = 4 + factorCnt * 2;
        let intel = 0;
        // 标签修正
        if (c.tag === ENarrativeTag.Merchant || c.tag === ENarrativeTag.Scholar) credits += 12;
        if (c.tag === ENarrativeTag.Refugee) { credits = Math.floor(credits * 0.6); rep += 6; }
        if (c.tag === ENarrativeTag.Smuggler || c.tag === ENarrativeTag.Spy) intel += 2 + factorCnt;
        if (factorCnt >= 2 && Math.random() < 0.5) intel += 1;

        vo.credits += credits;
        vo.reputation += rep;
        vo.intel += intel;
        vo.servedCount += 1;

        // 日记
        const race = getRaceById(c.raceId);
        const text = `${c.line}（留下补给与一段星港的呼吸）`;
        const entry: IDiaryEntry = {
            id: vo.diarySeq++,
            day: vo.day,
            raceName: race.name,
            factors: c.factors.slice(),
            tag: c.tag,
            text,
            reward: `星币+${credits} 声望+${rep}${intel > 0 ? ` 情报+${intel}` : ""}`,
        };
        vo.diary.unshift(entry);
        if (vo.diary.length > 200) vo.diary.pop();

        this._removeCustomer(uid, true);
        gdata.saveData();
        gcoreEvent.emit(ERestaurantEvent.StateChanged);
        gcoreEvent.emit(ERestaurantEvent.Toast, `接待 ${race.name} 成功：${entry.reward}`);
        return { ok: true, msg: entry.reward };
    }

    /** 雇佣员工 */
    public hireCrew(cid: string): { ok: boolean; msg: string } {
        const vo = gdata.vo;
        const crew = getCrewById(cid);
        if (!crew) return { ok: false, msg: "未知员工" };
        if (vo.crews.includes(cid)) return { ok: false, msg: "已雇佣" };
        if (vo.credits < crew.hireCost) return { ok: false, msg: "星币不足" };
        vo.credits -= crew.hireCost;
        vo.crews.push(cid);
        gdata.saveData();
        gcoreEvent.emit(ERestaurantEvent.StateChanged);
        return { ok: true, msg: `已雇佣 ${crew.name}` };
    }

    /** 解锁/升级一条补给线 */
    public buildLine(f: EFactor): { ok: boolean; msg: string } {
        const vo = gdata.vo;
        const line: ILineState = vo.lines[f];
        if (!line) return { ok: false, msg: "无效产线" };
        const cost = this._lineCost(f, line);
        if (vo.credits < cost) return { ok: false, msg: "星币不足" };
        vo.credits -= cost;
        if (!line.unlocked) line.unlocked = true;
        else line.level += 1;
        gdata.saveData();
        gcoreEvent.emit(ERestaurantEvent.StateChanged);
        return { ok: true, msg: line.unlocked && line.level === 1 ? `已建造${FACTOR_INFO[f].station}` : `${FACTOR_INFO[f].name}线升至 Lv.${line.level}` };
    }

    /** 产线建造/升级花费 */
    public lineCost(f: EFactor): number {
        return this._lineCost(f, gdata.vo.lines[f]);
    }
    private _lineCost(f: EFactor, line: ILineState): number {
        if (!line.unlocked) return 80 + (f as number) * 10;
        return 60 * line.level * (f as number);
    }

    /** 扩建泊位 */
    public expandBerth(): { ok: boolean; msg: string } {
        const vo = gdata.vo;
        const cost = 100 + vo.berthCount * 60;
        if (vo.credits < cost) return { ok: false, msg: "星币不足" };
        vo.credits -= cost;
        vo.berthCount += 1;
        gdata.saveData();
        gcoreEvent.emit(ERestaurantEvent.StateChanged);
        return { ok: true, msg: `泊位 +1（当前 ${vo.berthCount}）` };
    }

    /** 推进到下一个营业日 */
    private _advanceDay(): void {
        const vo = gdata.vo;
        vo.day += 1;
        this.dayTimer = 0;
        gcoreEvent.emit(ERestaurantEvent.Log, `第 ${vo.day - 1} 日打烊，进入第 ${vo.day} 日`);
        gdata.saveData();
        this._tryTriggerEvent(true);
    }

    /** 手动打烊结算（下一天） */
    public closeDay(): void {
        this._advanceDay();
        gcoreEvent.emit(ERestaurantEvent.StateChanged);
    }

    /** 尝试触发随机事件 */
    private _tryTriggerEvent(force: boolean = false): void {
        const rules = this._buildEventRules();
        if (rules.length === 0) return;
        if (!force) {
            // 非强制时 50% 概率不触发，留白
            if (Math.random() < 0.4) return;
        }
        // 按权重抽取
        const total = rules.reduce((s, r) => s + r.weight, 0);
        let rnd = Math.random() * total;
        for (const r of rules) {
            rnd -= r.weight;
            if (rnd <= 0) {
                const data = r.build();
                if (data) gcoreEvent.emit(ERestaurantEvent.GameEvent, data);
                return;
            }
        }
    }

    /** 构造当前可用事件规则 */
    private _buildEventRules(): IEventRule[] {
        const vo = gdata.vo;
        const rules: IEventRule[] = [];

        // 阵营征询（复统派：上报情报换星币；自保派：换情报/庇护；扩张派：强征或断供）
        rules.push({
            type: EGameEvent.FactionDemand,
            weight: 3,
            build: () => {
                const fac = [EFaction.Reunifier, EFaction.Autonomist, EFaction.Expansionist][Math.floor(Math.random() * 3)];
                if (fac === EFaction.Reunifier) {
                    const gain = 40;
                    return {
                        title: "复统派·情报征询",
                        desc: "复统派要求上报近期顾客情报，以换取航道通行证与星币。",
                        options: [
                            { label: `上报（+${gain}星币，复统派好感+）`, apply: () => { vo.credits += gain; this._faction(fac, 8); this._log("你向复统派上报了情报。"); } },
                            { label: "婉拒（保持中立）", apply: () => { this._log("你婉拒了复统派，保持中立。"); } },
                        ],
                    };
                }
                if (fac === EFaction.Autonomist) {
                    const gain = 3;
                    return {
                        title: "自保派·等价交换",
                        desc: "自保派愿以稀有食材情报交换你的补给数据。",
                        options: [
                            { label: `交换（+${gain}情报，自保派好感+）`, apply: () => { vo.intel += gain; this._faction(fac, 8); this._log("你与自保派完成了等价交换。"); } },
                            { label: "暂不交换", apply: () => { this._log("你暂缓了与自保派的交易。"); } },
                        ],
                    };
                }
                // 扩张派
                const cost = 50;
                return {
                    title: "扩张派·强制征收",
                    desc: "扩张派试图强征你的重工设备，妥协可获设备，拒绝将面临断供。",
                    options: [
                        { label: `妥协（-${cost}星币，获设备，扩张派好感+）`, apply: () => { vo.credits = Math.max(0, vo.credits - cost); this._faction(fac, 10); this._log("你向扩张派妥协，换得重工设备。"); } },
                        { label: "拒绝（扩张派好感-，但保全资产）", apply: () => { this._faction(fac, -12); this._log("你拒绝了扩张派，关系趋紧。"); } },
                    ],
                };
            },
        });

        // 补给断裂：随机一条已解锁线短期降速
        rules.push({
            type: EGameEvent.SupplyBreak,
            weight: 2,
            build: () => {
                const unlocked = (Object.values(EFactor) as EFactor[]).filter(f => typeof f === "number" && vo.lines[f].unlocked);
                if (unlocked.length === 0) return null;
                const f = unlocked[Math.floor(Math.random() * unlocked.length)];
                return {
                    title: "补给断裂",
                    desc: `星区割据导致【${FACTOR_INFO[f].supply}】原料断供，该产线暂时降速。`,
                    options: [
                        { label: "硬扛（产线降速一段时间）", apply: () => { this._applySlow(f, 20); this._log(`${FACTOR_INFO[f].name}线因断供降速。`); } },
                        { label: "应急替换配方（-30星币缓解）", apply: () => { vo.credits = Math.max(0, vo.credits - 30); this._log(`你用替代配方缓解了${FACTOR_INFO[f].name}线断供。`); } },
                    ],
                };
            },
        });

        // 难民潮：限时公益，声望奖励
        rules.push({
            type: EGameEvent.Refugee,
            weight: 2,
            build: () => ({
                title: "难民潮",
                desc: "人道救援战线送来一批濒危自然种族，限时公益供给可换取大量声望。",
                options: [
                    { label: "敞开供应（+15声望）", apply: () => { vo.reputation += 15; this._log("你为难民潮敞开了补给，声望大涨。"); } },
                    { label: "量力而行（+5声望）", apply: () => { vo.reputation += 5; this._log("你有限度地援助了难民。"); } },
                ],
            }),
        });

        // 信标异动：爆单高峰
        rules.push({
            type: EGameEvent.Beacon,
            weight: 1,
            build: () => {
                // 立刻补 2 名顾客
                for (let i = 0; i < 2; i++) if (this.customers.length < vo.berthCount) this._spawnCustomer();
                return {
                    title: "信标异动",
                    desc: "旧联邦信标短暂复苏，大量迷失飞船涌入，迎来爆单高峰！",
                    options: [
                        { label: "全力接单", apply: () => { this._log("信标异动，爆单高峰来临！"); gcoreEvent.emit(ERestaurantEvent.StateChanged); } },
                    ],
                };
            },
        });

        return rules;
    }

    /** 线降速（临时：通过降低进度增速实现，这里用简单惩罚——清空部分进度并标记） */
    private _applySlow(f: EFactor, sec: number): void {
        // 用事件计时器思路：直接减库存缓冲 + 降低本次进度
        this.progress[f] = 0;
        // 简化：在 sec 秒内速率减半——这里仅做一次性惩罚
        this.inventory[f] = Math.max(0, this.inventory[f] - 1);
    }

    /** 调整阵营关系 */
    private _faction(fac: EFaction, delta: number): void {
        const vo = gdata.vo;
        vo.factionRel[fac] = Math.max(-100, Math.min(100, (vo.factionRel[fac] ?? 0) + delta));
        gdata.saveData();
    }

    private _log(msg: string): void {
        gcoreEvent.emit(ERestaurantEvent.Log, msg);
        gcoreEvent.emit(ERestaurantEvent.StateChanged);
    }
}

export const restaurantGame = RestaurantGame.inst;
