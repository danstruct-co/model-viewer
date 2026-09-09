import {
  Bone,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PropertyBinding,
  Quaternion,
  SkeletonHelper,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
} from 'three'

const _vector = new Vector3()
const _head = new Vector3()
const _tail = new Vector3()
const _dir = new Vector3()
const _refAxis = new Vector3()
const _basisX = new Vector3()
const _basisZ = new Vector3()
const _boneScale = new Vector3()
const _scale = new Vector3()
const _quat = new Quaternion()
const _rotMatrix = new Matrix4()
const _boneMatrix = new Matrix4()
const _parentMatrix = new Matrix4()
const _instanceMatrix = new Matrix4()
const _matrixWorldInv = new Matrix4()

// 관절 구 표시 (종원 2026-09-08 확정): config body 본에만 초록 구 — 미매핑 본은 그리지 않음
const JOINT_RADIUS = 0.012 // 월드 m — 루트 스케일(autoFit 등) 역보정으로 상수 크기 유지
const JOINT_COLOR = new Color(0x22cc44)
// 선택 관절 하이라이트 (종원 2026-09-08 확정): 월드 정렬 XYZ 축 기즈모 — 단색 실린더,
// 호버 시 끝에 원뿔이 붙은 화살표, 좌드래그 = 해당 월드 축으로 IK 타겟 이동.
// (그라데이션 라인·빨간 halo 구 버전은 철회, git 이력 참조)
// 색 = 순수 RGB(쨍하게), 두께 = 관절 구 지름의 2/3.
// ※ 재질은 transparent 큐에 넣어야 한다 — opaque 면 three 가 먼저 그려서 transparent 인
//   본/구가 위를 덮는다(종원 "기즈모가 뒤에 그려지는 느낌" 실측 원인)
const HIGHLIGHT_AXES_RATIO = 6.0 // 축 길이 = JOINT_RADIUS × 6
const AXES_THICKNESS = (JOINT_RADIUS * 2 * 2) / 3 // 실린더 지름 (m)
const AXIS_COLORS = [0xff0000, 0x00ff00, 0x0000ff] // X, Y, Z — 순수 RGB (종원 2026-09-08)
const JOINT_HOVER_SCALE = 2.0 // 관절 호버 확대 배율 (피킹 옵트인)

// ---- CCD IK (three CCDIKSolver 와 동일한 로컬 공간 방식 — 블렌더 Auto-IK 계열) ----
// 체인 룰 (종원 2026-09-09 최종): 선택 관절 = IK 이펙터 — **선택한 관절 자체가 기즈모를
// 따라 움직인다**. 회전은 선택 관절의 부모부터 루트까지(루트 포함, 제자리 회전 —
// 루트 관절 위치는 불변). **hips 는 회전·이동 절대 불가** — 체인·루트 후보 상한 =
// hips 직전("손 움직였을 때 다리 움직이는 게 싫다" — 팔/상체 편집은 하체 불가침).
// hips 와 hips 직속 관절(spine1·허벅지)은 **선택 자체를 잠근다**(호버·클릭·기즈모 전부
// 차단, 종원 최종): 위치는 hips 회전 없이 원리적으로 못 움직이고, 그 회전이 상·하체를
// 커플링하기 때문. (FK 회전 모드로 지원했다 폐기 — 복원은 ff6ae2e 참고)
// 지정 루트(가슴 등)의 다른 자식 서브트리(목→머리·반대팔)는 **말단 IK 핀**으로 보호:
// 리지드 프리즈는 본 로컬 위치가 바뀌어 스키닝이 찢어지므로(9/9 실증), 붙은 채 순수
// 회전만으로 말단을 원위치 — 중간 관절이 자연스럽게 굽어 흡수(Cascadeur 핀 계열).
// 미매핑 중간 본은 스켈레톤 직결 표시 철학과 동일하게 CCD 대상에서도 생략.
// mixer 가 매 프레임 원 포즈를 재적용하므로 홀드는 "원 포즈 → CCD" 를 매 프레임 반복 —
// 결과가 프레임 간 일관돼 지터 없음
const IK_ITERATIONS = 8
const _ikInvJoint = new Matrix4()
const _ikEffLocal = new Vector3()
const _ikTgtLocal = new Vector3()
const _ikQuat = new Quaternion()
const _reachA = new Vector3()
const _reachB = new Vector3()
const _pinPos = new Vector3()
const _pinQuat = new Quaternion()
const _pinScale = new Vector3()
// IK 체인 시각화 (종원 2026-09-09): 루트~엔드 체인(구·링크) = 노랑 계열로 구분
const IK_CHAIN_JOINT_COLOR = new Color(0xffcc00)
const IK_CHAIN_BONE_COLOR = new Color(0xffaa00)

/** 단위 XYZ 축(+방향 실린더 3개, 길이 1) + 호버용 원뿔(화살촉, 기본 숨김) */
function createAxesGizmo() {
  const group = new Group()
  const radius = AXES_THICKNESS / 2 / (JOINT_RADIUS * HIGHLIGHT_AXES_RATIO) // 단위 길이 기준 반지름
  const shaft = new CylinderGeometry(radius, radius, 1, 8)
  shaft.translate(0, 0.5, 0) // 원점 → +방향
  const cone = new ConeGeometry(radius * 2.4, radius * 7, 10)
  cone.translate(0, 1 + radius * 3.5, 0) // 실린더 끝에 화살촉 (원통 길이는 유지)
  const rotations: [number, number, number][] = [
    [0, 0, -Math.PI / 2], // X (+Y 실린더를 +X 로)
    [0, 0, 0], // Y
    [Math.PI / 2, 0, 0], // Z
  ]
  rotations.forEach((rot, i) => {
    const material = new MeshBasicMaterial({
      color: AXIS_COLORS[i],
      depthTest: false,
      depthWrite: false,
      transparent: true, // transparent 큐 강제 — 본/구 위에 렌더
      toneMapped: false,
    })
    const axis = new Group()
    const shaftMesh = new Mesh(shaft, material)
    const coneMesh = new Mesh(cone, material)
    coneMesh.visible = false // 호버 시 화살표로
    shaftMesh.frustumCulled = coneMesh.frustumCulled = false
    axis.add(shaftMesh, coneMesh)
    axis.rotation.set(...rot)
    axis.userData.axisIndex = i
    group.add(axis)
  })
  return group
}
// 본 형태 = Blender 식 octahedral (사각뿔 2개 — 링이 헤드 쪽 10% 지점, 종원 2026-09-08).
// 굵기는 본 길이 비례. 색: 바디 = 파랑 / 손가락 = 주황 (Lambert 셰이딩으로 면 구분)
const BONE_RING_RATIO = 0.1
const BONE_WIDTH_RATIO = 0.1 // Blender 기본과 동일 (종원 2026-09-08)
const BODY_BONE_COLOR = new Color(0x3377dd)
const FINGER_BONE_COLOR = new Color(0xdd7722)

/** 단위 octahedral 본 (+Y 축, 헤드 0 → 테일 1, 링 y=0.1·반폭 1) — 인스턴스 스케일로 변형 */
function createOctahedralBoneGeometry() {
  const h = [0, 0, 0]
  const t = [0, 1, 0]
  const r = BONE_RING_RATIO
  const ring = [
    [1, r, 0],
    [0, r, 1],
    [-1, r, 0],
    [0, r, -1],
  ]
  const faces: number[][][] = []
  for (let i = 0; i < 4; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % 4]
    faces.push([h, b, a]) // 헤드 쪽 뿔
    faces.push([t, a, b]) // 테일 쪽 뿔
  }
  const positions = faces.flat(2)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals() // 비인덱스 — 면 단위 플랫 노멀
  return geometry
}

export type SkeletonBoneFilter = {
  body: string[]
  /** 손가락 본 — 라인만 다른 색으로 표시, 관절 구 없음 (종원 2026-09-08) */
  fingers?: string[]
  /** hips 본명 — IK 고정 베이스(체인이 절대 넘지 않는 경계, 종원 2026-09-09).
   *  미지정/미해석이면 경계 없이 body 조상 전체가 체인 후보 */
  hips?: string
}

/**
 * GLB 변환 과정에서 isBone 플래그가 사라진 노드를 복원한 뒤 SkeletonHelper를 생성하는 커스텀 클래스
 *
 * glTF 스펙에서는 Bone 타입이 없고, skin.joints에 참조된 노드만 Bone으로 인스턴스화됨.
 * SkinnedMesh가 없는 모델(애니메이션만 있는 경우)에서는 모든 본이 Object3D로 로드되어
 * SkeletonHelper가 빈 geometry를 생성하는 문제를 해결함.
 *
 * filter(옵션, 종원 2026-09-08): 지정 본만 그린다 — 각 본을 **최근접 허용 조상**과 직결
 * (미매핑 중간 본은 생략). 본 형태 = Blender 식 octahedral 메시(굵기 길이 비례),
 * body = 파랑 본 + 관절 초록 구 / fingers = 주황 본(구 없음).
 * (라인 버전·중간 본 경유+노랑 구 버전은 실험 후 종원 지시로 교체/철회 — 파일 이력 참조)
 */
export default class CustomSkeletonHelper extends SkeletonHelper {
  private filteredPairs?: [Bone, Bone][]
  private pairIsFinger?: boolean[]
  private jointMesh?: InstancedMesh
  private jointBones?: Bone[]
  private jointBoneSet?: Set<Object3D>
  private boneMesh?: InstancedMesh
  private highlightBone?: Bone
  private highlightGizmo?: Group
  private hoverIndex: number | null = null
  /** IK 고정 베이스 (config hips) — 체인이 절대 넘지 않는 경계이자 기본 루트 (종원 2026-09-09) */
  private hipsBone?: Bone
  /** 지정 IK 루트 — 체인의 최상위 회전 관절(포함, 제자리 회전). 미지정 = hips 직전 최상위 */
  private ikRootBone?: Bone
  /** 현재 선택 기준 IK 체인 (선택 관절의 부모부터 루트까지, 가까운 순) — refreshIKChain 갱신 */
  private ikChain: Bone[] = []
  /** 루트의 다른 자식 서브트리 핀 — 서브트리는 붙은 채(스키닝 보존), 말단 이펙터
   *  (발끝/손/머리)의 월드 위치·방향만 솔브마다 IK 로 원복. chain = 이펙터에서 가까운 순
   *  회전 관절(무릎 등이 자연 흡수), pos/quat = 프레임 캡처 버퍼 (종원 2026-09-09) */
  private ikPinned: { chain: Bone[]; effector: Bone; pos: Vector3; quat: Quaternion }[] = []
  /** 선택 잠금 관절 = hips + hips 직결 body 자식(spine1·허벅지) — 호버·클릭·기즈모 전부
   *  차단, 릭 UI 는 빨간 표시 (종원 2026-09-09 최종) */
  private lockedJointSet = new Set<Object3D>()
  private lockedJointNames: string[] = []
  /** IK 타겟 (월드 절대 좌표) — 축 드래그로 이동, 설정된 동안 매 프레임 CCD 로 포즈 홀드.
   *  본 위치 기준 오프셋이 아니라 절대값: IK 로 본이 움직여도 타겟은 고정 (종원 2026-09-08) */
  private targetWorld: Vector3 | null = null

  constructor(root: Object3D, filter?: SkeletonBoneFilter) {
    restoreBoneFlags(root)
    super(root)
    if (filter?.body?.length) {
      // GLTFLoader 는 노드명을 PropertyBinding.sanitizeNodeName 으로 정규화한다
      // ('腕.L'→'腕L' — 닷 제거 실측 2026-09-08). 필터명도 원문+정규화 양쪽으로 매칭.
      this.applyBoneFilter(toNameSet(filter.body), toNameSet(filter.fingers ?? []))
      if (filter.hips) {
        const hipsSet = toNameSet([filter.hips])
        this.hipsBone = this.bones.find((bone) => hipsSet.has(bone.name))
      }
      // 선택 잠금 = hips + 직결 body 자식 (종원 2026-09-09 — 편집 불가 관절)
      if (this.hipsBone && this.filteredPairs) {
        this.lockedJointSet.add(this.hipsBone)
        for (const [bone, parent] of this.filteredPairs) {
          if (parent === this.hipsBone) this.lockedJointSet.add(bone)
        }
        this.lockedJointNames = [...this.lockedJointSet].map((bone) => (bone as Bone).name)
      }
    }
  }

  /** 잠금 관절 원 본명 목록 — 릭 선택 UI 빨간 표시·클릭 차단용 */
  getLockedJointNames(): string[] {
    return this.lockedJointNames
  }

  /** IK 홀드 활성 여부 — 타겟이 설정돼 씬 포즈가 편집 포즈인 상태 (knot 워핑 베이크 가드용) */
  hasIKHold(): boolean {
    return !!this.targetWorld && this.ikChain.length > 0
  }

  private applyBoneFilter(bodySet: Set<string>, fingerSet: Set<string>) {
    const bodyBones = this.bones.filter((bone) => bodySet.has(bone.name))
    if (bodyBones.length === 0) return // 이름이 하나도 안 맞으면 전체 표시 유지 (필터 오폭 방지)
    const fingerBones = this.bones.filter((bone) => fingerSet.has(bone.name))
    const allowedSet = new Set<Object3D>([...bodyBones, ...fingerBones])
    const fingerBoneSet = new Set<Object3D>(fingerBones)

    // 세그먼트 = 허용 본 → 최근접 허용 조상 직결 (미매핑 중간 본은 그리지 않음).
    // 색 그룹은 자식 본 기준 — 손가락 루트→손목(body) 세그먼트도 손가락 색.
    const pairs: [Bone, Bone][] = []
    const pairIsFinger: boolean[] = []
    for (const bone of [...bodyBones, ...fingerBones]) {
      let parent: Object3D | null = bone.parent
      while (parent && !allowedSet.has(parent)) parent = parent.parent
      if (parent) {
        pairs.push([bone, parent as Bone])
        pairIsFinger.push(fingerBoneSet.has(bone))
      }
    }
    if (pairs.length === 0) return

    // 필터 모드는 본을 octahedral 메시로 그림 — 베이스 라인 지오메트리는 비운다
    this.geometry.dispose()
    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new Float32BufferAttribute([], 3))
    this.filteredPairs = pairs

    const bones = new InstancedMesh(
      createOctahedralBoneGeometry(),
      new MeshLambertMaterial({
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
        side: DoubleSide,
      }),
      pairs.length
    )
    for (let i = 0; i < pairs.length; i++) {
      bones.setColorAt(i, pairIsFinger[i] ? FINGER_BONE_COLOR : BODY_BONE_COLOR)
    }
    bones.frustumCulled = false
    bones.renderOrder = this.renderOrder + 1
    this.add(bones)
    this.boneMesh = bones
    this.pairIsFinger = pairIsFinger

    // 관절 구 (InstancedMesh 1개) — body 매핑 본에만 (손가락은 구 없음).
    // 재질은 흰색 + 인스턴스 색으로 초록을 굽는다 — IK 체인 하이라이트(노랑)가 인스턴스
    // 색을 쓰는데, 재질 색이 초록이면 인스턴스 색과 곱해져 둘 다 오염되기 때문
    const joint = new InstancedMesh(
      new SphereGeometry(1, 10, 8),
      new MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
      bodyBones.length
    )
    for (let i = 0; i < bodyBones.length; i++) joint.setColorAt(i, JOINT_COLOR)
    joint.frustumCulled = false
    joint.renderOrder = this.renderOrder + 2 // 본 메시 위에 구 표시
    this.add(joint)
    this.jointMesh = joint
    this.jointBones = bodyBones
    this.jointBoneSet = new Set<Object3D>(bodyBones)
  }

  // ---- IK 체인 룰 (종원 2026-09-09) ----

  /** 엔드의 조상 walk — config body 본만, hips 도달 시 중단(**불포함** — hips 는 절대
   *  회전·선택 불가, 종원 최종). stopAtRoot=true 면 지정 루트까지 포함 후 중단(루트도
   *  회전) — CCD 체인용. false 면 hips 직전까지 전체 — 루트 후보 산출용 */
  private walkIKAncestors(endBone: Bone, stopAtRoot: boolean): Bone[] {
    const chain: Bone[] = []
    if (!this.jointBoneSet) return chain
    let p: Object3D | null = endBone.parent
    while (p && (p as Bone).isBone) {
      if (p === this.hipsBone) break
      if (this.jointBoneSet.has(p)) chain.push(p as Bone)
      if (stopAtRoot && p === this.ikRootBone) break
      p = p.parent
    }
    return chain
  }

  /** IK 루트 후보 — 직계 부모부터 hips **직전**까지 (엔드에서 가까운 순). hips 는 회전·
   *  이동 절대 불가(종원 최종 — 손 편집이 다리에 영향 주지 않게)라 후보에서 제외.
   *  루트 = 직계 부모면 그 부모 하나만 회전. hips 직속 관절(spine1·허벅지)은 조상이
   *  없어 빈 배열 = 드래그 불가 */
  getIKAncestorNames(): string[] {
    if (!this.highlightBone || this.highlightBone === this.hipsBone) return []
    return this.walkIKAncestors(this.highlightBone, false).map((bone) => bone.name)
  }

  /** IK 루트(고정 앵커) 지정 — null 이면 기본(hips 앵커 = hips 직전까지 전체 회전).
   *  조상이 아닌 이름은 무시(기본과 동일) */
  setIKRoot(name: string | null) {
    if (name) {
      const candidates = toNameSet([name])
      this.ikRootBone = this.bones.find((bone) => candidates.has(bone.name))
    } else {
      this.ikRootBone = undefined
    }
    this.refreshIKChain()
  }

  /** 체인 재수집 + 시각화 + 핀 대상 산출 (종원 2026-09-09).
   *  노랑 구 = 회전 관절(루트~선택). 링크는 고정 경계(기본 hips)→체인 톱 연결까지 노랑 —
   *  체인이 hips/경계부터 한 줄로 이어져 보이되 경계 구는 원색(안 움직임 표시).
   *  지정 루트의 다른 자식 서브트리는 ikPinned 로 수집 — 솔브마다 말단 IK 보정 대상 */
  private refreshIKChain() {
    this.ikChain =
      this.highlightBone && this.highlightBone !== this.hipsBone
        ? this.walkIKAncestors(this.highlightBone, true)
        : []
    // 루트의 다른 body 자식 서브트리마다 핀 구성: 단일 자식 경로의 말단(발끝/손/머리)을
    // 이펙터로, 그 위 관절들을 보정 체인으로 — 서브트리는 붙은 채 IK 로 말단만 원위치
    this.ikPinned = []
    const chainRoot = this.ikChain[this.ikChain.length - 1]
    if (chainRoot && this.highlightBone && this.filteredPairs && this.pairIsFinger) {
      const bodyChildren = (bone: Object3D): Bone[] => {
        const list: Bone[] = []
        for (let i = 0; i < this.filteredPairs!.length; i++) {
          if (!this.pairIsFinger![i] && this.filteredPairs![i][1] === bone) list.push(this.filteredPairs![i][0])
        }
        return list
      }
      // 루트에서 선택 관절로 가는 경로 쪽 직결 body 자식 — 핀 제외
      const pathChild = this.ikChain.length >= 2 ? this.ikChain[this.ikChain.length - 2] : this.highlightBone
      for (const c of bodyChildren(chainRoot)) {
        if (c === pathChild) continue
        const path = [c]
        let kids = bodyChildren(c)
        while (kids.length === 1) {
          path.push(kids[0])
          kids = bodyChildren(kids[0])
        }
        this.ikPinned.push({
          chain: path.slice(0, -1).reverse(), // 이펙터에서 가까운 순 (CCD 문법)
          effector: path[path.length - 1],
          pos: new Vector3(),
          quat: new Quaternion(),
        })
      }
    }
    if (!this.jointMesh || !this.jointBones) return
    const chainSet = new Set<Object3D>(this.ikChain)
    const moving = new Set<Object3D>(this.ikChain)
    if (this.highlightBone && this.ikChain.length > 0) moving.add(this.highlightBone) // 선택 관절 포함
    // 노랑 = 회전 체인 구간만 — 체인 톱 위(고정 경계 쪽) 링크는 원색 (종원 2026-09-09:
    // "루트를 left fore arm 으로 하면 left arm 세그먼트는 안 떠야")
    for (let i = 0; i < this.jointBones.length; i++) {
      this.jointMesh.setColorAt(i, moving.has(this.jointBones[i]) ? IK_CHAIN_JOINT_COLOR : JOINT_COLOR)
    }
    if (this.jointMesh.instanceColor) this.jointMesh.instanceColor.needsUpdate = true
    if (this.boneMesh && this.filteredPairs && this.pairIsFinger) {
      for (let i = 0; i < this.filteredPairs.length; i++) {
        const [bone, parent] = this.filteredPairs[i]
        const inChain = moving.has(bone) && chainSet.has(parent)
        this.boneMesh.setColorAt(
          i,
          inChain ? IK_CHAIN_BONE_COLOR : this.pairIsFinger[i] ? FINGER_BONE_COLOR : BODY_BONE_COLOR
        )
      }
      if (this.boneMesh.instanceColor) this.boneMesh.instanceColor.needsUpdate = true
    }
  }

  /** 타겟을 체인 도달 반경으로 클램프 — 한계 밖으로 드래그해도 기즈모가 더 안 나간다
   *  (종원 2026-09-08). 반경 = 체인 최상위 관절 기준 이펙터까지 링크 길이 합
   *  (×0.999 — 완전 신전 특이점 회피) */
  private clampTargetToReach(effectorBone: Bone, target: Vector3) {
    if (this.ikChain.length === 0) return
    const nodes = [...this.ikChain].reverse() // 최상위 회전 관절부터
    nodes.push(effectorBone)
    let reach = 0
    for (let i = 0; i + 1 < nodes.length; i++) {
      _reachA.setFromMatrixPosition(nodes[i].matrixWorld)
      _reachB.setFromMatrixPosition(nodes[i + 1].matrixWorld)
      reach += _reachA.distanceTo(_reachB)
    }
    _reachA.setFromMatrixPosition(nodes[0].matrixWorld) // 체인 루트 관절 (IK 로 위치 불변)
    _reachB.subVectors(target, _reachA)
    const maxDist = reach * 0.999
    if (_reachB.length() > maxDist) {
      target.copy(_reachB.normalize().multiplyScalar(maxDist).add(_reachA))
    }
  }

  /** CCD — chain 은 이펙터에서 가까운 순. 메인 체인·핀 보정 체인 공용 */
  private solveChain(chain: Bone[], effectorBone: Bone, targetWorld: Vector3) {
    for (let iter = 0; iter < IK_ITERATIONS; iter++) {
      for (const joint of chain) {
        // 관절 로컬 공간에서 이펙터→타겟 방향으로 회전 (three CCDIKSolver 문법)
        _ikInvJoint.copy(joint.matrixWorld).invert()
        _ikEffLocal.setFromMatrixPosition(effectorBone.matrixWorld).applyMatrix4(_ikInvJoint).normalize()
        _ikTgtLocal.copy(targetWorld).applyMatrix4(_ikInvJoint).normalize()
        if (_ikEffLocal.lengthSq() < 1e-10 || _ikTgtLocal.lengthSq() < 1e-10) continue
        _ikQuat.setFromUnitVectors(_ikEffLocal, _ikTgtLocal)
        joint.quaternion.multiply(_ikQuat)
        joint.updateMatrixWorld(true) // 서브트리(이펙터 포함) 즉시 갱신
      }
    }
  }

  /** 관절 구 레이캐스트 피킹 — 맞은 관절의 본명/인덱스 (2026-09-08 릭 선택 연동).
   *  잠금 관절(hips·직속)은 미스 처리 — 호버 확대·클릭 선택 차단 (종원 2026-09-09) */
  pickJoint(raycaster: import('three').Raycaster): { name: string; index: number } | null {
    if (!this.jointMesh || !this.jointBones) return null
    const hit = raycaster.intersectObject(this.jointMesh, false)[0]
    if (hit?.instanceId == null) return null
    if (this.lockedJointSet.has(this.jointBones[hit.instanceId])) return null
    return { name: this.jointBones[hit.instanceId].name, index: hit.instanceId }
  }

  /** 호버 관절 확대 표시 (2배) — null 이면 해제 */
  setJointHover(index: number | null) {
    this.hoverIndex = index
  }

  /** 기즈모 축 레이캐스트 피킹 — 맞은 축 인덱스(0=X/1=Y/2=Z) (2026-09-08 축 드래그) */
  pickGizmoAxis(raycaster: import('three').Raycaster): number | null {
    if (!this.highlightGizmo || !this.highlightGizmo.visible) return null
    const hit = raycaster.intersectObject(this.highlightGizmo, true)[0]
    if (!hit) return null
    let node: Object3D | null = hit.object
    while (node && node.userData.axisIndex === undefined) node = node.parent
    return node ? (node.userData.axisIndex as number) : null
  }

  /** 축 호버 — 해당 축을 화살표(원뿔 표시)로. null 이면 전부 실린더 */
  setAxisHover(axisIndex: number | null) {
    if (!this.highlightGizmo) return
    this.highlightGizmo.children.forEach((axis, i) => {
      const cone = (axis as Group).children[1]
      if (cone) cone.visible = i === axisIndex
    })
  }

  /** IK 타겟 설정 (월드 절대) — 축 드래그 소비자용. 체인 도달 반경으로 클램프 후 홀드 */
  setTargetWorld(target: Vector3) {
    if (!this.targetWorld) this.targetWorld = new Vector3()
    this.targetWorld.copy(target)
    if (this.highlightBone) this.clampTargetToReach(this.highlightBone, this.targetWorld)
  }

  /** IK 타겟 해제 — 재생 재개·선택 변경 시. 포즈는 다음 mixer 적용에서 원복 */
  clearTarget() {
    this.targetWorld = null
  }

  /** 드래그 기준점: 타겟이 있으면 타겟, 없으면 선택 관절의 현재 월드 위치 */
  getTargetWorldPosition(out: Vector3): Vector3 | null {
    if (!this.highlightBone) return null
    if (this.targetWorld) return out.copy(this.targetWorld)
    return out.setFromMatrixPosition(this.highlightBone.matrixWorld)
  }

  /** 매 프레임 IK 홀드 — mixer 가 원 포즈를 덮은 뒤 호출돼야 한다 (updateOnFrame 순서).
   *  타겟이 설정된 동안 해당 프레임 포즈에 CCD 재적용 (종원 2026-09-08 블렌더식 본 드래그).
   *  핀 보정: 솔브 전 각 핀 이펙터(발끝/손/머리)의 월드 위치·방향을 캡처하고 솔브 후
   *  보정 체인 CCD + 방향 복원 — 루트(hips 등)가 제자리 회전해도 비체인 서브트리는
   *  붙은 채(순수 회전 = 스키닝 보존) 말단이 제자리를 지킨다 (종원 2026-09-09) */
  updateIKHold() {
    if (!this.targetWorld || !this.highlightBone || this.ikChain.length === 0) return
    for (const pin of this.ikPinned) {
      pin.effector.updateWorldMatrix(true, false)
      pin.effector.matrixWorld.decompose(pin.pos, pin.quat, _pinScale)
    }
    this.solveChain(this.ikChain, this.highlightBone, this.targetWorld)
    for (const pin of this.ikPinned) {
      if (pin.chain.length > 0) this.solveChain(pin.chain, pin.effector, pin.pos)
      // 이펙터 월드 방향 복원 — 로컬 회전 = 부모 월드 회전⁻¹ × 캡처 월드 회전
      if (!pin.effector.parent) continue
      pin.effector.parent.matrixWorld.decompose(_pinPos, _pinQuat, _pinScale)
      pin.effector.quaternion.copy(_pinQuat.invert()).multiply(pin.quat)
      pin.effector.updateMatrixWorld(true)
    }
  }

  /** 선택 관절 하이라이트 — 릭 선택 UI 와 연동 (종원 2026-09-08). name null 이면 해제.
   *  GLTFLoader 정규화(sanitizeNodeName) 대응으로 원문+정규화 양쪽 매칭.
   *  잠금 관절(hips·직속)은 선택 무효 — 기즈모도 안 뜬다 (종원 2026-09-09) */
  setHighlightBone(name: string | null) {
    this.clearTarget() // 선택 변경 = IK 타겟 해제
    this.setAxisHover(null)
    if (!name) {
      this.highlightBone = undefined
      if (this.highlightGizmo) this.highlightGizmo.visible = false
      this.refreshIKChain() // 체인 해제 + 하이라이트 원색 복구
      return
    }
    const candidates = toNameSet([name])
    this.highlightBone = this.bones.find((bone) => candidates.has(bone.name))
    if (this.highlightBone && this.lockedJointSet.has(this.highlightBone)) this.highlightBone = undefined
    if (!this.highlightBone) {
      if (this.highlightGizmo) this.highlightGizmo.visible = false
      this.refreshIKChain()
      return
    }
    if (!this.highlightGizmo) {
      const gizmo = createAxesGizmo()
      gizmo.children.forEach((c) => (c.renderOrder = this.renderOrder + 3)) // 관절 구 위
      this.add(gizmo)
      this.highlightGizmo = gizmo
    }
    this.highlightGizmo.visible = true
    this.refreshIKChain() // 선택 변경 = 체인 재수집 + 시각화
  }

  updateMatrixWorld(force?: boolean) {
    if (!this.filteredPairs) {
      super.updateMatrixWorld(force)
      return
    }
    _matrixWorldInv.copy(this.root.matrixWorld).invert()

    // octahedral 본: 헤드 = 허용 조상 관절, 테일 = 본 관절 — 헤드에 놓고 Y축을 방향에 정렬.
    // 롤(축 회전)은 방향만으로는 정의 불가 — setFromUnitVectors 는 하향 본(허벅지)에서 180°
    // 특이점 근처라 프레임마다 빙빙 돈다(종원 제보 2026-09-08). 부모 관절 world 회전의 X축을
    // 롤 기준으로 삼아 안정 프레임을 만든다(부모가 트위스트하면 본도 따라 도는 Blender 감).
    if (this.boneMesh) {
      for (let i = 0; i < this.filteredPairs.length; i++) {
        const [bone, parent] = this.filteredPairs[i]
        _boneMatrix.multiplyMatrices(_matrixWorldInv, bone.matrixWorld)
        _tail.setFromMatrixPosition(_boneMatrix)
        _parentMatrix.multiplyMatrices(_matrixWorldInv, parent.matrixWorld)
        _head.setFromMatrixPosition(_parentMatrix)
        _dir.subVectors(_tail, _head)
        const length = _dir.length()
        if (length > 1e-8) {
          _dir.normalize()
          _refAxis.setFromMatrixColumn(_parentMatrix, 0)
          _basisZ.crossVectors(_refAxis, _dir)
          if (_basisZ.lengthSq() < 1e-6) {
            // 롤 기준축이 본 방향과 평행 — 부모 Z축으로 폴백
            _refAxis.setFromMatrixColumn(_parentMatrix, 2)
            _basisZ.crossVectors(_refAxis, _dir)
          }
          _basisZ.normalize()
          _basisX.crossVectors(_dir, _basisZ).normalize()
          _rotMatrix.makeBasis(_basisX, _dir, _basisZ)
          _quat.setFromRotationMatrix(_rotMatrix)
        } else {
          _quat.identity()
        }
        const width = length * BONE_WIDTH_RATIO
        _boneScale.set(width, length, width)
        _instanceMatrix.compose(_head, _quat, _boneScale)
        this.boneMesh.setMatrixAt(i, _instanceMatrix)
      }
      this.boneMesh.instanceMatrix.needsUpdate = true
    }

    if (this.jointMesh && this.jointBones) {
      // 헬퍼 좌표계는 root.matrixWorld — 루트 스케일(autoFit·cm 릭 0.01 등)을 역보정해
      // 구가 화면상 상수 크기(JOINT_RADIUS m)를 유지하게 한다
      _scale.setFromMatrixScale(this.root.matrixWorld)
      const s = JOINT_RADIUS / (Math.abs(_scale.x) || 1)
      for (let i = 0; i < this.jointBones.length; i++) {
        _boneMatrix.multiplyMatrices(_matrixWorldInv, this.jointBones[i].matrixWorld)
        _vector.setFromMatrixPosition(_boneMatrix)
        const js = i === this.hoverIndex ? s * JOINT_HOVER_SCALE : s
        _instanceMatrix.makeScale(js, js, js).setPosition(_vector)
        this.jointMesh.setMatrixAt(i, _instanceMatrix)
      }
      this.jointMesh.instanceMatrix.needsUpdate = true
    }

    if (this.highlightGizmo && this.highlightBone && this.highlightGizmo.visible) {
      // 헬퍼 좌표계가 root 회전·스케일을 물려주므로 역보정 — 축이 항상 **월드 정렬** 유지.
      // 위치 = IK 타겟(드래그 중, 월드→헬퍼 로컬 포인트 변환), 없으면 선택 관절
      _scale.setFromMatrixScale(this.root.matrixWorld)
      const hs = (JOINT_RADIUS * HIGHLIGHT_AXES_RATIO) / (Math.abs(_scale.x) || 1)
      if (this.targetWorld) {
        _vector.copy(this.targetWorld).applyMatrix4(_matrixWorldInv)
      } else {
        _boneMatrix.multiplyMatrices(_matrixWorldInv, this.highlightBone.matrixWorld)
        _vector.setFromMatrixPosition(_boneMatrix)
      }
      _rotMatrix.extractRotation(this.root.matrixWorld)
      this.highlightGizmo.quaternion.setFromRotationMatrix(_rotMatrix).invert()
      this.highlightGizmo.position.copy(_vector)
      this.highlightGizmo.scale.setScalar(hs)
    }
    Object3D.prototype.updateMatrixWorld.call(this, force)
  }

  /** 필터 모드 부속 리소스 해제 (라인 geometry 는 modelControl 이 dispose) */
  dispose() {
    if (this.jointMesh) {
      this.jointMesh.geometry.dispose()
      ;(this.jointMesh.material as MeshBasicMaterial).dispose()
      this.jointMesh.dispose()
    }
    if (this.boneMesh) {
      this.boneMesh.geometry.dispose()
      ;(this.boneMesh.material as MeshLambertMaterial).dispose()
      this.boneMesh.dispose()
    }
    if (this.highlightGizmo) {
      // shaft/cone 지오메트리는 3축 공유 — 각 1회. 재질은 축당 1개(shaft·cone 공유)
      const firstAxis = this.highlightGizmo.children[0] as Group | undefined
      ;(firstAxis?.children[0] as Mesh | undefined)?.geometry.dispose()
      ;(firstAxis?.children[1] as Mesh | undefined)?.geometry.dispose()
      this.highlightGizmo.children.forEach((axis) =>
        (((axis as Group).children[0] as Mesh).material as MeshBasicMaterial).dispose()
      )
    }
  }
}

function toNameSet(names: string[]) {
  const set = new Set<string>()
  for (const name of names) {
    set.add(name)
    set.add(PropertyBinding.sanitizeNodeName(name))
  }
  return set
}

function restoreBoneFlags(root: Object3D) {
  const boneSet = new Set<Object3D>()

  // 1. SkinnedMesh의 skeleton.bones에서 시드 수집
  root.traverse((node) => {
    const mesh = node as SkinnedMesh
    if (mesh.isSkinnedMesh) {
      mesh.skeleton?.bones?.forEach((bone) => boneSet.add(bone))
    }
  })

  // 2. 시드 Bone에서 root까지 올라가며 중간 노드를 Bone으로 마킹
  if (boneSet.size > 0) {
    Array.from(boneSet).forEach((bone) => {
      let current = bone.parent
      while (current && current !== root && current.parent !== root) {
        if ((current as any).isMesh || (current as any).isLight || (current as any).isCamera) break
        boneSet.add(current)
        current = current.parent
      }
    })
  } else {
    // SkinnedMesh가 없는 경우 폴백: Mesh/Light/Camera가 아닌 hierarchy 노드를 Bone으로 마킹
    root.traverse((node) => {
      if (node === root) return
      if ((node as any).isMesh || (node as any).isLight || (node as any).isCamera) return
      if (node.children.length > 0 || node.parent !== root) {
        boneSet.add(node)
      }
    })
  }

  // 3. 스켈레톤 루트 컨테이너 제거
  // 부모가 boneSet에 없는 최상위 노드를 분기점(자식 본 >= 2)이 나올 때까지 반복 제거
  let changed = true
  while (changed) {
    changed = false
    const snap = new Set(boneSet)
    snap.forEach((bone) => {
      if (!bone.parent || !snap.has(bone.parent)) {
        const boneChildCount = bone.children.filter((c) => boneSet.has(c)).length
        if (boneChildCount < 2) {
          boneSet.delete(bone)
          changed = true
        }
      }
    })
  }

  boneSet.forEach((node) => {
    if (!(node as Bone).isBone) {
      Object.setPrototypeOf(node, Bone.prototype)
      ;(node as any).isBone = true
      ;(node as any).type = 'Bone'
    }
  })
}
