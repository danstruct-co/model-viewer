import { MeshStandardMaterial, Object3D, Vector3, type Mesh } from 'three'
import { ModelControlParams, type MaterialType } from './types'
import { materials } from './mapper'
import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
import { getCoreModels } from '../utils'

export default class ModelControl {
  scene: Object3D
  private coreNodeFinder: CoreNodeFinder
  models: Object3D[] = []
  model?: Object3D
  coreNode?: Object3D
  materialType?: MaterialType
  private originMaterials: Record<string, Record<string, MeshStandardMaterial>> = {}
  private currentModelIndex: number = 0
  isMirror: boolean = false
  isFixed: boolean = false

  constructor({ scene, coreNodeFinder, materialType, option }: ModelControlParams) {
    this.scene = scene
    this.coreNodeFinder = coreNodeFinder
    this.models = getCoreModels(scene.children, this.coreNodeFinder)
    this.models.forEach(({ uuid }) => (this.originMaterials[uuid] = {}))
    this.materialType = materialType
    this.changeModel(this.currentModelIndex)

    option?.defaultMirrorMode && this.mirror()
    this.isFixed = !!option?.defaultFixed
    option?.defaultScale && this.setScale(option.defaultScale)
  }

  setScale({ x, y, z }: Vector3) {
    this.scene.scale.set(x, y, z)
  }

  mirror() {
    this.scene.scale.setX(-this.scene.scale.x)
    this.isMirror = !this.isMirror
  }

  private fixCoreNode(coreNode: Object3D) {
    const worldPosition = new Vector3()
    coreNode.getWorldPosition(worldPosition)
    worldPosition.setX(0)
    worldPosition.setZ(0)

    const localPosition = coreNode.parent!.worldToLocal(worldPosition)

    const distance = new Vector3()
    distance.copy(localPosition)
    distance.sub(coreNode.position)

    coreNode.position.copy(localPosition)
    return distance
  }

  private fixPosition() {
    if (!this.coreNode) {
      return
    }

    this.coreNodeFinder.findAll(this.model!).forEach((coreNode) => {
      if (coreNode.name !== this.coreNode?.name) {
        this.fixCoreNode(coreNode)
      }
    })

    const distance = this.fixCoreNode(this.coreNode)

    this.models.forEach((model) => {
      if (model.name !== this.model?.name) {
        this.coreNodeFinder.find(model)?.position?.add(distance)
      }
    })
  }

  changeModel(index: number) {
    if (index >= this.models.length) {
      return
    }

    this.model = this.models[index]
    this.coreNode = this.coreNodeFinder.find(this.model)

    this.initialNodes(index)
  }

  changeMaterial(materialType: MaterialType) {
    this.materialType = materialType
    this.initialNodes(this.currentModelIndex)
  }

  private initialNodes(currentModelIndex: number) {
    this.currentModelIndex = currentModelIndex
    this.models.forEach((model, index) => {
      model.traverse((node) => {
        node.frustumCulled = false
        const mesh = node as Mesh
        if (!mesh.isMesh || (!(mesh.material instanceof MeshStandardMaterial) && !this.originMaterials[model.uuid][mesh.uuid])) {
          return
        }

        if (!this.originMaterials[model.uuid][mesh.uuid]) {
          this.originMaterials[model.uuid][mesh.uuid] = mesh.material as MeshStandardMaterial
        }

        const materialType = currentModelIndex === index ? this.materialType ?? 'DEFAULT' : 'TRANSPARENT'
        mesh.material = materials[materialType](this.originMaterials[model.uuid][mesh.uuid])
      })
    })
  }

  updateOnFrame() {
    if (!this.isFixed) {
      return
    }

    this.fixPosition()
  }
}
