import { MeshStandardMaterial, Object3D, Vector3, type Mesh } from 'three'
import { ModelControlParams, type MaterialType } from './types'
import { materials } from './mapper'
import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'

export default class ModelControl {
  scene: Object3D
  private coreNodeFinder: CoreNodeFinder
  models: Object3D[] = []
  model?: Object3D
  coreNode?: Object3D
  materialType?: MaterialType
  isMirror: boolean = false
  isFixed: boolean = false

  constructor({ scene, coreNodeFinder, materialType, option }: ModelControlParams) {
    this.scene = scene
    this.coreNodeFinder = coreNodeFinder
    this.models = scene.children.filter((child) => this.coreNodeFinder.find(child))
    this.materialType = materialType
    this.changeModel(0)

    if (option?.defaultMirrorMode) {
      this.mirror()
    }
    this.isFixed = !!option?.defaultFixed
  }

  mirror() {
    this.scene.scale.setX(-this.scene.scale.x)
    this.isMirror = !this.isMirror
  }

  changeModel(index: number) {
    if (index >= this.models.length) {
      return
    }

    this.model = this.models[index]
    this.coreNode = this.coreNodeFinder.find(this.model)

    this.initialNodes(index)
  }

  private initialNodes(currentModelIndex: number) {
    this.models.forEach((model, index) => {
      model.traverse((node) => {
        node.frustumCulled = false
        const mesh = node as Mesh
        if (!mesh.isMesh || !(mesh.material instanceof MeshStandardMaterial)) {
          return
        }
        const materialType = currentModelIndex === index ? this.materialType ?? 'DEFAULT' : 'TRANSPARENT'
        mesh.material = materials[materialType](mesh.material)
      })
    })
  }

  updateOnFrame() {
    if (!this.isFixed || !this.coreNode) {
      return
    }

    const worldPosition = new Vector3()
    this.coreNode.getWorldPosition(worldPosition)
    worldPosition.setX(0)
    worldPosition.setZ(0)

    const localPosition = this.coreNode.parent!.worldToLocal(worldPosition)

    const distance = new Vector3()
    distance.copy(localPosition)
    distance.sub(this.coreNode.position)

    this.coreNode.position.copy(localPosition)
    this.models.forEach((model) => {
      if (model.name !== this.model?.name) {
        this.coreNodeFinder.find(model)?.position?.add(distance)
      }
    })
  }
}
