import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
import { Group, Object3DEventMap } from 'three'

export type MaterialType = 'DEFAULT' | 'FABRIC' | 'METALIC' | 'TRANSPARENT'

export type ModelControlParams = {
  scene: Group<Object3DEventMap>
  coreNodeFinder: CoreNodeFinder
  materialType?: MaterialType
  option?: {
    defaultMirrorMode?: boolean
    defaultFixed?: boolean
  }
}
