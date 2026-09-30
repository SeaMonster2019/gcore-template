/**
 * @file font-parser.ts
 * @description 字体底层二进制解析器，负责直接解析 TTF / OTF / TTC / FNT 字体文件的 cmap 字符映射表与字形编码
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';

/** 字体解析结果数据接口 */
export interface FontParseResult {
    /** 识别的字体文件格式类型描述 */
    fontType: string;
    /** 字体支持的全部 Unicode 字符码点集合 (Set<number>) */
    charCodes: Set<number>;
    /** 字体包含的总字形数量 (可选) */
    totalGlyphs?: number;
}

/**
 * 字体底层二进制结构解析器
 */
export class FontParser {
    /**
     * 解析字体二进制 Buffer 或文件
     * @param buffer 字体文件 Buffer 数据
     * @param ext 文件扩展名 (.ttf, .otf, .fnt 等)
     * @returns 字体解析结果对象
     */
    public static parse(buffer: Buffer, ext: string): FontParseResult {
        const extLower = ext.toLowerCase();
        if (extLower === '.fnt') {
            return this.parseFnt(buffer);
        }
        return this.parseSfnt(buffer);
    }

    /**
     * 解析 SFNT 容器格式 (TTF / OTF / TTC)
     * @param buf 字体二进制数据
     * @returns 字体解析结果
     */
    private static parseSfnt(buf: Buffer): FontParseResult {
        if (buf.length < 12) {
            throw new Error('字体文件数据过小，无法解析');
        }

        const tag = buf.toString('ascii', 0, 4);
        let fontType = 'TrueType Font (.ttf)';
        if (tag === 'OTTO') {
            fontType = 'OpenType Font (.otf, CFF)';
        } else if (tag === 'ttcf') {
            fontType = 'TrueType Collection (.ttc)';
        }

        let fontOffset = 0;
        if (tag === 'ttcf') {
            // TTC 字体集合: 读取第一个子字体的偏移量
            if (buf.length >= 16) {
                fontOffset = buf.readUInt32BE(12);
            }
        }

        if (buf.length < fontOffset + 12) {
            throw new Error('无效的字体文件头');
        }

        const numTables = buf.readUInt16BE(fontOffset + 4);
        let cmapOffset = 0;
        let maxpOffset = 0;

        // 遍历所有表目录定位 cmap 和 maxp 表
        for (let i = 0; i < numTables; i++) {
            const tableEntryOffset = fontOffset + 12 + i * 16;
            if (tableEntryOffset + 16 > buf.length) break;
            const tableTag = buf.toString('ascii', tableEntryOffset, tableEntryOffset + 4);
            const tableOffset = buf.readUInt32BE(tableEntryOffset + 8);
            if (tableTag === 'cmap') {
                cmapOffset = tableOffset;
            } else if (tableTag === 'maxp') {
                maxpOffset = tableOffset;
            }
        }

        let totalGlyphs: number | undefined;
        if (maxpOffset > 0 && maxpOffset + 6 <= buf.length) {
            totalGlyphs = buf.readUInt16BE(maxpOffset + 4);
        }

        if (!cmapOffset || cmapOffset + 4 > buf.length) {
            throw new Error('字体文件中未找到 cmap 字符映射表');
        }

        const subtableCount = buf.readUInt16BE(cmapOffset + 2);
        const charCodes = new Set<number>();

        // 遍历所有子编码表提取码点
        for (let j = 0; j < subtableCount; j++) {
            const subRecordOffset = cmapOffset + 4 + j * 8;
            if (subRecordOffset + 8 > buf.length) break;

            const platformID = buf.readUInt16BE(subRecordOffset);
            const encodingID = buf.readUInt16BE(subRecordOffset + 2);
            const subtableOffset = cmapOffset + buf.readUInt32BE(subRecordOffset + 4);

            if (subtableOffset + 2 > buf.length) continue;
            const format = buf.readUInt16BE(subtableOffset);

            if (format === 4) {
                this.parseCmapFormat4(buf, subtableOffset, charCodes);
            } else if (format === 12) {
                this.parseCmapFormat12(buf, subtableOffset, charCodes);
            } else if (format === 0) {
                this.parseCmapFormat0(buf, subtableOffset, charCodes);
            } else if (format === 6) {
                this.parseCmapFormat6(buf, subtableOffset, charCodes);
            }
        }

        return {
            fontType,
            charCodes,
            totalGlyphs,
        };
    }

    /**
     * 解析 Format 4 子表 (BMP 字符常用格式，按段分段存储)
     */
    private static parseCmapFormat4(buf: Buffer, offset: number, charCodes: Set<number>): void {
        if (offset + 14 > buf.length) return;
        const segCountX2 = buf.readUInt16BE(offset + 6);
        const segCount = Math.floor(segCountX2 / 2);

        const endCodeOffset = offset + 14;
        const startCodeOffset = endCodeOffset + segCountX2 + 2;
        const idDeltaOffset = startCodeOffset + segCountX2;
        const idRangeOffsetOffset = idDeltaOffset + segCountX2;

        if (idRangeOffsetOffset + segCountX2 > buf.length) return;

        for (let s = 0; s < segCount; s++) {
            const endCode = buf.readUInt16BE(endCodeOffset + s * 2);
            const startCode = buf.readUInt16BE(startCodeOffset + s * 2);
            const idDelta = buf.readInt16BE(idDeltaOffset + s * 2);
            const idRangeOffset = buf.readUInt16BE(idRangeOffsetOffset + s * 2);

            if (startCode === 0xFFFF && endCode === 0xFFFF) break;

            for (let c = startCode; c <= endCode; c++) {
                if (idRangeOffset === 0) {
                    const glyphId = (c + idDelta) & 0xFFFF;
                    if (glyphId !== 0) {
                        charCodes.add(c);
                    }
                } else {
                    const glyphOffset = (idRangeOffsetOffset + s * 2) + idRangeOffset + (c - startCode) * 2;
                    if (glyphOffset + 2 <= buf.length) {
                        const glyphId = buf.readUInt16BE(glyphOffset);
                        if (glyphId !== 0) {
                            charCodes.add(c);
                        }
                    }
                }
            }
        }
    }

    /**
     * 解析 Format 12 子表 (全 Unicode 码点分段格式，支持扩展平面如 Emoji、生僻汉字等)
     */
    private static parseCmapFormat12(buf: Buffer, offset: number, charCodes: Set<number>): void {
        if (offset + 16 > buf.length) return;
        const numGroups = buf.readUInt32BE(offset + 12);
        let curOffset = offset + 16;

        for (let i = 0; i < numGroups; i++) {
            if (curOffset + 12 > buf.length) break;
            const startCharCode = buf.readUInt32BE(curOffset);
            const endCharCode = buf.readUInt32BE(curOffset + 4);
            const startGlyphID = buf.readUInt32BE(curOffset + 8);

            for (let c = startCharCode; c <= endCharCode; c++) {
                const glyphId = startGlyphID + (c - startCharCode);
                if (glyphId !== 0) {
                    charCodes.add(c);
                }
            }
            curOffset += 12;
        }
    }

    /**
     * 解析 Format 0 子表 (1 字节字符映射表，如 ASCII/Macintosh)
     */
    private static parseCmapFormat0(buf: Buffer, offset: number, charCodes: Set<number>): void {
        if (offset + 6 + 256 > buf.length) return;
        for (let i = 0; i < 256; i++) {
            const glyphId = buf.readUInt8(offset + 6 + i);
            if (glyphId !== 0) {
                charCodes.add(i);
            }
        }
    }

    /**
     * 解析 Format 6 子表 (紧凑型单段索引表)
     */
    private static parseCmapFormat6(buf: Buffer, offset: number, charCodes: Set<number>): void {
        if (offset + 10 > buf.length) return;
        const firstCode = buf.readUInt16BE(offset + 6);
        const entryCount = buf.readUInt16BE(offset + 8);
        if (offset + 10 + entryCount * 2 > buf.length) return;

        for (let i = 0; i < entryCount; i++) {
            const glyphId = buf.readUInt16BE(offset + 10 + i * 2);
            if (glyphId !== 0) {
                charCodes.add(firstCode + i);
            }
        }
    }

    /**
     * 解析 Bitmap Font (.fnt) 文件 (兼容 XML、纯文本与二进制格式)
     */
    private static parseFnt(buf: Buffer): FontParseResult {
        const charCodes = new Set<number>();
        const str = buf.toString('utf-8');

        // 1. 尝试 XML 格式: <char id="32" ... />
        if (str.includes('<char ') || str.includes('<font>')) {
            const regex = /<char\s+[^>]*id="(\d+)"/g;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(str)) !== null) {
                charCodes.add(parseInt(match[1], 10));
            }
            return {
                fontType: 'Bitmap Font XML (.fnt)',
                charCodes,
            };
        }

        // 2. 尝试纯文本格式: char id=32 x=...
        if (str.includes('char id=')) {
            const regex = /\bchar\s+id=(\d+)/g;
            let match: RegExpExecArray | null;
            while ((match = regex.exec(str)) !== null) {
                charCodes.add(parseInt(match[1], 10));
            }
            return {
                fontType: 'Bitmap Font Text (.fnt)',
                charCodes,
            };
        }

        // 3. 尝试二进制 BMFont 格式 (Block type 4 为 char 列表)
        if (buf.length >= 4 && buf[0] === 66 && buf[1] === 77 && buf[2] === 70 && buf[3] === 3) {
            let offset = 4;
            while (offset + 5 <= buf.length) {
                const blockType = buf.readUInt8(offset);
                const blockSize = buf.readUInt32LE(offset + 1);
                offset += 5;
                if (blockType === 4) {
                    const charCount = Math.floor(blockSize / 20);
                    for (let i = 0; i < charCount; i++) {
                        const charOffset = offset + i * 20;
                        if (charOffset + 4 <= buf.length) {
                            const charId = buf.readUInt32LE(charOffset);
                            charCodes.add(charId);
                        }
                    }
                    break;
                }
                offset += blockSize;
            }
            return {
                fontType: 'Bitmap Font Binary (.fnt)',
                charCodes,
            };
        }

        return {
            fontType: 'Bitmap Font (.fnt)',
            charCodes,
        };
    }
}
