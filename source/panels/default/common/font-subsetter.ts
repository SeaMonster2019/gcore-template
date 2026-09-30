/**
 * @file font-subsetter.ts
 * @description 字体子集化与抽字压缩工具类，从源字体中按需提取指定文本内容所包含的字符，大幅精简字体文件体积
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, isAbsolute, join, relative } from 'path';
import { normalizePathForStorage } from './path-util';

// @ts-ignore
const { Font } = require('fonteditor-core');

/** 字体抽字压缩 (子集化) 结果数据接口 */
export interface FontSubsetResult {
    /** 是否压缩成功 */
    ok: boolean;
    /** 源字体文件路径 */
    sourceFontPath: string;
    /** 参考文本文件路径 */
    textFilePath: string;
    /** 导出的目标字体文件路径 */
    targetFontPath: string;
    /** 源字体文件原始字节大小 */
    originalSize: number;
    /** 抽字压缩后新文件字节大小 */
    newSize: number;
    /** 整体压缩率百分比 (0 ~ 100) */
    compressionRatio: number;
    /** 成功提取并保留的独立字符总数 */
    uniqueCharCount: number;
    /** 提取字符的文本样本切片 */
    charSample: string;
    /** 压缩过程中的底层字形警告提示列表 */
    warnings: string[];
    /** 错误或失败描述信息 (可选) */
    error?: string;
}

/**
 * 修复并校准 TrueType/OpenType 二进制结构中的 OS/2 字符范围溢出
 * @param buf 字体二进制 Buffer 数据
 * @returns 修复后的 Buffer
 */
function sanitizeTTFBuffer(buf: Buffer): Buffer {
    if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
    if (buf.length < 12) return buf;

    try {
        const numTables = buf.readUInt16BE(4);
        let os2Offset = -1;

        for (let i = 0; i < numTables; i++) {
            const tableEntryOffset = 12 + i * 16;
            if (tableEntryOffset + 16 > buf.length) break;
            const tag = buf.toString('utf8', tableEntryOffset, tableEntryOffset + 4);
            if (tag === 'OS/2') {
                os2Offset = buf.readUInt32BE(tableEntryOffset + 8);
                break;
            }
        }

        if (os2Offset > 0 && os2Offset + 68 <= buf.length) {
            const usFirst = buf.readUInt16BE(os2Offset + 64);
            const usLast = buf.readUInt16BE(os2Offset + 66);
            if (usLast < 0x20 || usLast < usFirst || usLast < 0xFFFF) {
                buf.writeUInt16BE(0xFFFF, os2Offset + 66);
            }
            if (usFirst === 0 || usFirst > 0xFFFF) {
                buf.writeUInt16BE(32, os2Offset + 64);
            }
        }
    } catch (e) {}

    return buf;
}

/**
 * 字体抽字压缩 (子集化) 处理器
 */
export class FontSubsetter {
    /**
     * 执行字体抽字压缩与导出
     * @param workspace 工作区根目录
     * @param fontFilePath 源字体文件相对或绝对路径
     * @param textFilePath 参考文本文件路径 (.txt, .json, .csv, .md 等)
     * @param targetFontPath 导出的目标字体文件保存路径
     * @param extraChars 附加需要保留的字符（可选）
     * @returns 字体抽字压缩综合结果
     */
    public static subset(
        workspace: string,
        fontFilePath: string,
        textFilePath: string,
        targetFontPath: string,
        extraChars: string = ''
    ): FontSubsetResult {
        const warnings: string[] = [];

        if (!fontFilePath || !fontFilePath.trim()) {
            return {
                ok: false,
                sourceFontPath: '',
                textFilePath: '',
                targetFontPath: '',
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: '请选择源字体文件 (.ttf / .otf)。',
            };
        }

        if (!textFilePath || !textFilePath.trim()) {
            return {
                ok: false,
                sourceFontPath: fontFilePath,
                textFilePath: '',
                targetFontPath: '',
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: '请选择参考文本文件 (.txt / .json / .csv / .md 等)。',
            };
        }

        if (!targetFontPath || !targetFontPath.trim()) {
            return {
                ok: false,
                sourceFontPath: fontFilePath,
                textFilePath,
                targetFontPath: '',
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: '请指定或选择导出的目标字体文件路径。',
            };
        }

        const normalizedFont = normalizePathForStorage(fontFilePath.trim(), workspace);
        const absFontPath = isAbsolute(fontFilePath) ? fontFilePath : join(workspace, normalizedFont);

        if (!existsSync(absFontPath)) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath,
                targetFontPath,
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: `源字体文件不存在: ${normalizedFont}`,
            };
        }

        const normalizedTextPath = normalizePathForStorage(textFilePath.trim(), workspace);
        const absTextPath = isAbsolute(textFilePath) ? textFilePath : join(workspace, normalizedTextPath);

        if (!existsSync(absTextPath)) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath: normalizedTextPath,
                targetFontPath,
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: `参考文本文件不存在: ${normalizedTextPath}`,
            };
        }

        const normalizedTarget = normalizePathForStorage(targetFontPath.trim(), workspace);
        let absTargetPath = isAbsolute(targetFontPath) ? targetFontPath : join(workspace, normalizedTarget);

        if (!absTargetPath.toLowerCase().endsWith('.ttf')) {
            absTargetPath += '.ttf';
        }

        // 1. 读取参考文本并去重提取所需字符集
        let textContent = '';
        try {
            textContent = readFileSync(absTextPath, 'utf-8');
        } catch (e: any) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath: normalizedTextPath,
                targetFontPath: normalizedTarget,
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: `读取参考文本文件失败: ${e?.message ?? String(e)}`,
            };
        }

        const charSet = new Set<string>();
        const fullText = textContent + (extraChars || '');
        const chars = Array.from(fullText);

        for (const ch of chars) {
            const cp = ch.codePointAt(0)!;
            // 忽略控制字符与换行
            if (cp < 32 && cp !== 9) continue;
            charSet.add(ch);
        }

        // 基础保留 ASCII 空间字符以确保行间距正确渲染
        charSet.add(' ');

        const subsetString = Array.from(charSet).join('');
        if (subsetString.length === 0) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath: normalizedTextPath,
                targetFontPath: normalizedTarget,
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: 0,
                charSample: '',
                warnings,
                error: '参考文本文件中未提取到任何有效字符。',
            };
        }

        // 2. 读取源字体文件 Buffer
        let fontBuffer: Buffer;
        try {
            fontBuffer = readFileSync(absFontPath);
        } catch (e: any) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath: normalizedTextPath,
                targetFontPath: normalizedTarget,
                originalSize: 0,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: charSet.size,
                charSample: '',
                warnings,
                error: `读取源字体文件失败: ${e?.message ?? String(e)}`,
            };
        }

        const originalSize = fontBuffer.length;
        const fontExt = extname(absFontPath).toLowerCase().replace('.', '') || 'ttf';
        const fontType = fontExt === 'otf' ? 'otf' : 'ttf';

        // 3. 拦截控制台捕获底层字形警告
        const originalWarn = console.warn;
        const originalError = console.error;
        console.warn = (...args: any[]) => {
            const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            warnings.push(msg);
        };
        console.error = (...args: any[]) => {
            const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            warnings.push(msg);
        };

        let newBuffer: Buffer;
        try {
            const font = Font.create(fontBuffer, {
                type: fontType,
                subset: subsetString,
                hinting: false,
            });

            // 导出优化后的 TrueType Buffer
            const out = font.write({
                type: 'ttf',
                hinting: false,
                writeZeroContoursGlyfData: false,
            });

            newBuffer = sanitizeTTFBuffer(Buffer.from(out));
        } catch (e: any) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath: normalizedTextPath,
                targetFontPath: normalizedTarget,
                originalSize,
                newSize: 0,
                compressionRatio: 0,
                uniqueCharCount: charSet.size,
                charSample: '',
                warnings,
                error: `字体抽字子集化生成失败: ${e?.message ?? String(e)}`,
            };
        } finally {
            console.warn = originalWarn;
            console.error = originalError;
        }

        // 4. 确保输出目录存在并写入目标字体文件
        try {
            const targetDir = dirname(absTargetPath);
            if (!existsSync(targetDir)) {
                mkdirSync(targetDir, { recursive: true });
            }
            writeFileSync(absTargetPath, newBuffer);
        } catch (e: any) {
            return {
                ok: false,
                sourceFontPath: normalizedFont,
                textFilePath: normalizedTextPath,
                targetFontPath: normalizedTarget,
                originalSize,
                newSize: newBuffer.length,
                compressionRatio: 0,
                uniqueCharCount: charSet.size,
                charSample: '',
                warnings,
                error: `写入目标字体文件失败: ${e?.message ?? String(e)}`,
            };
        }

        const newSize = newBuffer.length;
        const compressionRatio = originalSize > 0 ? ((originalSize - newSize) / originalSize) * 100 : 0;
        const charSample = subsetString.slice(0, 30) + (subsetString.length > 30 ? '...' : '');

        return {
            ok: true,
            sourceFontPath: normalizedFont,
            textFilePath: normalizedTextPath,
            targetFontPath: normalizedTarget,
            originalSize,
            newSize,
            compressionRatio: Number(compressionRatio.toFixed(2)),
            uniqueCharCount: charSet.size,
            charSample,
            warnings,
        };
    }
}
