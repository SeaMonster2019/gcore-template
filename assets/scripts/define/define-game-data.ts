/**
 * 《星恸·餐厅日记》核心数据定义
 * 严格沿用策划案：9 大代谢因子、23 种族池（取代表）、10 招牌员工、3 阵营、事件表。
 * 所有数值为原型平衡值，便于后续在 Cocos 编辑器/配置表中调整。
 */

/** 9 大代谢因子（补给品类线） */
export enum EFactor {
    Carbon = 1,      // 碳基因子 -> 有机质餐
    Water = 2,       // 水机因子 -> 流体/纯水
    Bio = 3,         // 生化因子 -> 真菌培养体
    Mineral = 4,     // 矿质因子 -> 矿石粉/合金骨板
    Silicon = 5,     // 硅基因子 -> 晶体/半导体
    Gas = 6,         // 气能因子 -> 等离子
    Mech = 7,        // 机械因子 -> 构件/润滑油
    Electric = 8,    // 电气因子 -> 电流/能量块
    LiquidMetal = 9, // 液金因子 -> 液态金属
}

/** 因子静态信息 */
export interface IFactorInfo {
    id: EFactor;
    /** 中文名 */
    name: string;
    /** 餐厅对应供应品类 */
    supply: string;
    /** 主题光色（十六进制，如 #3FBF5F） */
    color: string;
    /** 工序站名（加工站类型） */
    station: string;
}

/** 9 条补给线静态表 */
export const FACTOR_INFO: Record<EFactor, IFactorInfo> = {
    [EFactor.Carbon]:     { id: EFactor.Carbon,     name: "碳基",   supply: "有机质餐",   color: "#5BD66B", station: "有机合成炉" },
    [EFactor.Water]:      { id: EFactor.Water,      name: "水机",   supply: "流体/纯水",  color: "#3FA9F5", station: "流体提纯塔" },
    [EFactor.Bio]:        { id: EFactor.Bio,        name: "生化",   supply: "真菌培养体", color: "#C77DFF", station: "活体培养舱" },
    [EFactor.Mineral]:    { id: EFactor.Mineral,    name: "矿质",   supply: "矿石粉",     color: "#E0A458", station: "矿物研磨站" },
    [EFactor.Silicon]:    { id: EFactor.Silicon,    name: "硅基",   supply: "晶体脉络",   color: "#4FC3F7", station: "晶格生长室" },
    [EFactor.Gas]:        { id: EFactor.Gas,        name: "气能",   supply: "等离子",     color: "#B388FF", station: "等离子激发器" },
    [EFactor.Mech]:       { id: EFactor.Mech,       name: "机械",   supply: "构件/润滑油",color: "#9AA7B2", station: "构件加工台" },
    [EFactor.Electric]:   { id: EFactor.Electric,   name: "电气",   supply: "电流/能量块",color: "#FFD54F", station: "稳压回路阵" },
    [EFactor.LiquidMetal]:{ id: EFactor.LiquidMetal,name: "液金",   supply: "液态金属",   color: "#D6E4EF", station: "记忆合金炉" },
};

/** 全部因子 id 列表 */
export const ALL_FACTORS: EFactor[] = [
    EFactor.Carbon, EFactor.Water, EFactor.Bio, EFactor.Mineral, EFactor.Silicon,
    EFactor.Gas, EFactor.Mech, EFactor.Electric, EFactor.LiquidMetal,
];

/** 叙事标签（影响对话/付款/事件） */
export enum ENarrativeTag {
    Refugee = "难民",
    Smuggler = "走私客",
    Explorer = "探险者",
    Spy = "间谍",
    Scholar = "学者",
    Merchant = "商队",
}

/** 顾客种族定义 */
export interface IRaceDef {
    id: string;
    name: string;
    /** 1~2 个代谢因子，决定其补给需求 */
    factors: EFactor[];
    /** 一句话设定 */
    desc: string;
    /** 头像主色（无美术资源时的占位色） */
    avatarColor: string;
    /** 可能的叙事标签 */
    tags: ENarrativeTag[];
}

/**
 * 种族池（取自策划案第六节的因子组合表）
 * 碳基+水机 / 碳基+生化 / 碳基+矿质 / 硅基+矿质 / 硅基+电气 /
 * 水机+生化 / 气能+电气 / 气能+机械 / 机械+电气 / 生化+电气 /
 * 液金+电气 / 碳基+机械
 */
export const RACE_DEF: IRaceDef[] = [
    { id: "human",      name: "人类",       factors: [EFactor.Carbon, EFactor.Water],      desc: "旧联邦补给站体系继承者，碳基+水机的标准模板。", avatarColor: "#F2C09A", tags: [ENarrativeTag.Merchant, ENarrativeTag.Scholar] },
    { id: "lost_child", name: "遗落之子",   factors: [EFactor.Carbon, EFactor.Water],      desc: "大断连中与母星失联的混血后代。", avatarColor: "#C9B6E4", tags: [ENarrativeTag.Refugee, ENarrativeTag.Explorer] },
    { id: "forest",     name: "森裔",       factors: [EFactor.Carbon, EFactor.Water],      desc: "以木质躯壳行走的森林意识集合体。", avatarColor: "#8BD17C", tags: [ENarrativeTag.Explorer, ENarrativeTag.Scholar] },
    { id: "wing",       name: "鳞羽翼客",   factors: [EFactor.Carbon, EFactor.Water],      desc: "翼展覆鳞的迁徙民族，常年在航线间漂泊。", avatarColor: "#7FD3C7", tags: [ENarrativeTag.Merchant, ENarrativeTag.Refugee] },
    { id: "chrysalis",  name: "巢蛹",       factors: [EFactor.Carbon, EFactor.Bio],        desc: "蜂巢心智的有机质转化者。", avatarColor: "#F2A0C9", tags: [ENarrativeTag.Merchant, ENarrativeTag.Scholar] },
    { id: "crown",      name: "蔓生冠树",   factors: [EFactor.Carbon, EFactor.Bio],        desc: "以冠层光合维持生态循环的活体群落。", avatarColor: "#9CCC65", tags: [ENarrativeTag.Explorer] },
    { id: "spore",      name: "微孢幽影",   factors: [EFactor.Carbon, EFactor.Bio],        desc: "以孢子传播的半透明共生生命。", avatarColor: "#B39DDB", tags: [ENarrativeTag.Spy, ENarrativeTag.Refugee] },
    { id: "beast",      name: "甲胄蛮兽",   factors: [EFactor.Carbon, EFactor.Mineral],    desc: "披矿物甲壳的 brute，力大无穷。", avatarColor: "#A1887F", tags: [ENarrativeTag.Explorer, ENarrativeTag.Merchant] },
    { id: "terra",      name: "泰拉",       factors: [EFactor.Silicon, EFactor.Mineral],   desc: "硅基+矿质，无视高低温的真·搬运工。", avatarColor: "#90A4AE", tags: [ENarrativeTag.Merchant, ENarrativeTag.Scholar] },
    { id: "crystal",    name: "水晶",       factors: [EFactor.Silicon, EFactor.Electric],  desc: "操控电磁波的硅基生命，可被反向供电。", avatarColor: "#80DEEA", tags: [ENarrativeTag.Scholar, ENarrativeTag.Merchant] },
    { id: "spike",      name: "硅晶棘簇",   factors: [EFactor.Silicon, EFactor.Electric],  desc: "以晶刺聚能的群居硅基生物。", avatarColor: "#4DD0E1", tags: [ENarrativeTag.Explorer] },
    { id: "bila",       name: "哔啦",       factors: [EFactor.Water, EFactor.Bio],         desc: "半流体身躯，可挤入任何缝隙。", avatarColor: "#4FC3F7", tags: [ENarrativeTag.Merchant, ENarrativeTag.Refugee] },
    { id: "spark",      name: "烁光灵",     factors: [EFactor.Gas, EFactor.Electric],      desc: "穿行电磁场的气能光团。", avatarColor: "#CE93D8", tags: [ENarrativeTag.Explorer, ENarrativeTag.Scholar] },
    { id: "phantom",    name: "虚数幽灵",   factors: [EFactor.Gas, EFactor.Electric],      desc: "数据入侵/加密的电气幽灵。", avatarColor: "#B39DDB", tags: [ENarrativeTag.Spy, ENarrativeTag.Smuggler] },
    { id: "heavy",      name: "熔钢重工",   factors: [EFactor.Gas, EFactor.Mech],          desc: "重工业造物，等离子驱动巨械。", avatarColor: "#FF8A65", tags: [ENarrativeTag.Merchant, ENarrativeTag.Explorer] },
    { id: "matrix",     name: "矩象机械",   factors: [EFactor.Mech, EFactor.Electric],     desc: "规整如矩阵的自律机械。", avatarColor: "#B0BEC5", tags: [ENarrativeTag.Scholar, ENarrativeTag.Merchant] },
    { id: "frontier",   name: "拓境智能",   factors: [EFactor.Mech, EFactor.Electric],     desc: "数据协同的星图测绘 AI。", avatarColor: "#90CAF9", tags: [ENarrativeTag.Scholar, ENarrativeTag.Explorer] },
    { id: "hub",        name: "枢纽蜂工",   factors: [EFactor.Mech, EFactor.Electric],     desc: "集群流水线协同的蜂群无人机。", avatarColor: "#CFD8DC", tags: [ENarrativeTag.Merchant] },
    { id: "weaver",     name: "仿生织者",   factors: [EFactor.Bio, EFactor.Electric],      desc: "高精度微操的精密合成者。", avatarColor: "#F48FB1", tags: [ENarrativeTag.Scholar, ENarrativeTag.Spy] },
    { id: "dust",       name: "泛尘",       factors: [EFactor.LiquidMetal, EFactor.Electric], desc: "游离的液金尘埃聚合体。", avatarColor: "#ECEFF1", tags: [ENarrativeTag.Explorer, ENarrativeTag.Smuggler] },
    { id: "construct",  name: "液态构装",   factors: [EFactor.LiquidMetal, EFactor.Electric], desc: "任意形变的工具型构装体。", avatarColor: "#CFD8DC", tags: [ENarrativeTag.Merchant, ENarrativeTag.Refugee] },
    { id: "titan",      name: "钛纪合成",   factors: [EFactor.Carbon, EFactor.Mech],       desc: "有机质与自修补件融合的合成生命。", avatarColor: "#AAB6C4", tags: [ENarrativeTag.Scholar, ENarrativeTag.Explorer] },
];

/** 按 id 取种族 */
export function getRaceById(id: string): IRaceDef {
    return RACE_DEF.find(r => r.id === id)!;
}

/** 招牌员工定义 */
export interface ICrewDef {
    id: string;
    name: string;
    factors: EFactor[];
    /** 招牌技能描述 */
    skill: string;
    /** 在餐厅的作用 */
    role: string;
    /** 雇佣花费（星币） */
    hireCost: number;
    /** 每级提升的产线效率（百分比，作用于其擅长因子线） */
    bonusPerLevel: number;
}

/** 10 位招牌员工（取自策划案第五节） */
export const CREW_DEF: ICrewDef[] = [
    { id: "bila",    name: "哔啦",       factors: [EFactor.Water, EFactor.Bio],     skill: "半流体身躯，可挤入任何缝隙", role: "清洗/输送/管道维修；水机线高效处理", hireCost: 120, bonusPerLevel: 20 },
    { id: "terra",   name: "泰拉",       factors: [EFactor.Silicon, EFactor.Mineral], skill: "力大无穷、无视高低温真空", role: "矿石粗碎、重料搬运；矿质线零损耗", hireCost: 150, bonusPerLevel: 20 },
    { id: "crystal", name: "水晶",       factors: [EFactor.Silicon, EFactor.Electric], skill: "操控电磁波与能量", role: "充能桩主控、电气线稳压", hireCost: 160, bonusPerLevel: 22 },
    { id: "chrysalis", name: "巢蛹",     factors: [EFactor.Carbon, EFactor.Bio],    skill: "有机质转化、蜂巢心智", role: "活体食材培育、生化线高产", hireCost: 130, bonusPerLevel: 20 },
    { id: "frontier", name: "拓境智能",  factors: [EFactor.Mech, EFactor.Electric], skill: "数据协同、星图测绘", role: "数据库终端管理、机械线诊断", hireCost: 180, bonusPerLevel: 24 },
    { id: "construct", name: "液态构装", factors: [EFactor.LiquidMetal, EFactor.Electric], skill: "任意形变工具", role: "临时充当加工站配件、应急密封", hireCost: 170, bonusPerLevel: 22 },
    { id: "spark",   name: "烁光灵",     factors: [EFactor.Gas, EFactor.Electric],  skill: "穿行电磁场", role: "气能线激发、线路巡检", hireCost: 140, bonusPerLevel: 22 },
    { id: "weaver",  name: "仿生织者",   factors: [EFactor.Bio, EFactor.Electric],  skill: "高精度微操", role: "精密合成、复合补给零损耗", hireCost: 190, bonusPerLevel: 24 },
    { id: "hub",     name: "枢纽蜂工",   factors: [EFactor.Mech, EFactor.Electric], skill: "集群流水线协同", role: "自动值守多条干线、规模化产出", hireCost: 210, bonusPerLevel: 26 },
    { id: "phantom", name: "虚数幽灵",   factors: [EFactor.Electric],               skill: "数据入侵/加密", role: "黑市数据嗅探、解锁隐藏配方", hireCost: 200, bonusPerLevel: 25 },
];

/** 按 id 取员工 */
export function getCrewById(id: string): ICrewDef {
    return CREW_DEF.find(c => c.id === id)!;
}

/** 阵营 */
export enum EFaction {
    Reunifier = "复统派",   // 视餐厅为可规训据点，发航道通行证
    Expansionist = "扩张派",// 视餐厅为资源前哨，想强征
    Autonomist = "自保派",  // 最友善的贸易伙伴，等价交换
}

/** 阵营静态信息 */
export const FACTION_INFO: Record<EFaction, { name: string; desc: string; color: string }> = {
    [EFaction.Reunifier]:    { name: "复统派", desc: "视餐厅为可规训的补给据点，愿发航道通行证，但要求上报顾客情报。", color: "#5C6BC0" },
    [EFaction.Expansionist]: { name: "扩张派", desc: "视餐厅为资源采集前哨，想强征设备；拒绝供应会被断供。", color: "#EF5350" },
    [EFaction.Autonomist]:   { name: "自保派", desc: "最友善的贸易伙伴，等价交换，解锁稀有食材与中立庇护。", color: "#66BB6A" },
};

/** 阵营列表 */
export const ALL_FACTIONS: EFaction[] = [EFaction.Reunifier, EFaction.Expansionist, EFaction.Autonomist];

/** 事件类型 */
export enum EGameEvent {
    SupplyBreak = "补给断裂",   // 某原料断供，须替换配方
    Pirate = "海盗临检",        // 暗影掠夺同盟收税
    Refugee = "难民潮",         // 限时公益供给，奖励声望
    Beacon = "信标异动",        // 迷失飞船涌入，爆单高峰
    FactionDemand = "阵营征询", // 某阵营提出交换/要求
}
