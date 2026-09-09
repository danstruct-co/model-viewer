import { Box3, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, type Mesh } from 'three'
import CustomSkeletonHelper from './customSkeletonHelper'
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
  private modelRadii: Record<string, number> = {}
  private autoFitPending: boolean = false
  private skeletonHelper?: CustomSkeletonHelper
  /** 지정 IK 루트 본명 (종원 2026-09-09) — 헬퍼 토글 재생성에도 유지 */
  private skeletonIKRootName: string | null = null
  /** 관절 피킹(호버/클릭/기즈모 드래그) 허용 — 스튜디오 모션 편집 모드 게이트 (종원 2026-09-09).
   *  기본 true: onJointPick 을 넘기는 소비자(스튜디오)가 모드에 맞춰 직접 토글한다 */
  skeletonPickEnabled = true
  private isSkeletonHelper: boolean = false
  private skeletonHighlightName: string | null = null

  constructor({ scene, coreNodeFinder, materialType, option }: ModelControlParams) {
    this.scene = scene
    this.coreNodeFinder = coreNodeFinder
    this.models = getCoreModels(scene, this.coreNodeFinder)
    this.models.forEach(({ uuid }) => (this.originMaterials[uuid] = {}))
    this.modelRadii = this.computeModelRadii()
    this.materialType = materialType
    option?.mirrorAxis && (this.mirrorAxis = option?.mirrorAxis)
    this.option = option

    this.changeModel(this.currentModelIndex)

    option?.defaultMirrorMode && this.mirror()
    this.isFixed = !!option?.defaultFixed

    if (option?.autoFit && !option?.defaultScale) {
      this.autoFitPending = true
    }
    option?.defaultScale && this.setScale(option.defaultScale)
    option?.defaultSkeletonHelper && this.setSkeletonHelperActive(true)
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

  private computeModelRadii(): Record<string, number> {
    const radii: Record<string, number> = {}
    this.models.forEach(({ uuid }) => (radii[uuid] = 0))

    this.scene.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh || !mesh.geometry) return

      const model = this.findModel((mesh as SkinnedMesh).skeleton?.bones?.at(0) ?? mesh)
      if (!model) return

      mesh.geometry.computeBoundingSphere()
      const radius = mesh.geometry.boundingSphere?.radius ?? 0
      if (radius > radii[model.uuid]) radii[model.uuid] = radius
    })

    return radii
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

    const modelRadius = model ? this.modelRadii[model.uuid] : undefined
    const effectOption = { ...this.option?.materialOption, modelRadius }
    availableEffects.forEach(({ remove }) => remove(mesh))
    effects[materialType].forEach(({ add }) => add(mesh, effectOption))
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

  private computeGeometryBoundingBox(): Box3 {
    this.scene.updateMatrixWorld(true)
    const box = new Box3()
    this.scene.traverse((node) => {
      const mesh = node as Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox()
      }
      const meshBox = mesh.geometry.boundingBox!.clone()
      meshBox.applyMatrix4(mesh.matrixWorld)
      box.union(meshBox)
    })
    return box
  }

  get skeletonHelperActive() {
    return this.isSkeletonHelper
  }

  setSkeletonHelperActive(isActive: boolean) {
    this.removeSkeletonHelper()
    if (!isActive) return

    this.skeletonHelper = new CustomSkeletonHelper(this.scene, this.option?.skeletonFilter)
    // SkeletonHelper는 내부적으로 this.matrix = root.matrixWorld를 참조하므로
    // root의 자식이 아닌 부모 씬에 추가해야 트랜스폼 이중 적용을 방지
    const parentScene = this.scene.parent ?? this.scene
    parentScene.add(this.skeletonHelper)
    this.isSkeletonHelper = true
    // 토글 재생성에도 선택 하이라이트 유지 (종원 2026-09-08 릭 선택 연동)
    if (this.skeletonHighlightName) this.skeletonHelper.setHighlightBone(this.skeletonHighlightName)
    if (this.skeletonIKRootName) this.skeletonHelper.setIKRoot(this.skeletonIKRootName)
  }

  /** IK 루트 지정 (종원 2026-09-09) — null = 기본(hips 직전까지 전체 체인) */
  setSkeletonIKRoot(name: string | null) {
    this.skeletonIKRootName = name
    this.skeletonHelper?.setIKRoot(name)
  }

  /** 현재 선택 본의 IK 루트 후보(직계 부모 → hips 직전, 원 본명) — 조상 선택 UI 용 */
  getSkeletonIKAncestors(): string[] {
    return this.skeletonHelper?.getIKAncestorNames() ?? []
  }

  /** 관절 피킹 게이트 (종원 2026-09-09 모션 편집 모드) — 끄면 호버 잔상도 정리 */
  setSkeletonPickEnabled(enabled: boolean) {
    this.skeletonPickEnabled = enabled
    if (!enabled) {
      this.skeletonHelper?.setJointHover(null)
      this.skeletonHelper?.setAxisHover(null)
    }
  }

  /** 관절 하이라이트 (릭 선택 UI 연동, 종원 2026-09-08) — 헬퍼가 꺼져 있으면 이름만 보관 */
  setSkeletonHighlight(name: string | null) {
    this.skeletonHighlightName = name
    this.skeletonHelper?.setHighlightBone(name)
  }

  /** 관절 구 피킹 (헬퍼 켜진 동안만 유효) — 뷰어 포인터 이벤트 소비자용 (2026-09-08) */
  pickSkeletonJoint(raycaster: import('three').Raycaster) {
    return this.skeletonHelper?.pickJoint(raycaster) ?? null
  }

  setSkeletonJointHover(index: number | null) {
    this.skeletonHelper?.setJointHover(index)
  }

  // ---- IK 타겟 축 기즈모 (2026-09-08 축 드래그) ----
  pickSkeletonGizmoAxis(raycaster: import('three').Raycaster) {
    return this.skeletonHelper?.pickGizmoAxis(raycaster) ?? null
  }

  setSkeletonAxisHover(axisIndex: number | null) {
    this.skeletonHelper?.setAxisHover(axisIndex)
  }

  getSkeletonTargetWorldPosition(out: import('three').Vector3) {
    return this.skeletonHelper?.getTargetWorldPosition(out) ?? null
  }

  /** IK 타겟 설정(월드 절대) — 설정된 동안 매 프레임 CCD 홀드 (updateOnFrame) */
  setSkeletonTargetWorld(target: import('three').Vector3) {
    this.skeletonHelper?.setTargetWorld(target)
  }

  /** IK 타겟 해제 — 재생 재개 시 등. 포즈는 mixer 원 포즈로 복귀 */
  clearSkeletonIK() {
    this.skeletonHelper?.clearTarget()
  }

  private removeSkeletonHelper() {
    if (this.skeletonHelper) {
      this.skeletonHelper.parent?.remove(this.skeletonHelper)
      this.skeletonHelper.geometry.dispose()
      this.skeletonHelper.dispose() // 필터 모드 관절 구 리소스
      this.skeletonHelper = undefined
    }
    this.isSkeletonHelper = false
  }

  updateOnFrame() {
    // IK 홀드 (2026-09-08): mixer 가 이 프레임의 원 포즈를 이미 적용한 뒤 실행된다
    // (useAnimations 의 useFrame 이 먼저 등록) — 타겟이 있는 동안 매 프레임 CCD 재적용
    this.skeletonHelper?.updateIKHold()
    if (this.autoFitPending) {
      this.autoFitPending = false
      const box = this.computeGeometryBoundingBox()
      const size = new Vector3()
      box.getSize(size)
      const targetHeight = 1.64
      if (size.y > 0) {
        const scaleFactor = targetHeight / size.y
        const current = this.scene.scale.x
        const newScale = current * scaleFactor
        this.setScale(new Vector3(newScale, newScale, newScale))
      }
    }

    if (!this.isFixed) {
      return
    }

    this.fixPosition()
  }
}
