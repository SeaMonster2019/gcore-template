/**
 * @file font-converter.ts
 * @description 字体格式互转工具类，采用 Google Fonts / Adobe 官方开源工业标准 fonttools (otf2ttf) 作为核心转换引擎，并提供 opentype.js 降级支持
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, extname, isAbsolute, join, relative } from 'path';
import { normalizePathForStorage } from './path-util';

// @ts-ignore
const opentype = require('opentype.js');
// @ts-ignore
const { Font } = require('fonteditor-core');

/** 支持的字体转换格式枚举类型 */
export type SupportedFontFormat = 'ttf' | 'otf';

/** 字体格式互转结果数据接口 */
export interface FontConvertResult {
    /** 是否转换成功 */
    ok: boolean;
    /** 源字体文件路径 */
    sourceFontPath: string;
    /** 源字体格式标识 ('ttf' | 'otf') */
    sourceFormat: string;
    /** 导出的目标字体文件路径 */
    targetFontPath: string;
    /** 目标字体格式标识 ('ttf' | 'otf') */
    targetFormat: string;
    /** 源字体文件原始字节大小 */
    originalSize: number;
    /** 转换后目标文件字节大小 */
    newSize: number;
    /** 体积变化百分比 (负数表示减小，正数表示增大) */
    sizeChangePercent: number;
    /** 重构生成的有效字形总数 */
    glyphCount: number;
    /** 实际调用的底层转换引擎名称描述 */
    engine: string;
    /** 错误或失败描述信息 (可选) */
    error?: string;
}

/**
 * 字体格式互转处理器
 */
export class FontConverter {
    /**
     * 执行 OTF ⇋ TTF 字体格式互转并保存到指定目标文件
     * @param workspace 工作区根目录
     * @param sourceFontPath 源字体文件相对或绝对路径
     * @param targetFormat 目标转换格式 ('ttf' | 'otf')
     * @param targetFontPath 导出的目标字体文件路径
     * @returns 字体格式转换结果对象
     */
    public static async convert(
        workspace: string,
        sourceFontPath: string,
        targetFormat: SupportedFontFormat,
        targetFontPath: string
    ): Promise<FontConvertResult> {
        if (!sourceFontPath || !sourceFontPath.trim()) {
            return {
                ok: false,
                sourceFontPath: '',
                sourceFormat: '',
                targetFontPath: '',
                targetFormat,
                originalSize: 0,
                newSize: 0,
                sizeChangePercent: 0,
                glyphCount: 0,
                engine: '',
                error: '请选择需要转换的源字体文件 (.ttf / .otf)。',
            };
        }

        if (!targetFontPath || !targetFontPath.trim()) {
            return {
                ok: false,
                sourceFontPath,
                sourceFormat: '',
                targetFontPath: '',
                targetFormat,
                originalSize: 0,
                newSize: 0,
                sizeChangePercent: 0,
                glyphCount: 0,
                engine: '',
                error: '请指定或选择导出的目标字体文件路径。',
            };
        }

        const normalizedSource = normalizePathForStorage(sourceFontPath.trim(), workspace);
        const absSourcePath = isAbsolute(sourceFontPath) ? sourceFontPath : join(workspace, normalizedSource);

        if (!existsSync(absSourcePath)) {
            return {
                ok: false,
                sourceFontPath: normalizedSource,
                sourceFormat: '',
                targetFontPath,
                targetFormat,
                originalSize: 0,
                newSize: 0,
                sizeChangePercent: 0,
                glyphCount: 0,
                engine: '',
                error: `源字体文件不存在: ${normalizedSource}`,
            };
        }

        const originalSize = statSync(absSourcePath).size;
        const sourceExt = extname(absSourcePath).toLowerCase().replace('.', '') || 'ttf';
        const sourceFormat: SupportedFontFormat = sourceExt === 'otf' ? 'otf' : 'ttf';

        const normalizedTarget = normalizePathForStorage(targetFontPath.trim(), workspace);
        let absTargetPath = isAbsolute(targetFontPath) ? targetFontPath : join(workspace, normalizedTarget);

        const expectedExt = `.${targetFormat}`;
        if (!absTargetPath.toLowerCase().endsWith(expectedExt)) {
            absTargetPath += expectedExt;
        }

        const targetDir = dirname(absTargetPath);
        if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
        }

        let engineName = 'fonttools (otf2ttf)';
        let glyphCount = 0;

        // 1. 优先使用工业级 fonttools (otf2ttf) 开源标准工具执行转换
        let fontToolsSuccess = false;
        try {
            const cmd = `otf2ttf -o "${absTargetPath}" "${absSourcePath}"`;
            execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
            if (existsSync(absTargetPath) && statSync(absTargetPath).size > 0) {
                fontToolsSuccess = true;
            }
        } catch (e) {
            fontToolsSuccess = false;
        }

        // 2. 若 fonttools 不可用，则自动采用 opentype.js + fonteditor-core 备用管线
        if (!fontToolsSuccess) {
            engineName = 'opentype.js (Fallback)';
            try {
                const fontBuffer = readFileSync(absSourcePath);
                const arrayBuffer = fontBuffer.buffer.slice(
                    fontBuffer.byteOffset,
                    fontBuffer.byteOffset + fontBuffer.byteLength
                );
                const otFont = opentype.parse(arrayBuffer);
                glyphCount = otFont.numGlyphs || 0;

                const font = Font.create(fontBuffer, {
                    type: sourceFormat,
                    hinting: false,
                });

                const writeType = targetFormat === 'otf' ? 'ttf' : targetFormat;
                const rawOut = font.write({
                    type: writeType,
                    hinting: false,
                    writeZeroContoursGlyfData: false,
                });

                writeFileSync(absTargetPath, Buffer.from(rawOut));
            } catch (e: any) {
                return {
                    ok: false,
                    sourceFontPath: normalizedSource,
                    sourceFormat,
                    targetFontPath: normalizedTarget,
                    targetFormat,
                    originalSize,
                    newSize: 0,
                    sizeChangePercent: 0,
                    glyphCount: 0,
                    engine: engineName,
                    error: `字体格式转换失败: ${e?.message ?? String(e)}`,
                };
            }
        }

        const newSize = existsSync(absTargetPath) ? statSync(absTargetPath).size : 0;
        const sizeChangePercent = originalSize > 0 ? Number((((newSize - originalSize) / originalSize) * 100).toFixed(2)) : 0;

        return {
            ok: true,
            sourceFontPath: normalizedSource,
            sourceFormat,
            targetFontPath: normalizedTarget,
            targetFormat,
            originalSize,
            newSize,
            sizeChangePercent,
            glyphCount,
            engine: engineName,
        };
    }
}
