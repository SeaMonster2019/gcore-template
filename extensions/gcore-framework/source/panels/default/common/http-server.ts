/**
 * @file http-server.ts
 * @description 编辑器状态下 HTTP 实时多语言预览服务管理器
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { join } from 'path';
import { LogCallback } from './types';

export class HttpServerMgr {
    private static server: Server | null = null;
    private static activePort: number = 8989;
    private static activePreviewLang: string = 'zh-Hans';

    /** 多语言数据映射表: langCode -> { key -> text } */
    private static dataMap: Record<string, Record<string, string>> = {};

    /**
     * 启动 HTTP 服务
     * @param port 监听端口号
     * @param previewLang 当前预览语言
     * @param workspace 工作区根路径
     * @param logger 日志输出回调
     */
    public static start(port: number, previewLang: string, workspace: string, logger: LogCallback): void {
        if (this.server) {
            if (this.activePort === port) {
                this.activePreviewLang = previewLang;
                this.loadCsvData(workspace, logger);
                return;
            }
            this.stop();
        }

        this.activePort = port;
        this.activePreviewLang = previewLang;
        this.loadCsvData(workspace, logger);

        try {
            this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
                this.handleRequest(req, res);
            });

            this.server.listen(port, '127.0.0.1', () => {
                logger(`HTTP 多语言预览服务已启动: http://127.0.0.1:${port}`, 'success');
            });

            this.server.on('error', (err: any) => {
                logger(`HTTP 服务异常 [端口 ${port}]: ${err.message}`, 'error');
                this.server = null;
            });
        } catch (e) {
            logger(`启动 HTTP 服务失败: ${(e as any)?.message ?? String(e)}`, 'error');
        }
    }

    /**
     * 停止 HTTP 服务
     */
    public static stop(logger?: LogCallback): void {
        if (this.server) {
            try {
                this.server.close();
                if (logger) logger('HTTP 多语言预览服务已关闭', 'info');
            } catch (e) {
                // ignore
            }
            this.server = null;
        }
    }

    /**
     * 更新当前预览语言
     * @param previewLang 预览语言代码
     */
    public static setPreviewLang(previewLang: string): void {
        this.activePreviewLang = previewLang;
    }

    /**
     * 服务是否正在运行
     */
    public static isRunning(): boolean {
        return this.server !== null && this.server.listening;
    }

    /**
     * 重新从业务层 CSV 表装载多语言文本数据
     * @param workspace 工作区路径
     * @param logger 日志回调
     */
    public static loadCsvData(workspace: string, logger?: LogCallback): void {
        this.dataMap = {};
        const csvDir = join(workspace, 'design/配置/多语言/配置');

        if (!existsSync(csvDir)) {
            if (logger) logger(`未找到多语言 CSV 目录: ${csvDir}`, 'error');
            return;
        }

        try {
            const files = readdirSync(csvDir).filter((f) => f.endsWith('.csv'));
            let totalKeys = 0;

            for (const file of files) {
                const filePath = join(csvDir, file);
                const content = readFileSync(filePath, 'utf-8');
                const lines = content.split(/\r?\n/);

                if (lines.length < 2) continue;

                // 查找 ##var 行以确定 key 和 value@<lang> 的列索引
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

                const langColIndices: Record<string, number> = {};
                headerCols.forEach((col, idx) => {
                    if (col.startsWith('value@')) {
                        const langCode = col.substring(6).trim();
                        langColIndices[langCode] = idx;
                    } else if (col === 'value') {
                        langColIndices['default'] = idx;
                    }
                });

                // 解析具体数据行
                for (let i = varLineIndex + 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('##')) continue;

                    const rowCols = line.split(',');
                    const key = (rowCols[keyColIndex] ?? '').trim();
                    if (!key) continue;

                    totalKeys++;

                    Object.keys(langColIndices).forEach((langCode) => {
                        const colIdx = langColIndices[langCode];
                        const text = rowCols[colIdx] ?? '';
                        if (!this.dataMap[langCode]) {
                            this.dataMap[langCode] = {};
                        }
                        this.dataMap[langCode][key] = text;
                    });
                }
            }

            if (logger) logger(`装载 CSV 多语言表完成，包含 ${totalKeys} 条 Key 配置`, 'info');
        } catch (e) {
            if (logger) logger(`装载 CSV 多语言数据失败: ${(e as any)?.message ?? String(e)}`, 'error');
        }
    }

    /**
     * HTTP 请求处理逻辑
     */
    private static handleRequest(req: IncomingMessage, res: ServerResponse): void {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const reqUrl = req.url || '';
        const parsedUrl = new URL(reqUrl, `http://127.0.0.1:${this.activePort}`);
        const pathname = parsedUrl.pathname;

        if (pathname === '/api/text' || pathname === '/text' || pathname === '/') {
            const key = parsedUrl.searchParams.get('key') || '';
            const reqLang = parsedUrl.searchParams.get('lang') || this.activePreviewLang;
            const fallback = parsedUrl.searchParams.get('fallback') || '';

            const langDict = this.dataMap[reqLang] || this.dataMap['default'] || {};
            const foundText = langDict[key] ?? this.dataMap['default']?.[key];
            const resultText = (foundText !== undefined && foundText !== '') ? foundText : (fallback || key);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(
                JSON.stringify({
                    key,
                    lang: reqLang,
                    text: resultText,
                    success: true,
                })
            );
            return;
        }

        if (pathname === '/api/preview' || pathname === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(
                JSON.stringify({
                    running: true,
                    port: this.activePort,
                    previewLang: this.activePreviewLang,
                })
            );
            return;
        }

        if (pathname === '/api/all') {
            const reqLang = parsedUrl.searchParams.get('lang') || this.activePreviewLang;
            const langDict = this.dataMap[reqLang] || {};
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(
                JSON.stringify({
                    lang: reqLang,
                    dict: langDict,
                })
            );
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
}
