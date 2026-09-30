/**
 * @file font-checker.ts
 * @description 字体缺字检测核心逻辑，解析字体支持的字符集并与指定多语言的全量文本对比
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { extname, isAbsolute, join, relative } from 'path';
import { FontParser } from './font-parser';
import { normalizePathForStorage } from './path-util';
import { StorageMgr } from './storage-mgr';

/** 单个缺失字符详细信息接口 */
export interface MissingCharDetail {
    /** 缺失的具体字符 (如: '饕') */
    char: string;
    /** 字符的 16 进制 Unicode 表达 (如: 'U+98E7') */
    codeHex: string;
    /** 字符的 10 进制 Unicode 码点 (如: 39143) */
    codePoint: number;
    /** 包含该缺失字符的多语言配置表 Key 列表样本 */
    keys: string[];
}

/** 字体缺字检测结果数据接口 */
export interface FontCheckResult {
    /** 是否检测通过（true 表示覆盖率 100%，无任何缺字） */
    ok: boolean;
    /** 检测的字体文件路径 */
    fontPath: string;
    /** 识别的字体文件格式类型描述 */
    fontType: string;
    /** 字体自带的有效字符字形总数 */
    fontCharCount: number;
    /** 检测的目标语言代码 (如: 'zh-Hans', 'en') */
    langCode: string;
    /** 检测的目标语言展示名称 (如: '中文', '英文') */
    langName: string;
    /** 检索到的多语言配置表总文本条目数 */
    totalKeys: number;
    /** 多语言文本统计包含的字符总数 (含重复) */
    totalChars: number;
    /** 去重后需支持的独立字符总数 */
    totalUniqueChars: number;
    /** 检测出的缺失字符详细列表 */
    missingChars: MissingCharDetail[];
    /** 字符覆盖百分比 (0 ~ 100) */
    coveragePercent: number;
    /** 错误或失败描述信息 (可选) */
    error?: string;
}

/**
 * 字体多语言缺字检测器
 */
export class FontChecker {
    /**
     * 执行字体语言完整性缺字检测
     * @param workspace 工作区根目录
     * @param fontFilePath 字体文件相对或绝对路径
     * @param langCode 目标语言代码 (如 'zh-Hans', 'en')
     * @returns 字体缺字检测综合结果对象
     */
    public static check(workspace: string, fontFilePath: string, langCode: string): FontCheckResult {
        if (!fontFilePath || !fontFilePath.trim()) {
            return {
                ok: false,
                fontPath: '',
                fontType: '',
                fontCharCount: 0,
                langCode,
                langName: '',
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: '请先选择目标字体文件 (.ttf / .otf / .fnt)。',
            };
        }

        const normalizedFont = normalizePathForStorage(fontFilePath.trim(), workspace);
        const absFontPath = isAbsolute(fontFilePath) ? fontFilePath : join(workspace, normalizedFont);

        if (!existsSync(absFontPath)) {
            return {
                ok: false,
                fontPath: normalizedFont,
                fontType: '',
                fontCharCount: 0,
                langCode,
                langName: '',
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: `字体文件不存在: ${normalizedFont}`,
            };
        }

        // 1. 读取并解析字体支持的字符集
        let fontBuffer: Buffer;
        try {
            fontBuffer = readFileSync(absFontPath);
        } catch (e: any) {
            return {
                ok: false,
                fontPath: normalizedFont,
                fontType: '',
                fontCharCount: 0,
                langCode,
                langName: '',
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: `读取字体文件失败: ${e?.message ?? String(e)}`,
            };
        }

        const ext = extname(absFontPath);
        let parsedFont;
        try {
            parsedFont = FontParser.parse(fontBuffer, ext);
        } catch (e: any) {
            return {
                ok: false,
                fontPath: normalizedFont,
                fontType: '',
                fontCharCount: 0,
                langCode,
                langName: '',
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: `解析字体文件失败: ${e?.message ?? String(e)}`,
            };
        }

        // 2. 获取语言展示名称
        const state = StorageMgr.loadState(workspace);
        const langConfig = state.languages.find((l) => l.code === langCode);
        const langName = langConfig ? langConfig.name : langCode;

        // 3. 读取并解析多语言 CSV 文本文件
        const csvDir = join(workspace, 'design/配置/多语言/配置');
        if (!existsSync(csvDir)) {
            return {
                ok: false,
                fontPath: normalizedFont,
                fontType: parsedFont.fontType,
                fontCharCount: parsedFont.charCodes.size,
                langCode,
                langName,
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: `未找到多语言 CSV 目录: ${relative(workspace, csvDir)}`,
            };
        }

        const keyTextMap: Map<string, string> = new Map();
        try {
            const csvFiles = readdirSync(csvDir).filter((f) => f.endsWith('.csv'));
            for (const file of csvFiles) {
                const filePath = join(csvDir, file);
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split(/\r?\n/);
                if (lines.length < 2) continue;

                let varLineIndex = -1;
                for (let i = 0; i < Math.min(lines.length, 10); i++) {
                    if (lines[i].startsWith('##var')) {
                        varLineIndex = i;
                        break;
                    }
                }
                if (varLineIndex === -1) continue;

                const headerCols = lines[varLineIndex].split(',').map((s) => s.trim());
                const keyColIndex = headerCols.indexOf('key');
                if (keyColIndex === -1) continue;

                let targetLangColIndex = headerCols.indexOf(`value@${langCode}`);
                if (targetLangColIndex === -1) {
                    targetLangColIndex = headerCols.indexOf('value');
                }
                if (targetLangColIndex === -1) {
                    // 没有明确的目标语言列，跳过该表
                    continue;
                }

                for (let i = varLineIndex + 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('##')) continue;

                    const rowCols = line.split(',');
                    const key = (rowCols[keyColIndex] ?? '').trim();
                    if (!key) continue;

                    const text = rowCols[targetLangColIndex] ?? '';
                    keyTextMap.set(key, text);
                }
            }
        } catch (e: any) {
            return {
                ok: false,
                fontPath: normalizedFont,
                fontType: parsedFont.fontType,
                fontCharCount: parsedFont.charCodes.size,
                langCode,
                langName,
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: `读取多语言 CSV 异常: ${e?.message ?? String(e)}`,
            };
        }

        if (keyTextMap.size === 0) {
            return {
                ok: false,
                fontPath: normalizedFont,
                fontType: parsedFont.fontType,
                fontCharCount: parsedFont.charCodes.size,
                langCode,
                langName,
                totalKeys: 0,
                totalChars: 0,
                totalUniqueChars: 0,
                missingChars: [],
                coveragePercent: 0,
                error: `未在语言 [${langName} (${langCode})] 下检索到任何多语言文本条目。`,
            };
        }

        // 4. 分析提取所有字符与码点
        let totalChars = 0;
        const charToKeysMap: Map<string, { codePoint: number; keys: Set<string> }> = new Map();

        for (const [key, text] of keyTextMap.entries()) {
            if (!text) continue;
            // 正确遍历 Unicode 字符（支持代理对 surrogate pairs）
            const chars = Array.from(text);
            for (const ch of chars) {
                const codePoint = ch.codePointAt(0)!;
                // 忽略空格、全角空格、不可见空白及控制字符（由排版引擎自动处理间距）
                if (
                    codePoint === 32 || // 半角空格 (Space)
                    codePoint === 160 || // 不换行空格 (\u00A0)
                    codePoint === 12288 || // 全角空格 (\u3000)
                    codePoint === 10 || // 换行符 (\n)
                    codePoint === 13 || // 回车符 (\r)
                    codePoint === 9 || // 制表符 (\t)
                    (codePoint >= 0 && codePoint < 32)
                ) {
                    continue;
                }

                totalChars++;
                let entry = charToKeysMap.get(ch);
                if (!entry) {
                    entry = { codePoint, keys: new Set() };
                    charToKeysMap.set(ch, entry);
                }
                if (entry.keys.size < 5) {
                    entry.keys.add(key);
                }
            }
        }

        const totalUniqueChars = charToKeysMap.size;
        const missingChars: MissingCharDetail[] = [];

        // 5. 对比字体支持字符集与实际所需字符集
        for (const [ch, entry] of charToKeysMap.entries()) {
            if (!parsedFont.charCodes.has(entry.codePoint)) {
                const hexStr = 'U+' + entry.codePoint.toString(16).toUpperCase().padStart(4, '0');
                missingChars.push({
                    char: ch,
                    codeHex: hexStr,
                    codePoint: entry.codePoint,
                    keys: Array.from(entry.keys),
                });
            }
        }

        const coveredCount = totalUniqueChars - missingChars.length;
        const coveragePercent = totalUniqueChars > 0 ? (coveredCount / totalUniqueChars) * 100 : 100;

        return {
            ok: missingChars.length === 0,
            fontPath: normalizedFont,
            fontType: parsedFont.fontType,
            fontCharCount: parsedFont.charCodes.size,
            langCode,
            langName,
            totalKeys: keyTextMap.size,
            totalChars,
            totalUniqueChars,
            missingChars,
            coveragePercent: Number(coveragePercent.toFixed(2)),
        };
    }
}
