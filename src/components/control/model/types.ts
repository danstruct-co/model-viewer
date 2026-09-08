import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
import { Group, Object3DEventMap, type Camera, type Vector3 } from 'three'
import type { MaterialEffectOption } from './effect/types'
import type { SkeletonBoneFilter } from './customSkeletonHelper'

export type MaterialType = 'DEFAULT' | 'FABRIC' | 'METALIC' | 'TRANSPARENT' | 'CARTOON'

export type AdditionalEffectType = 'RIM_LIGHT' | 'OUTLINE'

export type MaterialOption = {} & MaterialEffectOption

export type Axis = 'x' | 'y' | 'z'

export type ModelControlOption = {
  defaultMirrorMode?: boolean
  defaultFixed?: boolean
  defaultSkeletonHelper?: boolean
  defaultScale?: Vector3
  materialOption?: MaterialOption
  opaqueOtherModel?: boolean
  mirrorAxis?: Axis
  autoFit?: boolean
  /** 스켈레톤 헬퍼 표시 본 필터 (body 구+라인 / fingers 라인만) — 미지정 시 전체 본 표시 */
  skeletonFilter?: SkeletonBoneFilter
}

export type ModelControlParams = {
  scene: Group<Object3DEventMap>
  coreNodeFinder: CoreNodeFinder
  materialType?: MaterialType
  option?: ModelControlOption
}
