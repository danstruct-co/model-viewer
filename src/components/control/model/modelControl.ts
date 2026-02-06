import { MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, type Mesh } from 'three'
import { ModelControlParams, type Axis, type MaterialType, type ModelControlOption } from './types'
import { effects, materials } from './mapper'
import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
import { getCoreModels } from '../utils'
import { availableEffects, effectKeys } from './data'

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
  private mirrorAxis: Axis = 'x'
  isFixed: boolean = false
  option?: ModelControlOption

  constructor({ scene, coreNodeFinder, materialType, option }: ModelControlParams) {
    this.scene = scene
    this.coreNodeFinder = coreNodeFinder
    this.models = getCoreModels(scene, this.coreNodeFinder)
    this.models.forEach(({ uuid }) => (this.originMaterials[uuid] = {}))
    this.materialType = materialType
    option?.mirrorAxis && (this.mirrorAxis = option?.mirrorAxis)
    this.option = option

    this.changeModel(this.currentModelIndex)

    option?.defaultMirrorMode && this.mirror()
    this.isFixed = !!option?.defaultFixed
    option?.defaultScale && this.setScale(option.defaultScale)
  }

  setScale({ x, y, z }: Vector3) {
    this.scene.scale.set(x, y, z)
  }

  mirror() {
    switch (this.mirrorAxis) {
      case 'x':
        this.scene.scale.setX(-this.scene.scale.x)
        break

      case 'y':
        this.scene.scale.setY(-this.scene.scale.y)
        break

      case 'z':
        this.scene.scale.setZ(-this.scene.scale.z)
    }

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

  changeMaterial(materialType: MaterialType) {
    this.materialType = materialType
    this.initialNodes()
  }

  changeModel(index: number) {
    if (index >= this.models.length) {
      return
    }

    this.model = this.models[index]
    this.coreNode = this.coreNodeFinder.find(this.model)
    this.currentModelIndex = index

    this.initialNodes()
  }

  private initialNodes() {
    this.scene.traverse((node) => {
      this.initialNode(node)
    })
  }

  private initialNode(node: Object3D) {
    node.castShadow = true
    node.frustumCulled = false

    const mesh = node as Mesh
    if (!mesh.isMesh || effectKeys.some((key) => mesh.userData[key])) {
      return
    }

    const model = this.findModel((mesh as SkinnedMesh).skeleton?.bones?.at(0) ?? mesh)
    if (!model) {
      this.applyMaterial(mesh, model)
      return
    }

    if (!this.originMaterials[model.uuid][mesh.uuid]) {
      this.originMaterials[model.uuid][mesh.uuid] = mesh.material as MeshStandardMaterial
    }

    this.applyMaterial(mesh, model)

    const materialType = this.materialType ?? 'DEFAULT'
    mesh.material = materials[materialType](this.originMaterials[model.uuid][mesh.uuid])
    if (!this.option?.opaqueOtherModel) {
      mesh.material = this.model?.uuid === model.uuid ? mesh.material : materials.TRANSPARENT(mesh.material as MeshStandardMaterial)
    }

    availableEffects.forEach(({ remove }) => remove(mesh))
    effects[materialType].forEach(({ add }) => add(mesh, this.option?.materialOption))
  }

  private applyMaterial(mesh: Mesh, model: Object3D | undefined) {
    const materialType = this.materialType ?? 'DEFAULT'
    const originMaterial = model ? this.originMaterials[model.uuid][mesh.uuid] : (mesh.material as MeshStandardMaterial)

    mesh.material = materials[materialType](originMaterial)
    if (!this.option?.opaqueOtherModel) {
      mesh.material = this.model?.uuid === model?.uuid ? mesh.material : materials.TRANSPARENT(mesh.material as MeshStandardMaterial)
    }

    availableEffects.forEach(({ remove }) => remove(mesh))
    effects[materialType].forEach(({ add }) => add(mesh, this.option?.materialOption))
  }

  private findModel(object?: Object3D): Object3D | undefined {
    if (!object?.parent) {
      return undefined
    }

    const targetModel = this.models.find(({ uuid }) => uuid === object.parent?.uuid)
    return targetModel ?? this.findModel(object.parent)
  }

  updateOnFrame() {
    if (!this.isFixed) {
      return
    }

    this.fixPosition()
  }
}
