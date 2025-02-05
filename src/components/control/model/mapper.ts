import { MeshStandardMaterial } from 'three'
import type { MaterialType } from './types'

export const materials: Record<MaterialType, (origin: MeshStandardMaterial) => MeshStandardMaterial> = {
  DEFAULT: (origin) => origin,
  FABRIC: (origin) => {
    const clone = origin.clone()
    clone.setValues({
      metalness: 0,
      roughness: 0.5,
      vertexColors: false,
      transparent: false,
    })
    return clone
  },
  METALIC: (origin) => {
    const clone = origin.clone()
    clone.setValues({
      metalness: 1.0,
      roughness: 0,
      vertexColors: false,
      transparent: false,
    })
    return clone
  },
  TRANSPARENT: (origin) => {
    const clone = origin.clone()
    clone.setValues({
      metalness: 0,
      roughness: 0.5,
      vertexColors: false,
      transparent: true,
      opacity: 0.1,
    })
    return clone
  },
}
