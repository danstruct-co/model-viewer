import { MeshBasicMaterial, MeshStandardMaterial, type Material } from 'three'
import type { MaterialType } from './types'

export const materials: Record<MaterialType, (origin: MeshStandardMaterial) => Material> = {
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
      opacity: 0.3,
    })
    return clone
  },
  CARTOON: (origin) => {
    return new MeshBasicMaterial({
      color: origin.color,
      vertexColors: origin.vertexColors,
      map: origin.map,
      alphaMap: origin.alphaMap,
      aoMap: origin.aoMap,
      aoMapIntensity: origin.aoMapIntensity,
      envMap: origin.envMap,
      lightMap: origin.lightMap,
      lightMapIntensity: origin.lightMapIntensity,
      transparent: origin.transparent,
      opacity: origin.opacity,
      alphaTest: origin.alphaTest,
      wireframe: origin.wireframe,
      wireframeLinewidth: origin.wireframeLinewidth,
      visible: origin.visible,
      side: origin.side,
      blending: origin.blending,
      depthTest: origin.depthTest,
      depthWrite: origin.depthWrite,
      fog: origin.fog,
      name: origin.name,
    })
  },
}
