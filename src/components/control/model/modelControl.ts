import { Box3, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, type Mesh } from 'three'
import CustomSkeletonHelper, {
  holdRootEdit,
  type SkeletonBoneFilter,
  type SkeletonGizmoMode,
  type SkeletonGizmoSpace,
  type SkeletonPositionTarget,
} from './customSkeletonHelper'
import type { GizmoHandle } from './screenGizmo'
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
  private skeletonFootLock = false
  /** 관절 피킹(호버/클릭/기즈모 드래그) 허용 — 스튜디오 모션 편집 모드 게이트 (종원 2026-09-09).
   *  기본 true: onJointPick 을 넘기는 소비자(스튜디오)가 모드에 맞춰 직접 토글한다 */
  skeletonPickEnabled = true
  private isSkeletonHelper: boolean = false
  private skeletonHighlightName: string | null = null
  /** 관절 편집 기즈모 모드 (종원 2026-09-14) — move = 축 드래그 IK / rotate = 구 회전 기즈모. 헬퍼 토글 재생성에도 유지 */
  private skeletonGizmoMode: SkeletonGizmoMode = 'move'
  /** 기즈모 좌표계 (종원 2026-10-01) — world/local. 헬퍼 토글 재생성에도 유지 */
  private skeletonGizmoSpace: SkeletonGizmoSpace = 'world'
  /** 루트 편집 (종원 2026-09-15) — 켜면 루트 기즈모(관절 피킹 게이트와 별개). 헬퍼 토글 재생성에도 유지 */
  private rootEditing = false
  /** 캐릭터 루트 노드 — 헬퍼가 찾은 것을 보관해 헬퍼가 꺼져도 루트 편집 값을 유지(holdRootEdit) (종원 2026-09-15) */
  private rootNode?: Object3D
  /** 위치 편집 대상 (종원 2026-09-15) — 원점/캐릭터. 헬퍼 토글 재생성에도 유지 */
  private positionTarget: SkeletonPositionTarget = 'origin'
  /** hips 노드 이름 — 위치 편집 캐릭터 오프셋을 굽는 트랙 대상. 헬퍼가 찾은 것을 보관 */
  private hipsName?: string

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
    this.rootNode = this.skeletonHelper.getRootNode()
    this.hipsName = this.skeletonHelper.getHipsNode()?.name
    // SkeletonHelper는 내부적으로 this.matrix = root.matrixWorld를 참조하므로
    // root의 자식이 아닌 부모 씬에 추가해야 트랜스폼 이중 적용을 방지
    const parentScene = this.scene.parent ?? this.scene
    parentScene.add(this.skeletonHelper)
    this.isSkeletonHelper = true
    this.skeletonHelper.setGizmoMode(this.skeletonGizmoMode) // 하이라이트보다 먼저 — 선택 관절 기즈모가 모드에 맞게 뜬다
    this.skeletonHelper.setGizmoSpace(this.skeletonGizmoSpace)
    this.skeletonHelper.setPositionTarget(this.positionTarget)
    this.skeletonHelper.setRootEditing(this.rootEditing)
    // 토글 재생성에도 선택 하이라이트 유지 (종원 2026-09-08 릭 선택 연동)
    if (this.skeletonHighlightName) this.skeletonHelper.setHighlightBone(this.skeletonHighlightName)
    if (this.skeletonIKRootName) this.skeletonHelper.setIKRoot(this.skeletonIKRootName)
    this.skeletonHelper.setFootLock(this.skeletonFootLock)
    // 관절 구는 모션 편집(피킹) 모드에서만 — 패널 스켈레톤 토글만 켠 상태는 본만 (종원 2026-09-10)
    this.skeletonHelper.setJointsVisible(this.skeletonPickEnabled)
  }

  /** 스켈레톤 필터 갱신 (종원 2026-09-10) — option 은 ModelViewer mount 시 1회 캡처라
   *  업로드 캐릭터 config(hips 잠금·MMD 예외·손가락색)가 T포즈 선마운트로 stale 되던 문제.
   *  prop 변경 시 이 메서드로 동기화하고 활성 헬퍼는 재생성(잠금·필터 즉시 반영, 하이라이트 유지) */
  setSkeletonFilter(filter?: SkeletonBoneFilter) {
    if (!this.option) this.option = {}
    this.option.skeletonFilter = filter
    if (this.isSkeletonHelper) this.setSkeletonHelperActive(true) // removeSkeletonHelper 내장 → 재생성
  }

  /** IK 루트 지정 (종원 2026-09-09) — null = 기본(hips 직전까지 전체 체인) */
  setSkeletonIKRoot(name: string | null) {
    this.skeletonIKRootName = name
    this.skeletonHelper?.setIKRoot(name)
  }

  /** 발 고정 (종원 2026-10-01) — 켜면 IK·회전·hips 이동 드래그 동안 발(필터 feet)의 월드 위치·방향 유지. 헬퍼를 다시 만들어도 이어진다 */
  setSkeletonFootLock(on: boolean) {
    this.skeletonFootLock = on
    this.skeletonHelper?.setFootLock(on)
  }

  /** 현재 선택 본의 IK 루트 후보(직계 부모 → hips 직전, 원 본명) — 조상 선택 UI 용 */
  getSkeletonIKAncestors(): string[] {
    return this.skeletonHelper?.getIKAncestorNames() ?? []
  }

  /** 편집 잠금 관절 원 본명(hips 직속 body 자식 — hips 자체는 편집 가능, 2026-09-15) — 릭 선택 UI 회색 표시·클릭 차단용 (종원 2026-09-09) */
  getSkeletonIKLockedNames(): string[] {
    return this.skeletonHelper?.getLockedJointNames() ?? []
  }

  /** IK 홀드(드래그 편집) 활성 여부 — 씬 포즈 = 편집 포즈. knot 워핑 적용 가드 (종원 2026-09-09) */
  hasSkeletonIKHold(): boolean {
    return this.skeletonHelper?.hasIKHold() ?? false
  }

  /** 관절 피킹 게이트 (종원 2026-09-09 모션 편집 모드) — 끄면 호버 잔상도 정리 */
  setSkeletonPickEnabled(enabled: boolean) {
    this.skeletonPickEnabled = enabled
    this.skeletonHelper?.setJointsVisible(enabled) // 관절 구 표시 = 편집 모드 (종원 2026-09-10)
    if (!enabled) {
      this.skeletonHelper?.setJointHover(null)
      this.skeletonHelper?.setGizmoHover(null)
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

  // ---- 관절 기즈모 — 이동 화살표·가운데 흰 원 / 회전 링·트랙볼, 화면 px 조작 공통 (종원 2026-09-15) ----
  /** 위치(move)/회전(rotate) 전환 — 편집 포즈는 유지, 회전이면 IK 체인 표시 끔 (종원 2026-09-14) */
  setSkeletonGizmoMode(mode: SkeletonGizmoMode) {
    this.skeletonGizmoMode = mode
    this.skeletonHelper?.setGizmoMode(mode)
  }

  /** 기즈모 좌표계 — world = 월드 축 / local = 선택 관절(위치 편집 중엔 대상 노드) 로컬 축 (종원 2026-10-01, 위치 편집 2026-10-06) */
  setSkeletonGizmoSpace(space: SkeletonGizmoSpace) {
    this.skeletonGizmoSpace = space
    this.skeletonHelper?.setGizmoSpace(space)
  }

  /** 기즈모 핸들 피킹 — pointer·viewport 는 캔버스 기준 px */
  pickSkeletonGizmoHandle(
    raycaster: import('three').Raycaster,
    pointer: import('three').Vector2,
    viewport: import('three').Vector2
  ) {
    return this.skeletonHelper?.pickGizmoHandle(raycaster, pointer, viewport) ?? null
  }

  setSkeletonGizmoHover(handle: GizmoHandle | null) {
    this.skeletonHelper?.setGizmoHover(handle)
  }

  beginSkeletonGizmoDrag(
    handle: GizmoHandle,
    raycaster: import('three').Raycaster,
    pointer: import('three').Vector2,
    viewport: import('three').Vector2
  ) {
    return this.skeletonHelper?.beginGizmoDrag(handle, raycaster, pointer, viewport) ?? false
  }

  /** 드래그 중 — 이동은 IK 타겟(설정된 동안 매 프레임 CCD 홀드), 회전은 선택 관절 회전 */
  dragSkeletonGizmo(raycaster: import('three').Raycaster, pointer: import('three').Vector2) {
    this.skeletonHelper?.dragGizmo(raycaster, pointer)
  }

  /** 드래그 끝 — 이동은 저장 타겟을 실제 도달 위치로 클램프 (제약으로 못 간 raw 타겟 잔존 방지, 종원 2026-09-10) */
  endSkeletonGizmoDrag() {
    this.skeletonHelper?.endGizmoDrag()
  }

  // ---- 루트 편집 (종원 2026-09-15) ----
  get skeletonRootEditing() {
    return this.rootEditing
  }

  /** 캐릭터 루트 노드(헬퍼가 한 번이라도 찾았으면) — 포즈 편집 캡처에서 루트 트랙 제외용 */
  get skeletonRootNode() {
    return this.rootNode
  }

  /** 위치 편집 대상 (종원 2026-09-15) — 원점(리그 루트 노드) / 캐릭터(hips) */
  get skeletonPositionTarget() {
    return this.positionTarget
  }

  setSkeletonPositionTarget(target: SkeletonPositionTarget) {
    this.positionTarget = target
    this.skeletonHelper?.setPositionTarget(target)
  }

  /** hips 노드 이름(헬퍼가 한 번이라도 찾았으면) — 위치 편집 캐릭터 오프셋 트랙 대상 */
  get skeletonHipsName() {
    return this.hipsName
  }

  /** 루트 편집 켜기/끄기 — 켜면 캐릭터 루트에 분홍 구 + 위치/회전 기즈모(모드는 setSkeletonGizmoMode) */
  setSkeletonRootEditing(on: boolean) {
    this.rootEditing = on
    this.skeletonHelper?.setRootEditing(on)
  }

  /** 캐릭터 루트 노드 로컬 트랜스폼(위치·오일러 XYZ 도·경로) — 헬퍼가 꺼져 있으면 null */
  getSkeletonRootTransform() {
    return this.skeletonHelper?.getRootTransform() ?? null
  }

  setSkeletonRootTransform(position: [number, number, number], rotation: [number, number, number]) {
    this.skeletonHelper?.setRootTransform(position, rotation)
  }

  /** 루트 트랜스폼 초기화 — 처음 로드한 값으로 (종원 2026-09-15) */
  resetSkeletonRootTransform() {
    this.skeletonHelper?.resetRootTransform()
  }

  getSkeletonTargetWorldPosition(out: import('three').Vector3) {
    return this.skeletonHelper?.getTargetWorldPosition(out) ?? null
  }

  /** IK 타겟 해제 — 재생 재개 시 등. 포즈는 mixer 원 포즈로 복귀 */
  clearSkeletonIK() {
    this.skeletonHelper?.clearTarget()
  }

  /** IK 홀드 일시중단 토글 — 편집 범위 프레임 선택 중 커밋 포즈 프리뷰용 (종원 2026-09-10) */
  suspendSkeletonIK(suspended: boolean) {
    this.skeletonHelper?.suspendIK(suspended)
  }

  /** 클립 교체 뒤 IK 기준 포즈 다시 잡기 — 교체 직후 믹서가 새 클립 포즈를 쓴 다음 솔브에서 캡처 (종원 2026-09-14) */
  requestSkeletonIKRebase() {
    this.skeletonHelper?.requestIKRebase()
  }

  /** 드래그 끝 포즈 굳히기 — 이후 솔브 없이 유지, 굳힌 포즈 사본 반환(IK 없으면 null). 기즈모 조작 단계 저장용 (종원 2026-09-14) */
  freezeSkeletonIKPose() {
    return this.skeletonHelper?.freezeIKPose() ?? null
  }

  /** 저장한 단계 포즈로 즉시 복원(다시 풀지 않음, 드래그 타겟은 내려놓음) — 기즈모 되돌리기/다시하기 (종원 2026-09-14) */
  holdSkeletonIKPose(pose: Float64Array) {
    this.skeletonHelper?.holdIKPose(pose)
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
    // 루트 편집 유지 (종원 2026-09-15) — 믹서가 루트 트랙 값으로 되돌렸으면 편집 값을 다시. IK 가 루트 행렬을 읽으니 IK 홀드보다 먼저
    holdRootEdit(this.rootNode)
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
