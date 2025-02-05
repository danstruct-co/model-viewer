import type { AnimationAction, Object3D } from 'three'

export type CoreNodeFinderParams = {
  nodes: Record<string, Object3D>
  actions: Record<string, AnimationAction | null>
}
