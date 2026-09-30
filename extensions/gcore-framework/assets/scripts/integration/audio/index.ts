import { AudioMgr } from "./audio-mgr";

export * from "./audio-types";
export * from "./audio-config";
export * from "./audio-channel-music";
export * from "./audio-channel-effect";
export * from "./audio-mgr";
export * from "./components/audio-button";

/** GCore 全局音频管理器单例 */
export const gcoreAudio = new AudioMgr();
