import { Group, Object3D, Object3DEventMap } from 'three'

export type ModelControlParams = {
  scene: Group<Object3DEventMap>
  nodes: { [name: string]: Object3D<Object3DEventMap> }
  coreNode: Object3D
  option?: {
    defaultMirrorMode?: boolean
    defaultFixed?: boolean
  }
}
