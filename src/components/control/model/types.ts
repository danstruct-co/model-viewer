import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
import { Group, Object3DEventMap, type Vector3 } from 'three'
import type { MaterialEffectOption } from './effect/types'

export type MaterialType = 'DEFAULT' | 'FABRIC' | 'METALIC' | 'TRANSPARENT' | 'CARTOON'

export type AdditionalEffectType = 'RIM_LIGHT' | 'OUTLINE'

export type MaterialOption = {} & MaterialEffectOption

export type ModelControlOption = {
  defaultMirrorMode?: boolean
  defaultFixed?: boolean
  defaultScale?: Vector3
  materialOption?: MaterialOption
  opaqueOtherModel?: boolean
}

export type ModelControlParams = {
  scene: Group<Object3DEventMap>
  coreNodeFinder: CoreNodeFinder
  materialType?: MaterialType
  option?: ModelControlOption
}
