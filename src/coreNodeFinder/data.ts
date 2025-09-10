import type { CoreKey } from "./types";

export const defaultCoreKeys: CoreKey[] = [
  { name: "hips", constraint: "INCLUDES" },
  { name: "pelvis", constraint: "INCLUDES" },
];
export const exceptCoreKeys: CoreKey[] = [{ name: "root", constraint: "INCLUDES" }];
