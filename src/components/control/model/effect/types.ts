import type { Mesh } from 'three'

export type MaterialEffectOption = {
  thickness?: number
}

export interface Effect {
  add: (mesh: Mesh, option?: any) => void
  remove: (mesh: Mesh) => void
}
