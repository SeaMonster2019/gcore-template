import { EFaction, EFactor } from "../define/define-game-data";

/** 单条补给线的存档状态 */
export interface ILineState {
    /** 是否已解锁（建造了对应加工站） */
    unlocked: boolean;
    /** 加工站等级（影响产出速率与单产） */
    level: number;
}

/** 日记条目（叙事载体） */
export interface IDiaryEntry {
    /** 自增 id */
    id: number;
    /** 记录于第几天 */
    day: number;
    /** 顾客种族名 */
    raceName: string;
    /** 需求因子（用于图鉴着色） */
    factors: EFactor[];
    /** 叙事标签 */
    tag: string;
    /** 日记正文（对话/故事碎片） */
    text: string;
    /** 结算奖励摘要 */
    reward: string;
}

/** 阵营关系存档 */
export type FactionRelMap = Partial<Record<EFaction, number>>;

/** 餐厅经营全局值对象（会被持久化） */
export class GDataVo {
    /** 星币 */
    credits: number = 200;
    /** 情报 */
    intel: number = 0;
    /** 声望（全种族综合） */
    reputation: number = 0;
    /** 当前天数（每个营业日） */
    day: number = 1;
    /** 泊位数量（同时可接待的飞船数） */
    berthCount: number = 3;
    /** 9 条补给线状态，key 为 EFactor */
    lines: Record<EFactor, ILineState> = {
        [EFactor.Carbon]:     { unlocked: true,  level: 1 },
        [EFactor.Water]:      { unlocked: true,  level: 1 },
        [EFactor.Bio]:        { unlocked: false, level: 1 },
        [EFactor.Mineral]:    { unlocked: false, level: 1 },
        [EFactor.Silicon]:    { unlocked: false, level: 1 },
        [EFactor.Gas]:        { unlocked: false, level: 1 },
        [EFactor.Mech]:       { unlocked: false, level: 1 },
        [EFactor.Electric]:   { unlocked: false, level: 1 },
        [EFactor.LiquidMetal]:{ unlocked: false, level: 1 },
    };
    /** 已雇佣的招牌员工 id 列表 */
    crews: string[] = [];
    /** 阵营关系值（-100 ~ 100，0 为中立） */
    factionRel: FactionRelMap = {
        [EFaction.Reunifier]: 0,
        [EFaction.Expansionist]: 0,
        [EFaction.Autonomist]: 0,
    };
    /** 餐厅日记 */
    diary: IDiaryEntry[] = [];
    /** 累计成功接待顾客数 */
    servedCount: number = 0;
    /** 日记自增计数 */
    diarySeq: number = 1;
}

/** 全局数据实例 */
export const gdataVo: GDataVo = new GDataVo();

/** 重置游戏数据 */
export function gdataVoReset(): void {
    console.info(`[gdata] 重置游戏数据`);
    // 逐字段覆盖，保留引用
    const fresh = new GDataVo();
    Object.assign(gdataVo, fresh);
}
