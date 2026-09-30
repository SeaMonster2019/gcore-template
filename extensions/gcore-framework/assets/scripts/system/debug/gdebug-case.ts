/** GDebugCase 使用说明
 *
 * 这个类用于给测试类提供一个轻量级的“运行时测试框架”，常见用法是：
 * 1. 用类装饰器把某个测试类注册成可直接在全局执行的测试入口。
 * 2. 用方法装饰器给测试方法标记“是否参与测试”、输入参数和期望结果。
 * 3. 运行全局函数后，会自动按注册顺序执行该类下的所有测试方法，并输出通过、失败和异常统计。
 *
 * 基本规则：
 * - 每个被装饰的测试类，都会在全局对象上生成一个同名调用入口。
 * - 测试方法支持同步和异步两种形式。
 * - 如果配置了期望结果，会对返回值进行深度比较。
 * - 如果类级别开启了 isErrorEnd，则遇到失败或异常时会立即终止后续测试。
 *
 * 简单示例：
 *
 * import { GDebugCase } from "./gdebug-case";
 *
 * @GDebugCase.GCoreTestCase("runMathTest")
 * export class MathTest extends GDebugCase {
 *
 *     @GDebugCase.GCoreTestFunc(undefined, true, 3)
 *     add(): number {
 *         return 1 + 2;
 *     }
 *
 *     @GDebugCase.GCoreTestAsyncFunc(undefined, true, "done")
 *     async loadData(): Promise<string> {
 *         return Promise.resolve("done");
 *     }
 * }
 *
 * 使用时直接在控制台或代码中调用：
 * runMathTest();
 *
 * 执行结果示例：
 * - add 通过：返回值 3，与期望一致。
 * - loadData 通过：异步返回值 "done"，与期望一致。
 *
 * 如果不想让某个方法参与测试，可以把装饰器的 isTest 参数设为 false：
 *
 * @GDebugCase.GCoreTestFunc(undefined, false)
 * skippedCase(): void {
 *     // 不会进入测试集合
 * }
 */

import { DEBUG } from "cc/env";
const SUCCESS_COLOR = "color: rgb(62, 184, 32);";
const FAILURE_COLOR = "color: rgb(220, 20, 60);";

class LocalLog {
    public debugSuccess(message?: any, ...optionalParams: any[]) {
        console.log(message, ...optionalParams, SUCCESS_COLOR);
    }
    public debugFailure(message?: any, ...optionalParams: any[]) {
        if (DEBUG) {
            console.warn(message, ...optionalParams, FAILURE_COLOR);
        }
    }
}
const glog = new LocalLog();

/** 测试用例 */
interface IGDebugCase {
    /** 测试函数 */
    testFunc: Function;
    /** 测试函数名称 */
    propertyKey: string;
    /** 期望测试结果 */
    testResult?: any;
    /** 参数 */
    params?: any;
    /** 是否异步 */
    isAsync?: boolean;
}

/** 测试统计信息 */
interface IGDebugStats {
    /** 总测试数 */
    total: number;
    /** 通过测试数 */
    passed: number;
    /** 失败测试数 */
    failed: number;
    /** 错误测试数 */
    errors: number;
}

/** 测试类数据 */
interface IGDebugCaseData {
    /** 构造函数 */
    constructor: Function;
    /** 测试函数映射表 */
    testFuncMap: Map<string, IGDebugCase[]>;
    /** 出错时是否结束 */
    isErrorEnd?: boolean;
    /** 类装饰器传入的全局别名 */
    alias?: string;
}

/** 测试用例基类 */
export class GDebugCase {

    /** 测试函数映射表，按类名隔离 */
    private static _TestFuncMap: Map<string, IGDebugCaseData> = new Map();

    /** 测试用例装饰器
     * @param name 测试用例名称
     */
    static GCoreTestCase(name: string, isErrorEnd: boolean = false) {
        return function (target: Function): void {
            const className = target.name;  // 使用实际类名
            const classData = GDebugCase._GetTestClassData(className, target);
            classData.isErrorEnd = isErrorEnd;
            classData.alias = name;
            GDebugCase._CreateGlobalRunner(name, className);
        };
    }

    /** 测试用例方法装饰器
     * @param testResult 期望的测试结果（可选）
     */
    static GCoreTestFunc(param?: any, isTest: boolean = true, testResult?: any) {
        return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {

            if (!isTest) {
                return;
            }

            GDebugCase._RegisterTestFunc(target, propertyKey, descriptor, param, testResult, false);

        } as PropertyDecorator;
    }

    /** 异步测试方法装饰器 */
    static GCoreTestAsyncFunc(params?: any, isTest: boolean = true, testResult?: any) {
        return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {

            if (!isTest) {
                return;
            }

            GDebugCase._RegisterTestFunc(target, propertyKey, descriptor, params, testResult, true);

        } as PropertyDecorator;
    }

    /** 深度比较两个值是否相等 */
    private static _DeepEqual(a: any, b: any): boolean {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;

            if (Array.isArray(a)) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (!GDebugCase._DeepEqual(a[i], b[i])) return false;
                }
                return true;
            }

            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;

            for (const key of keysA) {
                if (!keysB.includes(key)) return false;
                if (!GDebugCase._DeepEqual(a[key], b[key])) return false;
            }
            return true;
        }

        return false;
    }

    /** 获取或创建类的测试数据 */
    private static _GetTestClassData(className: string, constructor: Function): IGDebugCaseData {
        if (!GDebugCase._TestFuncMap.has(className)) {
            const newClassData: IGDebugCaseData = {
                constructor: constructor,
                testFuncMap: new Map(),
                isErrorEnd: false,
            };
            GDebugCase._TestFuncMap.set(className, newClassData);
        }
        return GDebugCase._TestFuncMap.get(className)!;
    }

    /** 注册测试方法的公共逻辑 */
    private static _RegisterTestFunc(
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor | undefined,
        params: any,
        testResult: any,
        isAsync: boolean = false
    ): void {
        const className = target.constructor.name;
        const propertyKeyStr = String(propertyKey);
        const testFunc = descriptor?.value || target[propertyKey];
        if (testFunc && typeof testFunc === 'function') {
            const classData = GDebugCase._GetTestClassData(className, target.constructor);
            if (!classData.testFuncMap.has(propertyKeyStr)) {
                classData.testFuncMap.set(propertyKeyStr, []);
            }
            const testCase: IGDebugCase = {
                testFunc: testFunc,
                propertyKey: propertyKeyStr,
                params: params,
                testResult: testResult,
                isAsync: isAsync,
            };
            classData.testFuncMap.get(propertyKeyStr)!.push(testCase);
            // 如果类已经有别名注册，则把单个方法入口挂到全局别名上
            if (classData.alias) {
                const alias = classData.alias;
                const safeAlias = (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(alias)) ? alias : alias.replace(/[^A-Za-z0-9_$]/g, '_');
                const globalObj: any = (globalThis as any)[alias];
                if (globalObj && typeof globalObj === 'function') {
                    (globalObj as any)[propertyKeyStr] = () => GDebugCase._RunMethodTests(className, propertyKeyStr);
                    // 同时更新安全别名的方法入口
                    if (safeAlias !== alias) {
                        const globalSafeObj: any = (globalThis as any)[safeAlias];
                        if (globalSafeObj && typeof globalSafeObj === 'function') {
                            (globalSafeObj as any)[propertyKeyStr] = (globalObj as any)[propertyKeyStr];
                        }
                    }
                }
            }
        }
    }

    /** 为别名创建全局运行入口，并挂载已注册的方法 */
    private static _CreateGlobalRunner(alias: string, className: string): void {
        const runner = () => GDebugCase._RunAllTests(className);
        // 创建一个安全的标识符（把非标识符字符替换为下划线）
        const safeAlias = (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(alias)) ? alias : alias.replace(/[^A-Za-z0-9_$]/g, '_');
        (globalThis as any)[alias] = runner;
        if (safeAlias !== alias) {
            (globalThis as any)[safeAlias] = (globalThis as any)[alias];
        }

        const classData = GDebugCase._TestFuncMap.get(className);
        if (!classData) return;
        for (const methodName of classData.testFuncMap.keys()) {
            (globalThis as any)[alias][methodName] = () => GDebugCase._RunMethodTests(className, methodName);
            if (safeAlias !== alias) {
                (globalThis as any)[safeAlias][methodName] = (globalThis as any)[alias][methodName];
            }
        }
    }

    /** 运行某个类下的全部测试 */
    private static async _RunAllTests(className: string): Promise<void> {
        const classData = GDebugCase._TestFuncMap.get(className);
        if (!classData || classData.testFuncMap.size === 0) {
            console.warn(`类 ${className} 没有注册任何测试函数`);
            return;
        }

        // 收集所有测试用例
        const allTestCases: IGDebugCase[] = [];
        for (const testCases of classData.testFuncMap.values()) {
            allTestCases.push(...testCases);
        }

        const instance: any = new ((classData.constructor as any))();

        console.log(`========== 开始测试 [${className}] ==========`);
        const stats: IGDebugStats = { total: allTestCases.length, passed: 0, failed: 0, errors: 0 };

        for (const testCase of allTestCases) {
            const testName = testCase.propertyKey;
            try {
                const result = testCase.isAsync
                    ? await testCase.testFunc.bind(instance)()
                    : testCase.testFunc.bind(instance)();

                if (testCase.testResult !== undefined && !GDebugCase._DeepEqual(result, testCase.testResult)) {
                    glog.debugFailure(`✗ ${testName} 失败 | 期望: ${JSON.stringify(testCase.testResult)} | 实际: ${JSON.stringify(result)}`);
                    stats.failed++;
                    if (classData.isErrorEnd) break;
                } else {
                    glog.debugSuccess(`✓ ${testName} 通过`);
                    stats.passed++;
                }
            } catch (error) {
                console.error(`✗ ${testName} 异常: ${error}`);
                stats.errors++;
                if (classData.isErrorEnd) break;
            }
        }

        console.log(`========== 完成 [${className}] | 总计: ${stats.total} | 通过: ${stats.passed} | 失败: ${stats.failed} | 异常: ${stats.errors} ==========`);
        // 不删除数据，允许后续多次调用单个方法
        // GDebugCase._TestFuncMap.delete(className);
    }

    /** 运行某个方法的测试集合（可能有多个同名用例） */
    private static async _RunMethodTests(className: string, methodName: string): Promise<void> {
        const classData = GDebugCase._TestFuncMap.get(className);
        if (!classData) {
            console.warn(`类 ${className} 没有注册任何测试函数`);
            return;
        }
        const testCases = classData.testFuncMap.get(methodName);
        if (!testCases || testCases.length === 0) {
            console.warn(`方法 ${methodName} 没有注册测试用例`);
            return;
        }

        const instance: any = new ((classData.constructor as any))();

        console.log(`----- 开始测试 [${className}.${methodName}] -----`);
        for (const testCase of testCases) {
            try {
                const result = testCase.isAsync
                    ? await testCase.testFunc.bind(instance)()
                    : testCase.testFunc.bind(instance)();

                if (testCase.testResult !== undefined && !GDebugCase._DeepEqual(result, testCase.testResult)) {
                    glog.debugFailure(`✗ ${methodName} 失败 | 期望: ${JSON.stringify(testCase.testResult)} | 实际: ${JSON.stringify(result)}`);
                } else {
                    glog.debugSuccess(`✓ ${methodName} 通过`);
                }
            } catch (error) {
                console.error(`✗ ${methodName} 异常: ${error}`);
            }
        }
        console.log(`----- 完成 [${className}.${methodName}] -----`);
    }

    /** 开始测试 */
    private async _testStart(): Promise<void> {

        const className = this.constructor.name;
        const classData = GDebugCase._TestFuncMap.get(className);

        if (!classData || classData.testFuncMap.size === 0) {
            console.warn(`类 ${className} 没有注册任何测试函数`);
            return;
        }

        // 收集所有测试用例
        const allTestCases: IGDebugCase[] = [];
        for (const testCases of classData.testFuncMap.values()) {
            allTestCases.push(...testCases);
        }

        console.log(`========== 开始测试 [${className}] ==========`);
        const stats: IGDebugStats = { total: allTestCases.length, passed: 0, failed: 0, errors: 0 };

        for (const testCase of allTestCases) {
            const testName = testCase.propertyKey;
            try {
                const result = testCase.isAsync
                    ? await testCase.testFunc.bind(this)()
                    : testCase.testFunc.bind(this)();

                if (testCase.testResult !== undefined && !GDebugCase._DeepEqual(result, testCase.testResult)) {
                    glog.debugFailure(`✗ ${testName} 失败 | 期望: ${JSON.stringify(testCase.testResult)} | 实际: ${JSON.stringify(result)}`);
                    stats.failed++;
                    if (classData.isErrorEnd) break;
                } else {
                    glog.debugSuccess(`✓ ${testName} 通过`);
                    stats.passed++;
                }
            } catch (error) {
                console.error(`✗ ${testName} 异常: ${error}`);
                stats.errors++;
                if (classData.isErrorEnd) break;
            }
        }

        console.log(`========== 完成 [${className}] | 总计: ${stats.total} | 通过: ${stats.passed} | 失败: ${stats.failed} | 异常: ${stats.errors} ==========`);
        GDebugCase._TestFuncMap.delete(className);
    }

}