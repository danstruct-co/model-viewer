import type { AnimationAction, Object3D } from "three";

export type CoreKeyConstraint = "INCLUDES" | "EXACT";

export type CoreKey = {
  name: string;
  constraint: CoreKeyConstraint;
};

export type CoreNodeFinderParams = {
  nodes: Record<string, Object3D>;
  actions: Record<string, AnimationAction | null>;
};
