import { MeshStandardMaterial, Color, type Material } from 'three'
import type { MaterialType } from './types'
import ToonGradientMap from '../../object/texture/toonGradientMap'
import type { Effect } from './effect/types'
import outlineEffect from './effect/outlineEffect'
import rimLightEffect from './effect/rimLightEffect'
import { SaturatedToonMaterial } from './SaturatedToonMaterial'

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
    return new SaturatedToonMaterial({
      color: new Color(1.1, 1.1, 1.1),
      emissive: new Color(0.1, 0.1, 0.1),
      emissiveIntensity: 0.3,
      map: origin.map,
      gradientMap: new ToonGradientMap(),
      alphaMap: origin.alphaMap,
      aoMap: origin.aoMap,
      aoMapIntensity: origin.aoMapIntensity,
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
      vertexColors: false,
    })
  },
}

export const effects: Record<MaterialType, Effect[]> = {
  DEFAULT: [],
  FABRIC: [],
  METALIC: [],
  TRANSPARENT: [],
  CARTOON: [rimLightEffect, outlineEffect],
}
