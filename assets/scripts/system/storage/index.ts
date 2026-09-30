import { StorageMgr } from "./storage-mgr";
import { ConfigMgr } from "./config-mgr";
export * from "./storage-mgr";
export const gcoreStorage = new StorageMgr();
export const gcoreConfig = new ConfigMgr();