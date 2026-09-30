/**
 * @file scene-script.ts
 * @description gcore-framework 场景进程入口脚本，运行在 Cocos Creator Scene 视图渲染上下文中
 */

export const methods = {
    /** 当主进程广播预览语言变更时触发 */
    onPreviewLangChanged() {
        try {
            const globalCce = (typeof window !== 'undefined' ? (window as any).cce : (globalThis as any).cce);
            if (globalCce && globalCce.Engine && typeof globalCce.Engine.repaintInEditMode === 'function') {
                globalCce.Engine.repaintInEditMode();
            }
        } catch (e) {
            console.error('[gcore SceneScript] 刷新预览语言失败:', e);
        }
    },

    /**
     * 在当前编辑的场景或预制体中替换所有 Label / RichText 文本组件的字体
     * @param fontUuid 目标字体资源的 UUID
     */
    async replaceFontInScene(fontUuid: string) {
        console.log(`[gcore SceneScript] 收到字体替换请求, fontUuid: ${fontUuid}`);

        const sendResult = (count: number, nodes: string[], error?: string) => {
            const res = { count, nodes, error };
            console.log('[gcore SceneScript] 字体替换完成:', JSON.stringify(res));
            try {
                if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.send) {
                    Editor.Message.send('gcore-framework', 'on-font-replace-result', res);
                }
            } catch (e) {
                console.warn('[gcore SceneScript] 广播 on-font-replace-result 失败:', e);
            }
            return res;
        };

        try {
            const cc = (globalThis as any).cc || (typeof window !== 'undefined' ? (window as any).cc : null);
            const globalCce = (typeof window !== 'undefined' ? (window as any).cce : (globalThis as any).cce);

            if (!cc || !cc.director) {
                return sendResult(0, [], 'Cocos Engine 未初始化或未处于场景编辑状态');
            }

            const scene = cc.director.getScene();
            if (!scene) {
                return sendResult(0, [], '未获取到当前打开的场景或预制体根节点');
            }

            console.log(`[gcore SceneScript] 找到场景/预制体根节点: ${scene.name}`);

            // 动态载入字体资源（支持内存缓存、{uuid} 与纯字符串加载机制）
            let fontAsset: any = cc.assetManager?.assets?.get(fontUuid);

            if (!fontAsset) {
                fontAsset = await new Promise((resolve) => {
                    let resolved = false;
                    const safeResolve = (val: any) => {
                        if (!resolved) {
                            resolved = true;
                            resolve(val);
                        }
                    };

                    // 1. 尝试以对象格式形式加载: { uuid: fontUuid }
                    if (cc.assetManager && typeof cc.assetManager.loadAny === 'function') {
                        cc.assetManager.loadAny({ uuid: fontUuid }, (err1: any, asset1: any) => {
                            if (!err1 && asset1) {
                                return safeResolve(asset1);
                            }
                            // 2. 尝试纯字符串格式加载
                            cc.assetManager.loadAny(fontUuid, (err2: any, asset2: any) => {
                                if (!err2 && asset2) {
                                    return safeResolve(asset2);
                                }
                                // 3. 尝试显式传入 Font/TTFFont 类型
                                const fType = cc.TTFFont || cc.BitmapFont || cc.Font;
                                if (fType) {
                                    cc.assetManager.loadAny({ uuid: fontUuid, type: fType }, (err3: any, asset3: any) => {
                                        safeResolve(asset3 || null);
                                    });
                                } else {
                                    safeResolve(null);
                                }
                            });
                        });
                    } else if (cc.resources && typeof cc.resources.load === 'function') {
                        cc.resources.load(fontUuid, (err: any, asset: any) => {
                            safeResolve(asset || null);
                        });
                    } else {
                        safeResolve(null);
                    }

                    // 3 秒超时逻辑
                    setTimeout(() => safeResolve(null), 3000);
                });
            }

            // 4. 后备机制：尝试编辑器 cce 内部 AssetDB 接口
            if (!fontAsset && globalCce && globalCce.AssetDB && typeof globalCce.AssetDB.loadAssetByUuid === 'function') {
                try {
                    fontAsset = await globalCce.AssetDB.loadAssetByUuid(fontUuid);
                } catch (e) {}
            }

            if (!fontAsset) {
                return sendResult(0, [], `无法在引擎中载入 UUID 为 [${fontUuid}] 的字体资源`);
            }

            console.log('[gcore SceneScript] 字体资源载入成功:', fontAsset.name || fontAsset);

            let count = 0;
            const replacedNodePaths: string[] = [];

            // 递归构建节点全路径
            function getNodePath(node: any): string {
                const pathParts: string[] = [];
                let curr = node;
                while (curr && curr.name && curr !== scene) {
                    pathParts.unshift(curr.name);
                    curr = curr.parent;
                }
                return pathParts.join('/') || node.name || 'Root';
            }

            // 递归遍历节点数并替换组件字体
            function traverse(node: any) {
                if (!node) return;

                const components = node.components || (typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : []);
                let replacedInThisNode = false;

                for (const comp of components) {
                    if (!comp) continue;
                    const cName = comp.constructor ? comp.constructor.name : '';
                    const classname = (comp as any).__classname__ || '';

                    const isLabel = cName === 'Label' || classname === 'cc.Label' || (cc.Label && comp instanceof cc.Label);
                    const isRichText = cName === 'RichText' || classname === 'cc.RichText' || (cc.RichText && comp instanceof cc.RichText);
                    const hasFontProp = 'font' in comp || (comp as any)._font !== undefined;

                    if (isLabel || isRichText || hasFontProp) {
                        // 设置字体资源
                        comp.font = fontAsset;

                        if ('userDefinedFont' in comp) {
                            comp.userDefinedFont = fontAsset;
                        }

                        // 关键处理：对于 Label/RichText，关闭使用系统默认字体 (useSystemFont = false)
                        if ('useSystemFont' in comp) {
                            comp.useSystemFont = false;
                        }

                        // 重新刷新文本渲染与组件数据
                        if (typeof comp.markForUpdateRender === 'function') {
                            comp.markForUpdateRender();
                        }
                        if (typeof (comp as any)._updateFontFamily === 'function') {
                            (comp as any)._updateFontFamily();
                        }
                        if (typeof (comp as any)._updateRenderData === 'function') {
                            try {
                                (comp as any)._updateRenderData(true);
                            } catch (e) {}
                        }

                        // 触发节点变更通知
                        if (globalCce && globalCce.Node && typeof globalCce.Node.emit === 'function') {
                            try {
                                globalCce.Node.emit('change', node);
                            } catch (e) {}
                        }

                        count++;
                        replacedInThisNode = true;
                    }
                }

                if (replacedInThisNode) {
                    replacedNodePaths.push(getNodePath(node));
                }

                if (node.children && node.children.length > 0) {
                    for (const child of node.children) {
                        traverse(child);
                    }
                }
            }

            traverse(scene);

            // 刷新场景渲染与编辑模式快照
            if (globalCce && globalCce.Engine && typeof globalCce.Engine.repaintInEditMode === 'function') {
                globalCce.Engine.repaintInEditMode();
            }

            try {
                if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.send) {
                    Editor.Message.send('scene', 'snapshot');
                }
            } catch (e) {}

            return sendResult(count, replacedNodePaths);
        } catch (err: any) {
            return sendResult(0, [], err?.message ?? String(err));
        }
    },

    /**
     * 获取当前处于编辑模式下打开的场景 (.scene) 或预制体 (.prefab) 资源的 UUID
     */
    async getCurrentEditingAssetUuid() {
        const sendRes = (uuid: string | null, type: string | null, error?: string) => {
            const res = { uuid, type, error };
            console.log('[gcore SceneScript] 获取当前编辑资源 UUID:', JSON.stringify(res));
            try {
                if (typeof Editor !== 'undefined' && Editor.Message && Editor.Message.send) {
                    Editor.Message.send('gcore-framework', 'on-current-asset-uuid', res);
                }
            } catch (e) {}
            return res;
        };

        try {
            const cc = (globalThis as any).cc || (typeof window !== 'undefined' ? (window as any).cc : null);
            const globalCce = (typeof window !== 'undefined' ? (window as any).cce : (globalThis as any).cce);

            // 1. 检查 cce.Scene 方法与常见属性
            if (globalCce && globalCce.Scene) {
                const s = globalCce.Scene;
                if (typeof s.getEditingPrefabUuid === 'function') {
                    const u = s.getEditingPrefabUuid();
                    if (u) return sendRes(u, 'prefab');
                }
                if (typeof s.getSceneUuid === 'function') {
                    const u = s.getSceneUuid();
                    if (u) return sendRes(u, 'scene');
                }
                if (typeof s.getEditingPrefabUrl === 'function') {
                    const u = s.getEditingPrefabUrl();
                    if (u) return sendRes(u, 'prefab');
                }

                const possibleUuids = [
                    s.currentSceneUuid, s.sceneUuid, s._sceneUuid,
                    s.currentPrefabUuid, s.editingPrefabUuid, s._editingPrefabUuid, s.prefabUuid
                ];
                for (const u of possibleUuids) {
                    if (u && typeof u === 'string') {
                        return sendRes(u, 'asset');
                    }
                }
            }

            // 2. 检查 cce.Prefab
            if (globalCce && globalCce.Prefab) {
                const p = globalCce.Prefab;
                if (typeof p.getEditingPrefabUuid === 'function') {
                    const u = p.getEditingPrefabUuid();
                    if (u) return sendRes(u, 'prefab');
                }
                if (p.editingPrefabUuid || p.currentPrefabUuid) {
                    return sendRes(p.editingPrefabUuid || p.currentPrefabUuid, 'prefab');
                }
            }

            // 3. 检查 cc.director.getScene()
            if (cc && cc.director) {
                const scene = cc.director.getScene();
                if (scene) {
                    const u = (scene as any)._uuid || (scene as any).uuid || (scene as any)._assetUuid;
                    if (u) return sendRes(u, 'scene');

                    if ((scene as any)._prefab?.asset?._uuid) {
                        return sendRes((scene as any)._prefab.asset._uuid, 'prefab');
                    }

                    if (scene.children && scene.children.length > 0) {
                        for (const child of scene.children) {
                            const pAsset = (child as any)._prefab?.asset;
                            if (pAsset && (pAsset._uuid || pAsset.uuid)) {
                                return sendRes(pAsset._uuid || pAsset.uuid, 'prefab');
                            }
                        }
                    }
                }
            }

            // 收集诊断数据用于日志排查
            const sceneKeys = globalCce?.Scene ? Object.keys(globalCce.Scene) : [];
            const cceKeys = globalCce ? Object.keys(globalCce) : [];
            const diagStr = `Scene属性: [${sceneKeys.join(', ')}], cce属性: [${cceKeys.join(', ')}]`;

            return sendRes(null, null, `未能在场景视图进程识别打开的 UUID (${diagStr})`);
        } catch (err: any) {
            return sendRes(null, null, err?.message ?? String(err));
        }
    },
};
