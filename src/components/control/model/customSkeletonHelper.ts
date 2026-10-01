import {
  Bone,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PropertyBinding,
  Quaternion,
  SkeletonHelper,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
  type Camera,
  type Raycaster,
  type Vector2,
} from 'three'
import MoveGizmo from './moveGizmo'
import RootMarker, { ROOT_MARKER_SIZE } from './rootMarker'
import RotateGizmo from './rotateGizmo'
import type { GizmoHandle } from './screenGizmo'

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
// 편집 불가(잠금) 관절 — 회색, 릭 선택 UI 잠금 도트와 같은 색 (종원 2026-09-14 — 노랑 #FDB022 에서 변경)
const LOCKED_JOINT_COLOR = new Color(0x737373)
// hips 관절 — 분홍 (종원 2026-09-15 — 잠금 회색에서 편집 가능으로). 루트 표시·릭 선택 UI hips 도트와 같은 xstage-pink-500
const HIPS_JOINT_COLOR = new Color(0xee46bc)
// 선택 관절 기즈모 (종원 2026-09-15 개편): 이동 = 월드 X/Y/Z 화살표 + 가운데 흰 원(화면 방향 이동) / 회전 = 블렌더식 구 링.
// 둘 다 화면 크기 고정·화면 px 잡기·호버 강조 공통(screenGizmo.ts) — 월드 크기 단색 실린더 축 기즈모(2026-09-08)는 교체.
// ※ 재질은 transparent 큐에 넣어야 한다 — opaque 면 three 가 먼저 그려서 transparent 인
//   본/구가 위를 덮는다(종원 "기즈모가 뒤에 그려지는 느낌" 실측 원인)
const JOINT_HOVER_SCALE = 2.0 // 관절 호버 확대 배율 (피킹 옵트인)
// 기즈모 드래그 계산 버퍼 (종원 2026-09-14)
const _rotDelta = new Quaternion()
const _rotLocal = new Quaternion()
const _moveTarget = new Vector3()
const _rootEuler = new Euler()
// 루트 편집 원래 값·마지막 표시 오일러·편집 값 — 헬퍼는 스켈레톤 토글마다 다시 만들어져 루트 노드 기준으로 보관 (종원 2026-09-15)
const rootOrigins = new WeakMap<Object3D, { position: Vector3; quaternion: Quaternion }>()
const rootEulers = new WeakMap<Object3D, Euler>()
const rootEdits = new WeakMap<Object3D, { position: Vector3; quaternion: Quaternion }>()

// ---- CCD IK (three CCDIKSolver 와 동일한 로컬 공간 방식 — 블렌더 Auto-IK 계열) ----
// 체인 룰 (종원 2026-09-09 최종): 선택 관절 = IK 이펙터 — **선택한 관절 자체가 기즈모를
// 따라 움직인다**. 회전은 선택 관절의 부모부터 루트까지(루트 포함, 제자리 회전 —
// 루트 관절 위치는 불변). **다른 관절 IK 는 hips 를 회전·이동하지 않는다** — 체인·루트 후보 상한 =
// hips 직전("손 움직였을 때 다리 움직이는 게 싫다" — 팔/상체 편집은 하체 불가침).
// hips 직속 관절(spine1·허벅지)은 **선택 자체를 잠근다**(호버·클릭·기즈모 전부
// 차단, 종원 최종): 위치는 hips 회전 없이 원리적으로 못 움직이고, 그 회전이 상·하체를
// 커플링하기 때문. (FK 회전 모드로 지원했다 폐기 — 복원은 ff6ae2e 참고)
// hips 자체는 직접 편집한다 (종원 2026-09-15, 분홍 구): 위치 = IK 없이 hips 위치만 옮김(전신이 따라감),
// 회전 = 다른 관절과 같은 회전 기즈모. 둘 다 같은 편집 포즈·되돌리기·편집 적용 경로
// 지정 루트(가슴 등)의 다른 자식 서브트리(목→머리·반대팔)는 **말단 IK 핀**으로 보호:
// 리지드 프리즈는 본 로컬 위치가 바뀌어 스키닝이 찢어지므로(9/9 실증), 붙은 채 순수
// 회전만으로 말단을 원위치 — 중간 관절이 자연스럽게 굽어 흡수(Cascadeur 핀 계열).
// 미매핑 중간 본은 스켈레톤 직결 표시 철학과 동일하게 CCD 대상에서도 생략.
// mixer 가 매 프레임 원 포즈를 재적용하므로 홀드는 "원 포즈 → CCD" 를 매 프레임 반복 —
// 결과가 프레임 간 일관돼 지터 없음
const IK_ITERATIONS = 8
// CCD 스텝 안정화 (2026-09-30, 하네스 ikStability.test.ts 실측): 감쇠 없는 setFromUnitVectors 는 타겟이 관절을 지나거나
// (어깨 통과 → LeftArm 180°/프레임) 이펙터 반대편에 오면(몸 뒤 반대편 → 팔꿈치 118~140°/프레임) 한 반복에 통째로 뒤집혀
// 드래그 중 중간 관절이 튄다. ① 반복당 관절 회전 상한 ② 타겟이 관절에 가까울수록 회전 기여 축소(특이점 감쇠 — 그 관절이
// 돌아도 이펙터가 타겟에 못 가는 상황) ③ hinge 는 굽힘 평면에서 부호 있는 각을 직접 계산(반대편 타겟에서 임의 축 180° 회전 →
// twist 투영이 부호를 잃는 경로 제거). 회전 상한은 반복 수와 곱해 프레임당 도달 한계(8×25°=200°)를 정한다
const IK_MAX_STEP = (25 * Math.PI) / 180
const _ikInvJoint = new Matrix4()
const _ikEffLocal = new Vector3()
const _ikTgtLocal = new Vector3()
const _ikAxis = new Vector3()
const _ikQuat = new Quaternion()
const _reachA = new Vector3()
const _reachB = new Vector3()
const _pinPos = new Vector3()
const _effQuat = new Quaternion() // 이펙터 캡처 — 솔브 중 _pinQuat 이 덮이므로 따로 둔다
const _pinQuat = new Quaternion()
const _pinScale = new Vector3()
// hinge 제약 (무릎·팔꿈치, 종원 2026-09-10): IK 시 단일축 굽힘 + 역굽힘 한계
const HINGE_HYPEREXTEND = (10 * Math.PI) / 180 // 역굽힘(과신전) 허용 10° — 팔꿈치
// 무릎은 뒤로 안 꺾인다 (종원 2026-10-01 "무릎 IK 했을 때 뒤로 안 돌아가게") — 곧게 편 데까지만
const KNEE_HYPEREXTEND = 0
// 발 고정 중 무릎이 고를 수 있는 방향 — 드래그 시작 때 굽힘 방향에서 이 각도 안(허벅지 안·바깥 돌림). 넘으면 무릎이 뒤로 돌아간다
const FOOT_LOCK_KNEE_SWING = (75 * Math.PI) / 180
const HINGE_MAX_BEND = (175 * Math.PI) / 180 // 자연 굽힘 상한(완전 접힘 방지)
const _flH = new Vector3()
const _flK = new Vector3()
const _flF = new Vector3()
const _flU = new Vector3()
const _flRef = new Vector3()
const _flW = new Vector3()
const _flAxis = new Vector3()
const _flKT = new Vector3()
const _flA = new Vector3()
const _flB = new Vector3()
const _flQ = new Quaternion()
const _flBoneQ = new Quaternion()
const _hgBoneIn = new Vector3()
const _hgBoneOut = new Vector3()
const _hgAxis = new Vector3()
const _hgPJ = new Vector3()
const _hgPP = new Vector3()
const _hgPC = new Vector3()
const _hgWorldQ = new Quaternion()
const _hgVec = new Vector3()
const _hgRel = new Quaternion()
const _hgTwist = new Quaternion()
const _WORLD_Z = new Vector3(0, 0, 1)
const _WORLD_X = new Vector3(1, 0, 0)
// IK 체인 시각화 (종원 2026-09-09): 루트~엔드 체인(구·링크) 구분.
// 조상 관절색 노랑→진한 주황 (종원 2026-09-10 — 잠금 노랑과도 확실히 구분)
const IK_CHAIN_JOINT_COLOR = new Color(0xff7700)
const IK_CHAIN_BONE_COLOR = new Color(0xff8800)

// 본 형태 = Blender 식 octahedral (사각뿔 2개 — 링이 헤드 쪽 10% 지점, 종원 2026-09-08).
// 굵기는 본 길이 비례. 색: 바디 = 파랑 / 손가락 = 주황 (Lambert 셰이딩으로 면 구분)
const BONE_RING_RATIO = 0.1
const BONE_WIDTH_RATIO = 0.1 // Blender 기본과 동일 (종원 2026-09-08)
// 본 폭을 길이에 100% 비례시키면 긴 본(허벅지)↔짧은 본(손가락) 두께 편차가 과함(종원 2026-09-10).
// 폭 = 길이·평균 블렌드 → 편차 완화(짧은 손가락도 적당한 두께). 0=완전균일 / 1=완전 길이비례
const BONE_WIDTH_LENGTH_MIX = 0.3
const BODY_BONE_COLOR = new Color(0x3377dd) // 손가락 포함 전체 바디 본 동일 색 (종원 2026-09-10)

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

/** 관절 편집 기즈모 모드 (종원 2026-09-14) — move = 월드 축 드래그 IK(hips 는 IK 없이 위치만, 2026-09-15) / rotate = 선택 관절 자체를 월드 기준 구 기즈모로 회전 */
export type SkeletonGizmoMode = 'move' | 'rotate'

/** 위치 편집 대상 (종원 2026-09-15) — origin = 리그 루트 노드(원점 — 이동 경로까지 같이) / character = hips(모든 프레임에 더하는 로컬 값) */
export type SkeletonPositionTarget = 'origin' | 'character'

/** 캐릭터 루트 트랜스폼 (종원 2026-09-15 루트 편집) — 루트 노드 로컬 값. path = 모델 씬 루트에서 자식 인덱스 경로(같은 GLB 를
 *  다시 로드해 저장할 때 같은 노드를 찾는다), rotation = 오일러 XYZ 도(직전 표시와 연속 — 180° 넘는 값 가능), quaternion = 같은 회전 */
export type SkeletonRootTransform = {
  path: number[]
  position: [number, number, number]
  rotation: [number, number, number]
  quaternion: [number, number, number, number]
  /** 처음 로드한 값에서 바뀜 — 초기화 버튼 활성 (종원 2026-09-15) */
  modified: boolean
}

export type SkeletonBoneFilter = {
  body: string[]
  /** 손가락 본 — 라인만 다른 색으로 표시, 관절 구 없음 (종원 2026-09-08) */
  fingers?: string[]
  /** hips 본명 — IK 고정 베이스(체인이 절대 넘지 않는 경계, 종원 2026-09-09).
   *  미지정/미해석이면 경계 없이 body 조상 전체가 체인 후보 */
  hips?: string
  /** MMD 예외 (종원 2026-09-10): spine1(腰) 본명. MMD 는 腰 에 상체(上半身)와 하체(下半身)가
   *  함께 붙는 상하체 분기점이라, hips 처럼 腰+직속 자식도 IK 선택 잠금(안 그러면 상체 IK 가
   *  腰 를 돌려 하체까지 딸려간다). MMD 릭에서만 전달 — 표준 릭은 미지정 */
  lockedChainRoot?: string
  /** hinge 관절 본명(무릎·팔꿈치, 종원 2026-09-10) — IK 시 단일축으로만 굽고 역굽힘 제한 */
  hingeJoints?: string[]
  /** 머리 본명 (2026-09-30) — 다른 관절 IK 로 척추가 돌아도 머리는 **월드 방향 유지**(시선 보존). 미지정이면 머리가 척추를 따라 돈다 */
  head?: string
  /** 발(발목) 본명 — 발 고정(setFootLock) 대상 (종원 2026-10-01) */
  feet?: string[]
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
  /** 직전 프레임 평균 세그먼트 길이 — 본 두께 편차 완화용 기준 (본 길이 ~상수라 1프레임 지연 무해) */
  private avgBoneLength?: number
  private jointMesh?: InstancedMesh
  private jointBones?: Bone[]
  private jointBoneSet?: Set<Object3D>
  private boneMesh?: InstancedMesh
  private highlightBone?: Bone
  private moveGizmo?: MoveGizmo
  /** 캐릭터 루트 — Hips 위 최상위 본의 부모 노드(Armature 같은 리그 루트 컨테이너) (종원 2026-09-15). 모션에 따라 상수 트랙이 걸려
   *  있어(모션 12개 중 4개 — Armature 위치·회전·스케일) 편집 값은 holdRootEdit 이 믹서 뒤에 다시 입힌다 */
  private rootNode?: Object3D
  private rootMarker?: RootMarker
  /** 위치 편집 (종원 2026-09-15, 루트 편집에서 이름 변경) — 켜면 대상(원점/캐릭터)에 분홍 표시 + 모드(위치/회전)에 맞는 기즈모,
   *  드래그는 대상 노드 로컬 값을 바꾼다 */
  private rootEditing = false
  /** 위치 편집 대상 — 원점 = rootNode, 캐릭터 = hipsBone (캐릭터 값은 스튜디오가 모든 프레임 hips 키에 굽는다) */
  private positionTarget: SkeletonPositionTarget = 'origin'
  /** 위치 편집 캐릭터 대상 표시 — hips 자리 분홍 구 */
  private hipsMarker?: RootMarker
  /** 루트 회전 드래그 — 시작 로컬 회전·부모 월드 회전 */
  private rootDrag?: { local0: Quaternion; parentWorld: Quaternion }
  /** 기즈모 모드 (종원 2026-09-14) — rotate 는 IK 를 안 써 주황 체인이 없다. 두 모드의 드래그는 같은 편집 포즈(ikFrozenPose)에 누적 */
  private gizmoMode: SkeletonGizmoMode = 'move'
  private rotateGizmo?: RotateGizmo
  /** 회전 드래그 — 시작 포즈·선택 관절 인덱스·시작 로컬 회전·부모 월드 회전(자기 회전이라 드래그 동안 불변) */
  private rotateDrag?: { base: Float64Array; index: number; local0: Quaternion; parentWorld: Quaternion; lastValid?: Quaternion }
  /** hips 이동 드래그 (종원 2026-09-15) — 시작 포즈·hips 부모(월드 목표 → 로컬 위치). IK 없이 hips 위치만 */
  private hipsMoveDrag?: { base: Float64Array; parent: Object3D; lastValid?: Float64Array }
  /** 관절 구 표시 상태 — 기즈모는 관절이 보일 때만 (setJointsVisible) */
  private jointsVisible = true
  private hoverIndex: number | null = null
  /** IK 고정 베이스 (config hips) — 체인이 절대 넘지 않는 경계이자 기본 루트 (종원 2026-09-09).
   *  hips 자체는 직접 편집 — 분홍 구, 위치는 IK 없이 (종원 2026-09-15) */
  private hipsBone?: Bone
  /** MMD spine1(腰) — 상하체 분기점이라 hips 와 함께 체인 경계 (종원 2026-09-10). MMD 릭만 */
  private lockedChainRootBone?: Bone
  /** hinge 관절(무릎·팔꿈치) 집합 — IK 시 단일축 굽힘 제약 (종원 2026-09-10) */
  private hingeBoneSet = new Set<Object3D>()
  /** 머리 본 — IK 중 월드 방향 유지 대상 (2026-09-30). 선택 관절·체인에 들면 유지 안 함 */
  private headBone?: Bone
  /** hinge 관절별 IK 시작 시점 캡처: 굽힘축(로컬)·기준 로컬회전·기준 굽힘각·자식뼈 */
  private hingeState = new Map<Object3D, HingeState>()
  /** 지정 IK 루트 — 체인의 최상위 회전 관절(포함, 제자리 회전). 미지정 = hips 직전 최상위 */
  private ikRootBone?: Bone
  /** 현재 선택 기준 IK 체인 (선택 관절의 부모부터 루트까지, 가까운 순) — refreshIKChain 갱신 */
  private ikChain: Bone[] = []
  /** 루트의 다른 자식 서브트리 핀 — 서브트리는 붙은 채(스키닝 보존), 말단 이펙터
   *  (발끝/손/머리)의 월드 위치·방향만 솔브마다 IK 로 원복. chain = 이펙터에서 가까운 순
   *  회전 관절(무릎 등이 자연 흡수), pos/quat = 프레임 캡처 버퍼 (종원 2026-09-09) */
  private ikPinned: { chain: Bone[]; effector: Bone; pos: Vector3; quat: Quaternion }[] = []
  /** 발 고정 (종원 2026-10-01) — 켜면 IK·회전·hips 이동 드래그 동안 발(발목)의 월드 위치·방향을 드래그 시작 값으로 유지한다.
   *  무릎·허벅지를 2-bone 으로 다시 풀고 발 방향을 되돌린다. 끌고 있는 다리(선택·IK 체인에 든 다리)는 제외 */
  private footBones: Bone[] = []
  private footLock = false
  private footLockRef: { foot: Bone; knee: Bone; thigh: Bone; pos: Vector3; quat: Quaternion; bendDir: Vector3; reach: number; minReach: number }[] = []
  /** 무릎 = 발의 body 부모 — hinge 과신전 0 (뒤로 안 꺾임) */
  private kneeBones = new Set<Object3D>()
  /** 선택 잠금 관절 = hips 직결 body 자식(spine1·허벅지) — 호버·클릭·기즈모 전부
   *  차단, 릭 UI 는 회색 표시 (종원 2026-09-09 최종). hips 자체는 2026-09-15 부터 편집 가능 */
  private lockedJointSet = new Set<Object3D>()
  private lockedJointNames: string[] = []
  /** IK 타겟 (월드 절대 좌표) — 이동 기즈모 드래그(축·가운데 흰 원)로 이동, 설정된 동안 매 프레임 CCD 로 포즈 홀드.
   *  본 위치 기준 오프셋이 아니라 절대값: IK 로 본이 움직여도 타겟은 고정 (종원 2026-09-08) */
  private targetWorld: Vector3 | null = null
  private ikSuspended = false // true 면 updateIKHold 스킵 — 타겟 보존한 채 커밋(원본) 포즈 표시 (종원 2026-09-10 편집 범위 선택)

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
      // 캐릭터 루트 (종원 2026-09-15) — Hips 위 최상위 본의 부모 노드(Armature 같은 리그 루트). 루트 본이 있는 릭도 그 위 컨테이너를
      // 잡는다: 루트 본에 루트 모션 트랙이 걸려 있으면 루트 편집 값을 믹서가 매 프레임 덮기 때문
      if (this.hipsBone) {
        let top: Object3D = this.hipsBone
        while (top.parent && (top.parent as Bone).isBone) top = top.parent
        this.rootNode = top.parent ?? undefined
        if (this.rootNode) {
          this.rootMarker = new RootMarker(this.renderOrder) // 기즈모(renderOrder+3) 아래. 루트 편집 중에만 보인다(setRootEditing)
          this.add(this.rootMarker)
          // 초기화용 원래 값 — 이 노드를 처음 볼 때(루트 편집 전) 한 번만 (종원 2026-09-15)
          if (!rootOrigins.has(this.rootNode)) {
            rootOrigins.set(this.rootNode, { position: this.rootNode.position.clone(), quaternion: this.rootNode.quaternion.clone() })
          }
        }
        this.hipsMarker = new RootMarker(this.renderOrder, true) // 위치 편집 캐릭터 대상 — 구만, 대상일 때만 보인다
        this.add(this.hipsMarker)
      }
      // 선택 잠금 = hips 직결 body 자식 (종원 2026-09-09 — 편집 불가 관절). hips 자체는 잠그지 않는다 — 직접 편집 (종원 2026-09-15)
      const lockRootAndChildren = (rootBone: Bone | undefined, lockRoot: boolean) => {
        if (!rootBone || !this.filteredPairs) return
        if (lockRoot) this.lockedJointSet.add(rootBone)
        for (const [bone, parent] of this.filteredPairs) {
          if (parent === rootBone) this.lockedJointSet.add(bone)
        }
      }
      lockRootAndChildren(this.hipsBone, false)
      // MMD 예외 (종원 2026-09-10): spine1(腰)은 상하체 분기점 — 腰+직속 자식(上半身·다리)도 잠금
      if (filter.lockedChainRoot) {
        const rootSet = toNameSet([filter.lockedChainRoot])
        this.lockedChainRootBone = this.bones.find((bone) => rootSet.has(bone.name))
        lockRootAndChildren(this.lockedChainRootBone, true)
      }
      // hinge 관절(무릎·팔꿈치) — IK 시 단일축 굽힘 제약 (종원 2026-09-10)
      if (filter.hingeJoints?.length) {
        const hingeSet = toNameSet(filter.hingeJoints)
        for (const bone of this.bones) if (hingeSet.has(bone.name)) this.hingeBoneSet.add(bone)
      }
      if (filter.head) {
        const headSet = toNameSet([filter.head])
        this.headBone = this.bones.find((bone) => headSet.has(bone.name))
      }
      if (filter.feet?.length) {
        const footSet = toNameSet(filter.feet)
        this.footBones = this.bones.filter((bone) => footSet.has(bone.name))
        for (const foot of this.footBones) {
          const knee = this.bodyParentOf(foot)
          if (knee) this.kneeBones.add(knee)
        }
      }
      this.lockedJointNames = Array.from(this.lockedJointSet).map((bone) => (bone as Bone).name)
      // 잠금셋·hips 확정 후 기본색(잠금 회색·hips 분홍)으로 재색칠 — applyBoneFilter 는 잠금셋 채워지기 전에
      // 실행돼 전부 초록으로 깔렸다(선택 전에도 잠금색 보이게, 종원 2026-09-10 · 색은 2026-09-14 노랑 → 회색 · hips 분홍 2026-09-15)
      if (this.jointMesh && this.jointBones) {
        for (let i = 0; i < this.jointBones.length; i++) this.jointMesh.setColorAt(i, this.jointBaseColor(this.jointBones[i]))
        if (this.jointMesh.instanceColor) this.jointMesh.instanceColor.needsUpdate = true
      }
    }
  }

  /** 잠금 관절 원 본명 목록 — 릭 선택 UI 빨간 표시·클릭 차단용 */
  getLockedJointNames(): string[] {
    return this.lockedJointNames
  }

  /** 관절 기본색(선택·IK 체인 주황이 아닐 때) — 잠금 회색 / hips 분홍 (종원 2026-09-15) / 나머지 초록 */
  private jointBaseColor(bone: Object3D) {
    if (this.lockedJointSet.has(bone)) return LOCKED_JOINT_COLOR
    return bone === this.hipsBone ? HIPS_JOINT_COLOR : JOINT_COLOR
  }

  /** 적용 안 한 편집 포즈 존재 — 드래그 중 IK 또는 굳힌 포즈(드래그 끝·관절 전환·되돌리기 포함) (knot 워핑 베이크 가드용, 2026-09-14) */
  hasIKHold(): boolean {
    return !!this.ikFrozenPose || (!!this.targetWorld && this.ikChain.length > 0)
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
      bones.setColorAt(i, BODY_BONE_COLOR) // 손가락도 바디와 동일 색 (종원 2026-09-10)
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

  /** 엔드의 조상 walk — config body 본만, hips 도달 시 중단(**불포함** — 다른 관절 IK 는 hips 를
   *  안 움직인다, 종원 최종. hips 자체는 직접 편집 2026-09-15). stopAtRoot=true 면 지정 루트까지 포함 후 중단(루트도
   *  회전) — CCD 체인용. false 면 hips 직전까지 전체 — 루트 후보 산출용 */
  private walkIKAncestors(endBone: Bone, stopAtRoot: boolean): Bone[] {
    const chain: Bone[] = []
    if (!this.jointBoneSet) return chain
    let p: Object3D | null = endBone.parent
    while (p && (p as Bone).isBone) {
      // hips + MMD spine1(腰) 은 체인 경계 — 상체 IK 가 腰 를 넘어 하체를 끌지 않게 (종원 2026-09-10)
      if (p === this.hipsBone || p === this.lockedChainRootBone) break
      if (this.jointBoneSet.has(p)) chain.push(p as Bone)
      if (stopAtRoot && p === this.ikRootBone) break
      p = p.parent
    }
    return chain
  }

  /** IK 루트 후보 — 직계 부모부터 hips **직전**까지 (엔드에서 가까운 순). hips 는 다른 관절 IK 로
   *  회전·이동하지 않아(종원 최종 — 손 편집이 다리에 영향 주지 않게) 후보에서 제외. hips 선택 = IK 없음(빈 배열).
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
    // 드래그한 관절(타겟 있음)이면 루트가 바뀐 체인으로 드래그 시작 포즈에서 다시 푼다 — 관절 전환·되돌리기로 타겟이 없으면
    // 굳힌 포즈 그대로 (종원 2026-09-14)
    if (this.targetWorld) this.ikFrozenPose = undefined
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
        const effector = path[path.length - 1]
        this.ikPinned.push({
          // 이펙터에서 가까운 순 (CCD 문법). 머리는 방향만 유지 — 목 한 관절로 머리 위치까지 붙잡으면 루트가 조금만 돌아도
          // 목이 크게 꺾인다(하네스 실측 목 114°, 2026-09-30). 위치는 척추를 따라가고 시선만 보존
          chain: effector === this.headBone ? [] : path.slice(0, -1).reverse(),
          effector,
          pos: new Vector3(),
          quat: new Quaternion(),
        })
      }
      // 머리 월드 방향 유지 (2026-09-30): 루트의 자식 서브트리가 아니어도(기본 루트 = hips 직전 척추 → 목이 체인 중간 관절에
      // 붙음) 척추가 돌면 머리가 따라 돌았다("손을 끌었는데 머리가 돌아간다"). 선택 관절·체인 소속이 아니면 방향만 원복
      const head = this.headBone
      if (head && head !== this.highlightBone && !this.ikChain.includes(head) && !this.ikPinned.some((pin) => pin.effector === head)) {
        this.ikPinned.push({ chain: [], effector: head, pos: new Vector3(), quat: new Quaternion() })
      }
    }
    if (!this.jointMesh || !this.jointBones) return
    // 회전 모드는 IK 를 안 쓰므로 체인(조상 구·링크) 주황 표시 없음 — 선택 관절 구만 주황 (종원 2026-09-14, 선택 주황 2026-09-15)
    const chain = this.gizmoMode === 'move' ? this.ikChain : []
    const chainSet = new Set<Object3D>(chain)
    const moving = new Set<Object3D>(chain)
    // 선택 관절 포함 — hips 는 IK 체인 없이 직접 옮겨도 선택 주황 (종원 2026-09-15)
    if (this.highlightBone && (this.gizmoMode === 'rotate' || chain.length > 0 || this.highlightBone === this.hipsBone)) {
      moving.add(this.highlightBone)
    }
    // 노랑 = 회전 체인 구간만 — 체인 톱 위(고정 경계 쪽) 링크는 원색 (종원 2026-09-09:
    // "루트를 left fore arm 으로 하면 left arm 세그먼트는 안 떠야")
    for (let i = 0; i < this.jointBones.length; i++) {
      // 잠금(회색) 우선 — IK 체인 경계라 moving 엔 안 들지만 색 우선순위 명시 (종원 2026-09-10)
      const bone = this.jointBones[i]
      this.jointMesh.setColorAt(
        i,
        moving.has(bone) && !this.lockedJointSet.has(bone) ? IK_CHAIN_JOINT_COLOR : this.jointBaseColor(bone)
      )
    }
    if (this.jointMesh.instanceColor) this.jointMesh.instanceColor.needsUpdate = true
    if (this.boneMesh && this.filteredPairs && this.pairIsFinger) {
      for (let i = 0; i < this.filteredPairs.length; i++) {
        const [bone, parent] = this.filteredPairs[i]
        const inChain = moving.has(bone) && chainSet.has(parent)
        this.boneMesh.setColorAt(i, inChain ? IK_CHAIN_BONE_COLOR : BODY_BONE_COLOR)
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

  /** IK 시작 시점(첫 setTargetWorld) hinge 관절의 굽힘축·기준을 현재(기준) 포즈로 캡처 (종원 2026-09-10).
   *  축 = 부모뼈×자식뼈(굽힘 평면 법선)를 관절 로컬로. 직선 rest 폴백 = 자식뼈에 수직인 축 */
  private captureHingeState() {
    this.hingeState.clear()
    if (!this.filteredPairs || this.hingeBoneSet.size === 0) return
    for (const J of Array.from(this.hingeBoneSet)) {
      const bone = J as Bone
      const parent = bone.parent as Bone | null
      if (!parent || !(parent as Bone).isBone) continue
      // 자식 = 매핑된 사지 연속 본 (팔꿈치→손, 무릎→발)
      let child: Bone | null = null
      for (const [b, p] of this.filteredPairs) if (p === bone) { child = b; break }
      if (!child) continue
      _hgPJ.setFromMatrixPosition(bone.matrixWorld)
      _hgPP.setFromMatrixPosition(parent.matrixWorld)
      _hgPC.setFromMatrixPosition(child.matrixWorld)
      _hgBoneIn.subVectors(_hgPJ, _hgPP)
      _hgBoneOut.subVectors(_hgPC, _hgPJ)
      if (_hgBoneIn.lengthSq() < 1e-10 || _hgBoneOut.lengthSq() < 1e-10) continue
      _hgBoneIn.normalize()
      _hgBoneOut.normalize()
      _hgAxis.crossVectors(_hgBoneIn, _hgBoneOut)
      if (_hgAxis.lengthSq() < 1e-8) {
        // 직선(직립) — 굽힘 평면 불명. 자식뼈에 수직인 축으로 폴백
        _hgAxis.crossVectors(_hgBoneOut, _WORLD_Z)
        if (_hgAxis.lengthSq() < 1e-8) _hgAxis.crossVectors(_hgBoneOut, _WORLD_X)
      }
      _hgAxis.normalize()
      const bendRef = Math.acos(Math.min(1, Math.max(-1, _hgBoneIn.dot(_hgBoneOut))))
      bone.matrixWorld.decompose(_hgPJ, _hgWorldQ, _hgPP) // _hgWorldQ = J 월드 회전
      const axisLocal = _hgAxis.clone().applyQuaternion(_hgWorldQ.invert()) // 축을 관절 로컬로
      const hyperExtend = this.kneeBones.has(bone) ? KNEE_HYPEREXTEND : HINGE_HYPEREXTEND
      this.hingeState.set(bone, { axisLocal, refQuat: bone.quaternion.clone(), bendRef, hyperExtend })
    }
  }

  /** hinge 관절이면 방금 CCD 회전을 굽힘축 성분(twist)만 남기고(swing 제거) 각도 클램프 (종원 2026-09-10).
   *  굽힘각 φ = bendRef + twist. 역굽힘 -10°까지 허용, 과굽힘 상한 */
  private applyHingeConstraint(joint: Bone) {
    const hs = this.hingeState.get(joint)
    if (!hs) return
    const theta = hingeTwist(joint, hs)
    const clamped = Math.min(hingeMaxTwist(hs), Math.max(hingeMinTwist(hs), theta))
    _hgTwist.setFromAxisAngle(hs.axisLocal, clamped)
    joint.quaternion.copy(hs.refQuat).multiply(_hgTwist) // 단일축 + 클램프 결과로 대체
  }

  /** CCD — chain 은 이펙터에서 가까운 순. 메인 체인·핀 보정 체인 공용.
   *  hinge(팔꿈치·무릎) 바로 위에 회전 관절(어깨·허벅지)이 체인에 있으면 그 둘은 2-bone 해석으로 푼다 (2026-09-30):
   *  hinge 굽힘각 = 어깨→타겟 거리의 코사인 법칙, 어깨는 CCD swing. 그리디 CCD 는 hinge 가 "타겟을 가리키는" 방향으로만 굽어
   *  팔을 곧게 펴고 어깨·척추가 나머지를 떠안는 국소 최소(err 10~60mm)와 접힘 해 사이를 타겟이 조금 움직일 때마다 오갔다
   *  (하네스 실측: 어깨 중심 원호에서 팔꿈치 49°→14° 점프, 몸 뒤로 당김 err 59mm 정체 → 한 프레임에 +104°) */
  private solveChain(chain: Bone[], effectorBone: Bone, targetWorld: Vector3) {
    for (let iter = 0; iter < IK_ITERATIONS; iter++) {
      for (let i = 0; i < chain.length; i++) {
        const joint = chain[i]
        const hs = this.hingeState.get(joint)
        if (hs && i + 1 < chain.length) {
          this.bendHingeForReach(joint, hs, chain[i + 1], effectorBone, targetWorld)
          continue // 이어서 부모 관절이 swing
        }
        this.ccdStep(joint, effectorBone, targetWorld)
      }
    }
  }

  /** CCD 한 스텝 — joint 를 로컬 공간에서 이펙터→타겟 방향으로 회전 (three CCDIKSolver 문법 + 감쇠·상한·hinge 평면 각) */
  private ccdStep(joint: Bone, effectorBone: Bone, targetWorld: Vector3) {
    _ikInvJoint.copy(joint.matrixWorld).invert()
    _ikEffLocal.setFromMatrixPosition(effectorBone.matrixWorld).applyMatrix4(_ikInvJoint)
    _ikTgtLocal.copy(targetWorld).applyMatrix4(_ikInvJoint)
    const distEff = _ikEffLocal.length()
    const distTgt = _ikTgtLocal.length()
    if (distEff < 1e-5 || distTgt < 1e-5) return
    _ikEffLocal.divideScalar(distEff)
    _ikTgtLocal.divideScalar(distTgt)
    // 특이점 감쇠: 타겟이 이펙터보다 관절에 가까우면 그 비율만큼만 — 관절 바로 옆을 지나는 타겟에 방향이 뒤집혀도 회전이 0 으로 이어진다
    const damping = Math.min(1, distTgt / distEff)
    const hs = this.hingeState.get(joint)
    if (hs) {
      // hinge 가 체인 최상위(루트 = 팔꿈치 지정)인 경우: 굽힘 평면(축 수직)에 투영한 부호 있는 각 = 이 축만 돌릴 때 거리 최소점
      _ikEffLocal.addScaledVector(hs.axisLocal, -_ikEffLocal.dot(hs.axisLocal))
      _ikTgtLocal.addScaledVector(hs.axisLocal, -_ikTgtLocal.dot(hs.axisLocal))
      if (_ikEffLocal.lengthSq() < 1e-10 || _ikTgtLocal.lengthSq() < 1e-10) return
      _ikAxis.crossVectors(_ikEffLocal, _ikTgtLocal)
      const cur = hingeTwist(joint, hs)
      let want = cur + Math.atan2(_ikAxis.dot(hs.axisLocal), _ikEffLocal.dot(_ikTgtLocal))
      const minT = hingeMinTwist(hs)
      const maxT = hingeMaxTwist(hs)
      if (want < minT || want > maxT) {
        // 최소점이 굽힘 범위 밖 — 거리는 각도의 코사인이라 원 위에서 각거리가 가까운 끝점이 최적. 타겟이 이펙터 정반대(±180°)
        // 근처일 때 단순 클램프는 부호 하나로 접힘(175°) ↔ 과신전(-10°) 을 오가며 튀었다(하네스 실측 팔꿈치 82~118°/프레임)
        want = angularDistance(want, minT) <= angularDistance(want, maxT) ? minT : maxT
      }
      const delta = Math.max(-IK_MAX_STEP, Math.min(IK_MAX_STEP, (want - cur) * damping))
      _ikQuat.setFromAxisAngle(hs.axisLocal, delta)
    } else {
      _ikAxis.crossVectors(_ikEffLocal, _ikTgtLocal)
      const sinA = _ikAxis.length()
      // 정반대(회전축 부정) — 이 관절은 이번 반복 건너뜀. 다른 관절이 이펙터를 축에서 벗어나게 하면 다음 반복에 이어 받는다
      if (sinA < 1e-6) return
      _ikAxis.divideScalar(sinA)
      const angle = Math.min(IK_MAX_STEP, Math.atan2(sinA, _ikEffLocal.dot(_ikTgtLocal)) * damping)
      _ikQuat.setFromAxisAngle(_ikAxis, angle)
    }
    joint.quaternion.multiply(_ikQuat).normalize()
    this.applyHingeConstraint(joint) // 무릎·팔꿈치면 단일축 굽힘 + 역굽힘 제한 (종원 2026-09-10)
    joint.updateMatrixWorld(true) // 서브트리(이펙터 포함) 즉시 갱신
  }

  /** 2-bone 해석 굽힘 (2026-09-30): hinge 굽힘각을 부모 관절(어깨·허벅지)→타겟 거리 d 로 직접 정한다 — 코사인 법칙
   *  cos γ = (L1²+L2²−d²)/(2·L1·L2), 굽힘 = π−γ (0 = 곧게). 부모가 이어서 swing 하면 |부모→이펙터| = d 라 정확히 닿는다.
   *  타겟이 팔 길이 밖/안쪽이면 코사인 클램프 = 완전 신전/최대 접힘. 굽힘 방향(팔꿈치가 향하는 쪽)은 기준 포즈의 것을 그대로
   *  쓴다(pole 없음) — 프레임마다 기준 포즈에서 다시 풀므로 타겟만의 함수라 프레임 간 연속 */
  private bendHingeForReach(hinge: Bone, hs: HingeState, parentJoint: Bone, effectorBone: Bone, targetWorld: Vector3) {
    _hgPP.setFromMatrixPosition(parentJoint.matrixWorld)
    _hgPJ.setFromMatrixPosition(hinge.matrixWorld)
    _hgPC.setFromMatrixPosition(effectorBone.matrixWorld)
    const l1 = _hgPP.distanceTo(_hgPJ)
    const l2 = _hgPJ.distanceTo(_hgPC)
    if (l1 < 1e-5 || l2 < 1e-5) return
    const d = _hgPP.distanceTo(targetWorld)
    const cosGamma = Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)))
    const bend = Math.PI - Math.acos(cosGamma)
    const twist = Math.min(hingeMaxTwist(hs), Math.max(hingeMinTwist(hs), bend - hs.bendRef))
    _hgTwist.setFromAxisAngle(hs.axisLocal, twist)
    hinge.quaternion.copy(hs.refQuat).multiply(_hgTwist)
    hinge.updateMatrixWorld(true)
  }

  /** 관절 구 레이캐스트 피킹 — 맞은 관절의 본명/인덱스/잠금여부 (2026-09-08 릭 선택 연동).
   *  잠금 관절(hips 직속)도 hit 반환 — 호버 확대·이름 툴팁은 동일하게 뜨되(종원 2026-09-10),
   *  선택/드래그는 호출측(onUp)이 locked 플래그로 차단 */
  pickJoint(raycaster: import('three').Raycaster): { name: string; index: number; locked: boolean } | null {
    const jointBones = this.jointBones
    if (!this.jointMesh || !jointBones) return null
    const hits = raycaster.intersectObject(this.jointMesh, false).filter((h) => h.instanceId != null)
    // 겹친 구 중 선택 가능한 관절 우선 — 멀리서 보면 hips 구가 앞쪽 잠금 관절(허벅지) 구에 가려 클릭이 허벅지로 잡혀 hips 를 못
    // 골랐다 (종원 2026-09-15, Serenade 실측: 툴팁 "Left Up Leg — 편집 불가"). 전부 잠금이면 가장 앞 구(툴팁용)
    const hit = hits.find((h) => !this.lockedJointSet.has(jointBones[h.instanceId as number])) ?? hits[0]
    if (!hit) return null
    const index = hit.instanceId as number
    return { name: jointBones[index].name, index, locked: this.lockedJointSet.has(jointBones[index]) }
  }

  /** 호버 관절 확대 표시 (2배) — null 이면 해제 */
  setJointHover(index: number | null) {
    this.hoverIndex = index
  }

  /** 관절 구·기즈모 표시 토글 (종원 2026-09-10) — 모션 편집(피킹) 모드에서만 관절이 보이고,
   *  패널 스켈레톤 토글만 켠 상태는 본(octahedral)만. 본 메시는 루트 편집 중이 아니면 항상 표시 */
  setJointsVisible(visible: boolean) {
    this.jointsVisible = visible
    if (this.jointMesh) this.jointMesh.visible = visible && !this.rootEditing
    this.syncGizmoVisibility()
  }

  /** 선택 관절 기즈모 표시 — 관절이 보이고 선택됐을 때 모드에 맞는 기즈모 하나만 (종원 2026-09-14) */
  private syncGizmoVisibility() {
    // 위치 편집 중엔 대상(원점·hips)에 기즈모 — 관절 표시·선택과 무관 (종원 2026-09-15)
    const show = this.rootEditing ? !!this.positionNode() : this.jointsVisible && !!this.highlightBone
    if (show && this.gizmoMode === 'move' && !this.moveGizmo) {
      this.moveGizmo = new MoveGizmo(this.renderOrder + 3) // 관절 구 위
      this.add(this.moveGizmo)
    }
    if (show && this.gizmoMode === 'rotate' && !this.rotateGizmo) {
      this.rotateGizmo = new RotateGizmo(this.renderOrder + 3)
      this.add(this.rotateGizmo)
    }
    if (this.moveGizmo) this.moveGizmo.visible = show && this.gizmoMode === 'move'
    if (this.rotateGizmo) this.rotateGizmo.visible = show && this.gizmoMode === 'rotate'
  }

  // ---- 관절 기즈모 — 이동(화살표·가운데 흰 원)·회전(링·트랙볼) 공통 조작 (종원 2026-09-15) ----

  /** 기즈모 모드 전환 — 이동 드래그 타겟만 내려놓고 편집 포즈는 유지(모드를 바꿔도 같은 프레임 편집 누적).
   *  회전 모드는 IK 를 안 쓰므로 주황 체인 표시를 끈다 (종원 2026-09-14) */
  setGizmoMode(mode: SkeletonGizmoMode) {
    if (this.gizmoMode === mode) return
    this.releaseTargetKeepPose()
    this.cancelGizmoDrag()
    this.setGizmoHover(null)
    this.gizmoMode = mode
    this.syncGizmoVisibility()
    this.refreshIKChain()
  }

  private activeGizmo() {
    return this.gizmoMode === 'rotate' ? this.rotateGizmo : this.moveGizmo
  }

  /** 기즈모 핸들 피킹 — 화면 px 기준. 이동의 가운데 흰 원·회전의 트랙볼 자리에 다른 관절 구가 있으면 그 관절 선택이 우선
   *  (null → 호출측 관절 호버·클릭 경로) */
  pickGizmoHandle(raycaster: Raycaster, pointer: Vector2, viewport: Vector2): GizmoHandle | null {
    const gizmo = this.activeGizmo()
    if (!gizmo?.visible || !this.jointBones) return null
    const handle = gizmo.pick(raycaster.camera, pointer, viewport)
    if (!this.rootEditing && (handle === 'trackball' || (handle === 'view' && this.gizmoMode === 'move'))) {
      const hit = this.pickJoint(raycaster)
      // 잠금 관절은 선택이 안 되니 기즈모 우선 — hips 흰 원·트랙볼 둘레가 잠금 관절(spine1·허벅지)이라 (종원 2026-09-15)
      if (hit && !hit.locked && this.jointBones[hit.index] !== this.highlightBone) return null
    }
    return handle
  }

  /** 핸들 호버 강조 — 모드 전환 뒤 이전 기즈모 강조가 남지 않게 둘 다 갱신 */
  setGizmoHover(handle: GizmoHandle | null) {
    this.moveGizmo?.setHover(this.gizmoMode === 'move' ? handle : null)
    this.rotateGizmo?.setHover(this.gizmoMode === 'rotate' ? handle : null)
  }

  /** 기즈모 드래그 시작 — 이동: 축 직선·화면 면 기준만 잡고 IK 타겟은 첫 이동 때 설정(제자리 클릭은 편집 아님),
   *  회전: 지금 포즈 기준 캡처 */
  beginGizmoDrag(handle: GizmoHandle, raycaster: Raycaster, pointer: Vector2, viewport: Vector2): boolean {
    if (this.rootEditing) return this.beginRootDrag(handle, raycaster, pointer, viewport)
    if (!this.highlightBone) return false
    if (this.gizmoMode === 'rotate') return this.beginRotate(handle, raycaster.camera, pointer, viewport)
    if (this.highlightBone === this.hipsBone) return this.beginHipsMove(handle, raycaster, viewport)
    return this.moveGizmo?.beginDrag(handle, raycaster.camera, raycaster.ray, viewport) ?? false
  }

  /** 기즈모 드래그 중 — 이동: 드래그 시작 대비 IK 타겟(설정 즉시 CCD 홀드가 추종, hips 는 위치 직접), 회전: 선택 관절 회전 */
  dragGizmo(raycaster: Raycaster, pointer: Vector2) {
    if (this.rootEditing) this.dragRoot(raycaster, pointer)
    else if (this.gizmoMode === 'rotate') this.dragRotate(pointer)
    else if (this.hipsMoveDrag) this.dragHipsMove(raycaster)
    else if (this.moveGizmo?.dragTo(raycaster.ray, _moveTarget)) this.setTargetWorld(_moveTarget)
  }

  /** 기즈모 드래그 끝 — 이동은 저장 타겟을 실제 도달 위치로 클램프. 굳힌 포즈·조작 단계 저장은 호출측 onJointDragEnd */
  endGizmoDrag() {
    if (this.gizmoMode === 'move' && !this.rootEditing) this.commitTargetToReachable()
    this.cancelGizmoDrag()
  }

  /** 진행 중 드래그 상태만 정리 — 포즈·타겟은 그대로 */
  private cancelGizmoDrag() {
    this.rotateDrag = undefined
    this.hipsMoveDrag = undefined
    this.rootDrag = undefined
    this.rotateGizmo?.endDrag()
    this.moveGizmo?.endDrag()
  }

  /** 회전 드래그 시작 — 지금 포즈(다른 관절·이동 편집 포함)가 기준, 선택 관절만 돈다 */
  private beginRotate(handle: GizmoHandle, camera: Camera, pointer: Vector2, viewport: Vector2): boolean {
    const bone = this.highlightBone
    const parent = bone?.parent
    if (!bone || !parent || !this.jointBones || !this.rotateGizmo) return false
    const index = this.jointBones.indexOf(bone)
    const base = this.capturePose()
    if (index < 0 || !base) return false
    this.releaseTargetKeepPose()
    this.captureFootLock()
    this.rotateDrag = {
      base,
      index,
      local0: bone.quaternion.clone(),
      parentWorld: parent.getWorldQuaternion(new Quaternion()),
    }
    this.rotateGizmo.beginDrag(handle, camera, pointer, viewport)
    return true
  }

  /** 회전 드래그 중 — 로컬' = 부모월드⁻¹ · R · 부모월드 · 로컬0: 월드축 회전 R 을 선택 관절 자리에서 적용(관절 위치 불변, 자식은
   *  따라감). 결과는 굳힌 포즈로 유지 — 이동 편집과 같은 되돌리기 단계·편집 적용 경로를 탄다 */
  private dragRotate(pointer: Vector2) {
    const drag = this.rotateDrag
    if (!drag || !this.rotateGizmo) return
    this.rotateGizmo.dragTo(pointer, _rotDelta)
    if (!this.ikOriginPose) {
      if (1 - Math.abs(_rotDelta.w) < 1e-12) return // 아직 안 돌렸음 — 제자리 클릭이 편집 세션을 만들지 않게
      this.ikOriginPose = drag.base.slice()
    }
    _rotLocal.copy(drag.parentWorld).invert().multiply(_rotDelta).multiply(drag.parentWorld).multiply(drag.local0)
    _rotLocal.normalize()
    const pose = drag.base.slice()
    _rotLocal.toArray(pose, drag.index * 4)
    this.applyPose(pose)
    // 발 고정 중 다리가 더 못 따라오는 회전이면 닿는 데까지만 — 마지막으로 닿던 회전과 목표 사이를 반씩 좁힌다 (종원 2026-10-01)
    if (this.footLockRef.length > 0 && !this.footLockReachable()) {
      const from = drag.lastValid ?? drag.local0
      const target = _rotLocal.clone()
      let lo = 0
      let hi = 1
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        _rotLocal.slerpQuaternions(from, target, mid).toArray(pose, drag.index * 4)
        this.applyPose(pose)
        if (this.footLockReachable()) lo = mid
        else hi = mid
      }
      _rotLocal.slerpQuaternions(from, target, lo).toArray(pose, drag.index * 4)
      this.applyPose(pose)
    }
    drag.lastValid = _rotLocal.clone()
    // 발 고정 — 돌린 관절이 든 다리는 제외(그 다리를 직접 돌리는 중)
    if (this.footLockRef.length > 0 && this.highlightBone) {
      this.applyFootLock(this.highlightBone)
      this.ikFrozenPose = this.capturePose() ?? pose
    } else this.ikFrozenPose = pose
  }

  /** hips 이동 드래그 시작 (종원 2026-09-15) — IK 없이 hips 위치만. 지금 포즈(다른 관절 편집 포함)가 기준 */
  private beginHipsMove(handle: GizmoHandle, raycaster: Raycaster, viewport: Vector2): boolean {
    const parent = this.hipsBone?.parent
    const base = this.capturePose()
    if (!parent || !base || !this.moveGizmo?.beginDrag(handle, raycaster.camera, raycaster.ray, viewport)) return false
    this.releaseTargetKeepPose()
    this.captureFootLock()
    this.hipsMoveDrag = { base, parent }
    return true
  }

  /** hips 이동 드래그 중 — 월드 목표를 hips 부모 공간 위치로(자식은 전부 따라가고 관절 회전은 그대로). 결과는 굳힌 포즈로 유지 —
   *  회전 편집과 같은 되돌리기 단계·편집 적용 경로를 탄다 */
  private dragHipsMove(raycaster: Raycaster) {
    const drag = this.hipsMoveDrag
    if (!drag || !this.jointBones || !this.moveGizmo?.dragTo(raycaster.ray, _moveTarget)) return
    if (!this.ikOriginPose) this.ikOriginPose = drag.base.slice()
    const pose = drag.base.slice()
    const at = this.jointBones.length * 4
    drag.parent.worldToLocal(_moveTarget).toArray(pose, at)
    this.applyPose(pose)
    // 발 고정 중 다리가 더 못 따라오는 자리면 닿는 데까지만 — 마지막으로 닿던 자리와 목표 사이를 반씩 좁혀 경계를 찾는다.
    // 기즈모는 hips 를 따라 그려지므로 경계에서 멈춘다 (종원 2026-10-01)
    if (this.footLockRef.length > 0 && !this.footLockReachable()) {
      const from = drag.lastValid ?? drag.base.slice(at, at + 3)
      const to = pose.slice(at, at + 3)
      let lo = 0
      let hi = 1
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        for (let c = 0; c < 3; c++) pose[at + c] = from[c] + (to[c] - from[c]) * mid
        this.applyPose(pose)
        if (this.footLockReachable()) lo = mid
        else hi = mid
      }
      for (let c = 0; c < 3; c++) pose[at + c] = from[c] + (to[c] - from[c]) * lo
      this.applyPose(pose)
    }
    drag.lastValid = pose.slice(at, at + 3)
    // 발 고정 — hips 를 내리면 무릎이 굽고 발은 제자리 (종원 2026-10-01)
    if (this.footLockRef.length > 0) {
      this.applyFootLock(this.hipsBone)
      this.ikFrozenPose = this.capturePose() ?? pose
    } else this.ikFrozenPose = pose
  }

  // ---- 루트 편집 (종원 2026-09-15) ----

  /** 루트 편집 켜기/끄기 — 켜면 스켈레톤(본·관절 구)은 그리지 않고 분홍 루트 표시와 모드별 기즈모만(관절 기즈모 대신).
   *  루트 표시는 루트 편집 중에만 보인다 (종원 2026-09-15) */
  setRootEditing(on: boolean) {
    if (this.rootEditing === on) return
    this.cancelGizmoDrag()
    this.setGizmoHover(null)
    this.rootEditing = on
    this.syncPositionMarkers()
    if (this.boneMesh) this.boneMesh.visible = !on
    if (this.jointMesh) this.jointMesh.visible = this.jointsVisible && !on
    this.syncGizmoVisibility()
  }

  /** 캐릭터 루트 노드 — 루트 편집 유지(holdRootEdit)·포즈 편집 캡처 제외용 */
  getRootNode(): Object3D | undefined {
    return this.rootNode
  }

  /** hips 노드 — 위치 편집 캐릭터 오프셋을 굽는 트랙 대상 이름용 */
  getHipsNode(): Bone | undefined {
    return this.hipsBone
  }

  /** 위치 편집 대상 전환 (종원 2026-09-15) — 분홍 표시·기즈모 자리가 원점 ↔ hips 로 바뀐다 */
  setPositionTarget(target: SkeletonPositionTarget) {
    if (this.positionTarget === target) return
    this.cancelGizmoDrag()
    this.setGizmoHover(null)
    this.positionTarget = target
    this.syncPositionMarkers()
    this.syncGizmoVisibility()
  }

  /** 위치 편집 대상 노드 — 원점 = 리그 루트 노드, 캐릭터 = hips */
  private positionNode(): Object3D | undefined {
    return this.positionTarget === 'character' ? this.hipsBone : this.rootNode
  }

  /** 분홍 표시 — 위치 편집 중 대상에만 (원점 = 바닥 원·정면 화살표·구, 캐릭터 = hips 자리 구) */
  private syncPositionMarkers() {
    if (this.rootMarker) this.rootMarker.visible = this.rootEditing && this.positionTarget === 'origin'
    if (this.hipsMarker) this.hipsMarker.visible = this.rootEditing && this.positionTarget === 'character'
  }

  /** 루트 노드 로컬 트랜스폼 — 패널 표시·저장용 */
  getRootTransform(): SkeletonRootTransform | null {
    const node = this.rootNode
    if (!node) return null
    const path: number[] = []
    for (let n: Object3D = node; n !== this.root; ) {
      const parent: Object3D | null = n.parent
      if (!parent) return null // 모델 씬 밖 — 저장 때 같은 노드를 못 찾는다
      path.unshift(parent.children.indexOf(n))
      n = parent
    }
    // 표시 오일러는 직전 값과 연속 — Y 로 90° 넘게 돌려도 X·Z 가 ±180 으로 뒤집혀 보이지 않게 (종원 2026-09-15)
    const euler = compatibleEuler(node.quaternion, rootEulers.get(node))
    rootEulers.set(node, euler)
    const origin = rootOrigins.get(node)
    const deg = (rad: number) => (rad * 180) / Math.PI
    return {
      path,
      position: [node.position.x, node.position.y, node.position.z],
      rotation: [deg(euler.x), deg(euler.y), deg(euler.z)],
      quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
      modified: !!origin && (!origin.position.equals(node.position) || !origin.quaternion.equals(node.quaternion)),
    }
  }

  /** 루트 노드 로컬 위치·회전(오일러 XYZ 도) 직접 지정 — 패널 숫자 입력 */
  setRootTransform(position: [number, number, number], rotation: [number, number, number]) {
    const node = this.rootNode
    if (!node) return
    const rad = (deg: number) => (deg * Math.PI) / 180
    node.position.set(position[0], position[1], position[2])
    node.quaternion.setFromEuler(_rootEuler.set(rad(rotation[0]), rad(rotation[1]), rad(rotation[2]), 'XYZ'))
    rootEulers.set(node, _rootEuler.clone()) // 입력한 오일러 표현 그대로 표시(180° 넘는 값 포함)
    node.updateMatrixWorld(true)
    keepRootEdit(node)
  }

  /** 루트 트랜스폼 초기화 — 처음 로드한 위치·회전으로 (종원 2026-09-15) */
  resetRootTransform() {
    const node = this.rootNode
    const origin = node && rootOrigins.get(node)
    if (!node || !origin) return
    node.position.copy(origin.position)
    node.quaternion.copy(origin.quaternion)
    rootEulers.delete(node)
    rootEdits.delete(node)
    node.updateMatrixWorld(true)
  }

  /** 위치 편집 드래그 시작 — 위치: 이동 기즈모(기준점 = 대상 노드), 회전: 시작 회전 캡처 */
  private beginRootDrag(handle: GizmoHandle, raycaster: Raycaster, pointer: Vector2, viewport: Vector2): boolean {
    const node = this.positionNode()
    const parent = node?.parent
    if (!node || !parent) return false
    if (this.gizmoMode === 'move') return this.moveGizmo?.beginDrag(handle, raycaster.camera, raycaster.ray, viewport) ?? false
    if (!this.rotateGizmo) return false
    this.rootDrag = { local0: node.quaternion.clone(), parentWorld: parent.getWorldQuaternion(new Quaternion()) }
    this.rotateGizmo.beginDrag(handle, raycaster.camera, pointer, viewport)
    return true
  }

  /** 위치 편집 드래그 중 — 위치는 월드 목표를 부모 공간으로, 회전은 로컬' = 부모월드⁻¹ · R · 부모월드 · 로컬0 (관절 회전과 같은 식).
   *  캐릭터(hips)는 지금 프레임 미리보기 — 모든 프레임에 굽는 건 드래그 끝에 스튜디오가 한다 */
  private dragRoot(raycaster: Raycaster, pointer: Vector2) {
    const node = this.positionNode()
    const parent = node?.parent
    if (!node || !parent) return
    if (this.gizmoMode === 'move') {
      if (!this.moveGizmo?.dragTo(raycaster.ray, _moveTarget)) return
      node.position.copy(parent.worldToLocal(_moveTarget))
    } else {
      const drag = this.rootDrag
      if (!drag || !this.rotateGizmo) return
      this.rotateGizmo.dragTo(pointer, _rotDelta)
      node.quaternion.copy(drag.parentWorld).invert().multiply(_rotDelta).multiply(drag.parentWorld).multiply(drag.local0)
      node.quaternion.normalize()
    }
    node.updateMatrixWorld(true)
    if (this.positionTarget === 'origin') keepRootEdit(node)
  }

  /** IK 편집 포즈 (종원 2026-09-14 실측 수정): 일시정지 중 AnimationMixer 는 섞은 값이 직전에 쓴 값과 같으면 씬에 다시 쓰지
   *  않는다(PropertyMixer 캐시) — "mixer 가 매 프레임 원 포즈를 재적용" 가정이 깨져 ① IK 가 전 프레임 결과 위에 누적(같은 타겟도
   *  거쳐 온 경로에 따라 포즈가 달라짐, 실측 최대 17°) ② IK 를 풀어도 원 포즈로 안 돌아왔다(실측 16~38°, 시간을 바꿔야 복원).
   *  그래서 포즈를 직접 들고 있는다 — 원 포즈(편집 세션 시작) · 솔브 기준(드래그 시작) · 굳힌 포즈(드래그 끝·관절 전환·되돌리기).
   *  한 프레임에서 여러 관절 편집이 누적되고(관절 전환은 해제 아님), 프레임 이동·적용·재생 때만 원 포즈로 되돌린다 */
  private ikOriginPose?: Float64Array
  private ikBase?: Float64Array
  private ikFrozenPose?: Float64Array

  /** 편집 포즈 스냅샷 — body 관절 로컬 회전(관절당 4) + 끝에 hips 로컬 위치(3, hips 직접 이동 — 종원 2026-09-15).
   *  원 포즈·솔브 기준·굳힌 포즈·되돌리기 단계 공용 (Float64 — 복원 시 원래 값 그대로) */
  private capturePose(): Float64Array | undefined {
    if (!this.jointBones) return undefined
    const pose = new Float64Array(this.poseLength())
    this.jointBones.forEach((bone, i) => bone.quaternion.toArray(pose, i * 4))
    this.hipsBone?.position.toArray(pose, this.jointBones.length * 4)
    return pose
  }

  private applyPose(pose: Float64Array) {
    if (!this.jointBones || pose.length !== this.poseLength()) return
    // three 0.167+ 는 fromArray 첫 인자를 QuaternionTuple 로 좁혔다 — 0.162 에서는 ArrayLike 라 통과하지만
    // 소비자가 three 를 올리면 TS2345 로 깨진다. 런타임 동작은 동일하므로 캐스팅으로 막는다 (파트라슈 리뷰 2026-09-17)
    this.jointBones.forEach((bone, i) => bone.quaternion.fromArray(pose as unknown as number[], i * 4))
    this.hipsBone?.position.fromArray(pose, this.jointBones.length * 4)
    // 솔브·기즈모가 관절 matrixWorld 를 바로 읽으므로 body 서브트리 행렬 갱신 (hips 부모는 편집 대상이 아니라 행렬 유효)
    ;(this.hipsBone ?? this.root).updateMatrixWorld(true)
  }

  private poseLength() {
    return (this.jointBones?.length ?? 0) * 4 + (this.hipsBone ? 3 : 0)
  }

  private restoreIKBase() {
    if (this.ikBase) this.applyPose(this.ikBase)
  }

  /** 클립 교체 알림(replaceClipLive) — 편집 세션 포즈는 옛 클립 기준이라 버린다(교체 직후 믹서가 새 클립 포즈를 전부 다시 쓴다).
   *  적용 안 한 편집을 살려야 하는 호출부는 교체 전에 확인·정리한다 (종원 2026-09-14) */
  requestIKRebase() {
    this.cancelGizmoDrag()
    this.targetWorld = null
    this.ikOriginPose = undefined
    this.ikBase = undefined
    this.ikFrozenPose = undefined
    this.hingeState.clear()
  }

  /** 지금 포즈를 굳힘 — 이후 솔브 없이 유지. 굳힌 포즈 사본 반환(기즈모 조작 단계 저장용), 편집 세션 없으면 null (종원 2026-09-14) */
  freezeIKPose(): Float64Array | null {
    if (!this.ikOriginPose) return null
    const pose = this.capturePose()
    if (!pose) return null
    this.ikFrozenPose = pose
    return pose.slice()
  }

  /** 저장한 단계 포즈로 즉시 복원 — 다시 풀지 않고 그대로 굳힌다(기즈모 되돌리기/다시하기, 종원 2026-09-14). 드래그 타겟은
   *  내려놓아 다음 드래그는 이 포즈에서 시작. 세션이 없던 0 단계에서면 지금 포즈(= 원 포즈)를 원 포즈로 잡는다 */
  holdIKPose(pose: Float64Array) {
    this.cancelGizmoDrag() // 드래그 중 되돌리기 — 진행 중 드래그가 되살린 포즈를 덮지 않게 (종원 2026-09-14)
    if (!this.ikOriginPose) this.ikOriginPose = this.capturePose()
    this.targetWorld = null
    this.ikBase = undefined
    this.hingeState.clear()
    this.ikFrozenPose = pose.slice()
    this.applyPose(this.ikFrozenPose)
  }

  /** 관절 전환 — 드래그 타겟만 내려놓고 지금 포즈는 굳혀 유지(다른 관절 편집 누적, 종원 2026-09-14) */
  private releaseTargetKeepPose() {
    if (!this.ikOriginPose) return
    if (!this.ikFrozenPose) this.ikFrozenPose = this.capturePose()
    this.targetWorld = null
    this.ikBase = undefined
    this.hingeState.clear()
  }

  /** IK 타겟 설정 (월드 절대) — 이동 기즈모 드래그용. 체인 도달 반경으로 클램프 후 홀드 */
  setTargetWorld(target: Vector3) {
    const starting = !this.targetWorld
    if (!this.targetWorld) {
      // 드래그 시작 — 세션 첫 IK 면 원 포즈 저장, 솔브 기준 = 지금 포즈(다른 관절 편집 포함) (종원 2026-09-14)
      if (!this.ikOriginPose) this.ikOriginPose = this.capturePose()
      this.ikBase = this.capturePose()
      this.targetWorld = new Vector3()
    }
    this.targetWorld.copy(target)
    if (this.highlightBone) this.clampTargetToReach(this.highlightBone, this.targetWorld)
    this.ikFrozenPose = undefined // 타겟이 움직임 = 다시 푼다
    // IK 시작 순간(드래그 시작)의 포즈로 hinge 굽힘축·기준각 캡처 (종원 2026-09-10)
    if (starting) {
      this.captureHingeState()
      this.captureFootLock() // 솔브 기준(드래그 시작 포즈)의 발 자리
    }
  }

  /** IK 타겟·편집 세션 해제 — 프레임 이동·적용·재생·편집 종료 시. 원 포즈로 즉시 되돌린다(일시정지 중엔 믹서가 다시 안 써서,
   *  종원 2026-09-14). 관절 전환은 해제가 아니다 — setHighlightBone 은 포즈를 유지한다 */
  clearTarget() {
    this.cancelGizmoDrag()
    if (this.ikOriginPose) this.applyPose(this.ikOriginPose)
    this.targetWorld = null
    this.ikOriginPose = undefined
    this.ikBase = undefined
    this.ikFrozenPose = undefined
    this.hingeState.clear()
  }

  /** 드래그 종료 시 저장 타겟을 실제 도달 위치(이펙터)로 클램프 (종원 2026-09-10).
   *  제약(hinge·도달반경)으로 못 간 raw 드래그 타겟이 남으면, 이후 IK 루트 변경으로 관절이
   *  자유로워졌을 때 그 raw 위치로 갑자기 튄다 — 기즈모(=이펙터)와 저장값을 일치시켜 방지 */
  commitTargetToReachable() {
    if (this.targetWorld && this.highlightBone) {
      this.targetWorld.setFromMatrixPosition(this.highlightBone.matrixWorld)
    }
  }

  /** IK 홀드 일시중단 — 타겟·선택은 보존하되 CCD 재적용만 스킵해 mixer 커밋(원본) 포즈를 드러낸다.
   *  편집 범위 시작/끝 프레임 선택 중 "마지막 수정 상태" 포즈 프리뷰용. 해제 시 편집 프레임에서 복원 (종원 2026-09-10) */
  suspendIK(suspended: boolean) {
    // 중단 순간 원 포즈로 — 편집한 관절이 커밋 포즈 프리뷰에 남지 않게(믹서는 바뀐 값만 다시 쓴다, 2026-09-14)
    if (suspended && !this.ikSuspended && this.ikOriginPose) this.applyPose(this.ikOriginPose)
    this.ikSuspended = suspended
  }

  /** 드래그 기준점 = 선택 관절 실제 월드 위치(기즈모가 그려지는 곳). 타겟이 제약으로
   *  관절보다 앞서 있어도 앵커는 관절에 맞춰 다음 드래그가 어긋나지 않게 한다 (종원 2026-09-10) */
  getTargetWorldPosition(out: Vector3): Vector3 | null {
    if (!this.highlightBone) return null
    return out.setFromMatrixPosition(this.highlightBone.matrixWorld)
  }

  /** 매 프레임 IK 홀드 — mixer 적용 뒤 호출돼야 한다 (updateOnFrame 순서).
   *  굳힌 포즈가 있으면 그대로 유지, 드래그 중이면 드래그 시작 포즈에서 CCD 재적용 (종원 2026-09-08 블렌더식 본 드래그, 포즈 관리 2026-09-14).
   *  핀 보정: 솔브 전 각 핀 이펙터(발끝/손/머리)의 월드 위치·방향을 캡처하고 솔브 후
   *  보정 체인 CCD + 방향 복원 — 루트(hips 등)가 제자리 회전해도 비체인 서브트리는
   *  붙은 채(순수 회전 = 스키닝 보존) 말단이 제자리를 지킨다 (종원 2026-09-09) */
  updateIKHold() {
    if (this.ikSuspended) return // 편집 범위 선택 중 — 타겟 보존, 커밋 포즈 표시 (종원 2026-09-10)
    // 굳힌 포즈(드래그 끝·관절 전환·되돌리기/다시하기)는 솔브 없이 그대로 — 편집 범위 선택 뒤 믹서가 다시 쓴 값도 덮는다 (종원 2026-09-14)
    if (this.ikFrozenPose) {
      this.applyPose(this.ikFrozenPose)
      return
    }
    if (!this.targetWorld || !this.highlightBone || this.ikChain.length === 0) return
    this.restoreIKBase() // 드래그 시작 포즈 → CCD: 같은 타겟이면 항상 같은 포즈(거쳐 온 경로와 무관) (종원 2026-09-14)
    for (const pin of this.ikPinned) {
      pin.effector.updateWorldMatrix(true, false)
      pin.effector.matrixWorld.decompose(pin.pos, pin.quat, _pinScale)
    }
    // 선택한 관절(이펙터) 자체는 월드 방향을 지킨다 (종원 2026-09-30 "head 본을 잡고 움직이면 머리는 그대로였으면") — CCD 는 이펙터를
    // 안 돌리지만 부모(목·척추)가 돌면 월드에선 따라 돌았다. 드래그 시작 방향(restoreIKBase 뒤)을 잡아 두고 풀고 나서 되돌린다.
    // 회전 모드는 ikFrozenPose 로 직접 돌리므로 여기를 안 탄다.
    // 예외 = hinge(팔꿈치·무릎)를 직접 잡은 경우: 아래팔 방향을 월드에 고정하면 위팔이 돌 때 굽힘이 평면 밖으로 나가고
    // 역굽힘이 생긴다(하네스 −13.9°, 파트라슈 리뷰 2026-09-30) → 예전처럼 부모를 따라간다(굽힘각 유지)
    const keepEffectorWorld = !this.hingeBoneSet.has(this.highlightBone)
    if (keepEffectorWorld) {
      this.highlightBone.updateWorldMatrix(true, false)
      this.highlightBone.matrixWorld.decompose(_pinPos, _effQuat, _pinScale)
    }
    this.solveChain(this.ikChain, this.highlightBone, this.targetWorld)
    if (keepEffectorWorld) this.restoreWorldQuaternion(this.highlightBone, _effQuat)
    for (const pin of this.ikPinned) {
      if (pin.chain.length > 0) this.solveChain(pin.chain, pin.effector, pin.pos)
      this.restoreWorldQuaternion(pin.effector, pin.quat)
    }
    if (this.footLockRef.length > 0) this.applyFootLock(this.highlightBone)
  }

  /** 발 고정 켜기/끄기 (종원 2026-10-01) — 다음 드래그부터 적용(진행 중 드래그는 그대로) */
  setFootLock(on: boolean) {
    this.footLock = on
  }

  /** body 관절의 첫 body 자식 (손가락 제외) — 발 → 발가락 */
  private bodyChildOf(bone: Bone): Bone | null {
    if (!this.filteredPairs || !this.pairIsFinger) return null
    for (let i = 0; i < this.filteredPairs.length; i++) {
      if (!this.pairIsFinger[i] && this.filteredPairs[i][1] === bone) return this.filteredPairs[i][0] as Bone
    }
    return null
  }

  /** body 관절의 가장 가까운 body 조상 (손가락 제외) */
  private bodyParentOf(bone: Bone): Bone | null {
    if (!this.filteredPairs || !this.pairIsFinger) return null
    for (let i = 0; i < this.filteredPairs.length; i++) {
      if (!this.pairIsFinger[i] && this.filteredPairs[i][0] === bone) return this.filteredPairs[i][1] as Bone
    }
    return null
  }

  /** 드래그 시작 — 발 고정이 켜져 있으면 양발 월드 위치·방향과 무릎 굽힘 방향(허벅지→발 선에서 무릎 쪽)을 잡아 둔다 */
  private captureFootLock() {
    this.footLockRef = []
    if (!this.footLock) return
    for (const foot of this.footBones) {
      const knee = this.bodyParentOf(foot)
      const thigh = knee ? this.bodyParentOf(knee) : null
      if (!knee || !thigh || thigh === this.hipsBone) continue
      foot.updateWorldMatrix(true, false)
      const pos = new Vector3()
      const quat = new Quaternion()
      foot.matrixWorld.decompose(pos, quat, _pinScale)
      const h = new Vector3().setFromMatrixPosition(thigh.matrixWorld)
      const k = new Vector3().setFromMatrixPosition(knee.matrixWorld)
      const u = pos.clone().sub(h).normalize()
      const legLen = h.distanceTo(k) + k.distanceTo(pos)
      const bendDir = k.clone().sub(h)
      bendDir.addScaledVector(u, -bendDir.dot(u))
      // 거의 곧은 다리면 무릎이 허벅지→발 선에서 거의 안 떨어져 그 방향은 흔들린다(무릎이 옆·뒤로 튐, 종원 2026-10-01) —
      // 무릎은 발가락이 향한 쪽으로 굽으니 발→발가락 방향을 쓴다. 발가락이 없으면 정면(+Z)
      if (bendDir.length() < legLen * 0.03) {
        const toe = this.bodyChildOf(foot)
        if (toe) bendDir.setFromMatrixPosition(toe.matrixWorld).sub(pos)
        else bendDir.set(0, 0, 1)
        bendDir.addScaledVector(u, -bendDir.dot(u))
        if (bendDir.lengthSq() < 1e-10) bendDir.set(0, 0, 1).addScaledVector(u, -u.z)
      }
      // 허벅지→발이 닿을 수 있는 거리 — 곧게 편 길이(조금 덜) ~ 무릎 최대 굽힘(HINGE_MAX_BEND) 길이
      const l1 = h.distanceTo(new Vector3().setFromMatrixPosition(knee.matrixWorld))
      const l2 = new Vector3().setFromMatrixPosition(knee.matrixWorld).distanceTo(pos)
      // 시작 자세 거리는 늘 허용 — 서 있는 다리는 거의 곧아서(편 길이에 가까움) 안 그러면 시작부터 '못 닿음'으로 기즈모가 안 움직였다
      const d0 = h.distanceTo(pos)
      const reach = Math.max(l1 + l2, d0)
      const minReach = Math.min(Math.sqrt(Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(Math.PI - HINGE_MAX_BEND))), d0)
      this.footLockRef.push({ foot, knee, thigh, pos, quat, bendDir: bendDir.normalize(), reach, minReach })
    }
  }

  /** 발 고정 해석 (종원 2026-10-01 "hips 나 leg 본을 움직여도 foot·toe 월드 위치·회전이 돌아가면 안 된다").
   *  허벅지 시작 H 와 고정 발 F 사이 거리로 무릎이 놓일 수 있는 원(축 H→F, 중심 C, 반지름 r)이 정해진다 — 지금 무릎 자리(사용자가
   *  hips·무릎·허벅지를 움직인 결과)에 가장 가까운 원 위 점을 고르되 시작 굽힘 방향에서 FOOT_LOCK_KNEE_SWING 안으로(뒤로 안 돌아감).
   *  허벅지·정강이를 그 무릎·발 자리로 돌리고(최소 회전) 발 월드 방향을 되돌린다 — 발가락은 발에 붙어 같이 고정된다.
   *  닿지 않는 거리면 다리를 곧게 편 채 발 쪽을 향한다. moving = 지금 끄는 관절 — 그 발(또는 발가락)을 직접 끄는 다리만 건너뛴다 */
  private applyFootLock(moving?: Bone) {
    for (const lock of this.footLockRef) {
      if (moving && (moving === lock.foot || moving.parent === lock.foot)) continue
      const { foot, knee, thigh } = lock
      thigh.updateWorldMatrix(true, true)
      const h = _flH.setFromMatrixPosition(thigh.matrixWorld)
      const kCur = _flK.setFromMatrixPosition(knee.matrixWorld)
      const fCur = _flF.setFromMatrixPosition(foot.matrixWorld)
      const l1 = h.distanceTo(kCur)
      const l2 = kCur.distanceTo(fCur)
      const toF = _flU.subVectors(lock.pos, h)
      const d = Math.min(Math.max(toF.length(), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6)
      if (toF.lengthSq() < 1e-12) continue
      const u = toF.normalize()
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
      const r = Math.sqrt(Math.max(0, l1 * l1 - a * a))
      // 무릎 방향 — 지금 무릎 자리를 원 평면에 투영, 시작 굽힘 방향(원 평면 투영)에서 각도 제한
      const ref = _flRef.copy(lock.bendDir).addScaledVector(u, -lock.bendDir.dot(u))
      if (ref.lengthSq() < 1e-10) ref.set(0, 0, 1).addScaledVector(u, -u.z)
      ref.normalize()
      // 무릎 방향: 이 다리의 허벅지·무릎을 직접 끄는 중이면 지금 무릎 자리를 따라가고, 아니면(hips 이동·회전 등) 시작 때 잡은
      // 굽힘 방향 그대로 — 매 프레임 지금 무릎을 투영하면 hips 가 앞뒤로 움직일 때 투영이 뒤집혀 무릎이 튀었다 (종원 2026-10-01)
      const followKnee = moving === thigh || moving === knee
      const want = followKnee ? _flW.subVectors(kCur, h).addScaledVector(u, -kCur.clone().sub(h).dot(u)) : _flW.copy(ref)
      if (want.lengthSq() < 1e-10) want.copy(ref)
      want.normalize()
      const ang = Math.acos(Math.min(1, Math.max(-1, ref.dot(want))))
      if (ang > FOOT_LOCK_KNEE_SWING) {
        const axis = _flAxis.crossVectors(ref, want)
        if (axis.lengthSq() < 1e-10) axis.copy(u)
        want.copy(ref).applyAxisAngle(axis.normalize(), FOOT_LOCK_KNEE_SWING)
      }
      const kTarget = _flKT.copy(h).addScaledVector(u, a).addScaledVector(want, r)
      // 허벅지: (지금 무릎 - H) → (목표 무릎 - H) 최소 회전을 월드에서
      this.rotateBoneWorld(thigh, _flA.subVectors(kCur, h).normalize(), _flB.subVectors(kTarget, h).normalize())
      // 정강이(무릎): (지금 발 - 무릎) → (고정 발 - 무릎)
      knee.updateWorldMatrix(false, true)
      const k2 = _flK.setFromMatrixPosition(knee.matrixWorld)
      const f2 = _flF.setFromMatrixPosition(foot.matrixWorld)
      this.rotateBoneWorld(knee, _flA.subVectors(f2, k2).normalize(), _flB.subVectors(lock.pos, k2).normalize())
      this.restoreWorldQuaternion(foot, lock.quat)
    }
  }

  /** 지금 포즈에서 고정한 양발에 다리가 닿는가 — 허벅지 시작 ~ 고정 발 거리가 [최대 굽힘 길이, 편 길이] 안 (종원 2026-10-01 "더 못 가면 기즈모도 안 가게") */
  private footLockReachable(): boolean {
    for (const lock of this.footLockRef) {
      lock.thigh.updateWorldMatrix(true, false)
      const d = _flH.setFromMatrixPosition(lock.thigh.matrixWorld).distanceTo(lock.pos)
      if (d > lock.reach || d < lock.minReach) return false
    }
    return true
  }

  /** 관절을 월드에서 from → to 방향으로 최소 회전 (관절 자리에서) — 자식은 따라간다 */
  private rotateBoneWorld(bone: Bone, from: Vector3, to: Vector3) {
    if (!bone.parent || from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return
    _flQ.setFromUnitVectors(from, to)
    bone.getWorldQuaternion(_flBoneQ)
    _flBoneQ.premultiply(_flQ)
    bone.parent.matrixWorld.decompose(_pinPos, _pinQuat, _pinScale)
    bone.quaternion.copy(_pinQuat.invert()).multiply(_flBoneQ).normalize()
    bone.updateMatrixWorld(true)
  }

  /** 관절의 월드 방향을 캡처값으로 되돌린다 — 로컬 회전 = 부모 월드 회전⁻¹ × 캡처 월드 회전.
   *  부모 월드 행렬은 solveChain 이 관절마다 갱신해 두므로 최신이다 */
  private restoreWorldQuaternion(bone: Bone, worldQuat: Quaternion) {
    if (!bone.parent) return
    bone.parent.matrixWorld.decompose(_pinPos, _pinQuat, _pinScale)
    bone.quaternion.copy(_pinQuat.invert()).multiply(worldQuat)
    bone.updateMatrixWorld(true)
  }

  /** 선택 관절 하이라이트 — 릭 선택 UI 와 연동 (종원 2026-09-08). name null 이면 해제.
   *  GLTFLoader 정규화(sanitizeNodeName) 대응으로 원문+정규화 양쪽 매칭.
   *  잠금 관절(hips 직속)은 선택 무효 — 기즈모도 안 뜬다 (종원 2026-09-09). hips 는 선택 가능 (2026-09-15) */
  setHighlightBone(name: string | null) {
    this.releaseTargetKeepPose() // 관절 전환 = 드래그 타겟만 내려놓고 편집 포즈는 유지(같은 프레임 여러 관절 누적, 종원 2026-09-14)
    this.cancelGizmoDrag()
    this.setGizmoHover(null)
    if (!name) {
      this.highlightBone = undefined
      this.syncGizmoVisibility()
      this.refreshIKChain() // 체인 해제 + 하이라이트 원색 복구
      return
    }
    const candidates = toNameSet([name])
    this.highlightBone = this.bones.find((bone) => candidates.has(bone.name))
    if (this.highlightBone && this.lockedJointSet.has(this.highlightBone)) this.highlightBone = undefined
    if (!this.highlightBone) {
      this.syncGizmoVisibility()
      this.refreshIKChain()
      return
    }
    this.syncGizmoVisibility() // 모드에 맞는 기즈모 — 이동 화살표 또는 회전 구 (종원 2026-09-14)
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
      let sumLen = 0
      for (let i = 0; i < this.filteredPairs.length; i++) {
        const [bone, parent] = this.filteredPairs[i]
        _boneMatrix.multiplyMatrices(_matrixWorldInv, bone.matrixWorld)
        _tail.setFromMatrixPosition(_boneMatrix)
        _parentMatrix.multiplyMatrices(_matrixWorldInv, parent.matrixWorld)
        _head.setFromMatrixPosition(_parentMatrix)
        _dir.subVectors(_tail, _head)
        const length = _dir.length()
        sumLen += length
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
        // 폭 = 길이·평균 블렌드 — 길이 100% 비례 시 긴/짧은 본 두께 편차 과함 (종원 2026-09-10)
        const effLen = this.avgBoneLength
          ? length * BONE_WIDTH_LENGTH_MIX + this.avgBoneLength * (1 - BONE_WIDTH_LENGTH_MIX)
          : length
        const width = effLen * BONE_WIDTH_RATIO
        _boneScale.set(width, length, width)
        _instanceMatrix.compose(_head, _quat, _boneScale)
        this.boneMesh.setMatrixAt(i, _instanceMatrix)
      }
      // 다음 프레임 두께 블렌드용 평균 갱신
      if (this.filteredPairs.length) this.avgBoneLength = sumLen / this.filteredPairs.length
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
      // 관절 인스턴스 위치가 매 프레임 바뀌므로 boundingSphere 재계산 필수 (종원 2026-09-10):
      // InstancedMesh.raycast 는 boundingSphere 로 광선 교차 프리체크 후 인스턴스를 검사 —
      // 갱신 안 하면 기본 포즈 구 밖으로 나간 말단 관절(뻗은 팔의 forearm/hand 등)의
      // hover/클릭 피킹이 통째로 스킵된다(렌더는 frustumCulled=false 라 보임)
      this.jointMesh.computeBoundingSphere()
    }

    // 캐릭터 루트 표시 — 루트 노드의 위치·회전을 따라가고 크기는 월드 m 고정(루트 스케일 역보정) (종원 2026-09-15)
    if (this.rootMarker && this.rootNode) {
      _boneMatrix.multiplyMatrices(_matrixWorldInv, this.rootNode.matrixWorld)
      _boneMatrix.decompose(this.rootMarker.position, this.rootMarker.quaternion, _vector)
      _scale.setFromMatrixScale(this.root.matrixWorld)
      this.rootMarker.scale.setScalar(ROOT_MARKER_SIZE / (Math.abs(_scale.x) || 1))
    }
    // 위치 편집 캐릭터 대상 표시 — hips 자리 구(원점 표시와 같은 월드 크기)
    if (this.hipsMarker?.visible && this.hipsBone) {
      _boneMatrix.multiplyMatrices(_matrixWorldInv, this.hipsBone.matrixWorld)
      this.hipsMarker.position.setFromMatrixPosition(_boneMatrix)
      _scale.setFromMatrixScale(this.root.matrixWorld)
      this.hipsMarker.scale.setScalar(ROOT_MARKER_SIZE / (Math.abs(_scale.x) || 1))
    }

    // 선택 관절(위치 편집 중엔 대상 노드) 기즈모 배치 — 월드 정렬·그 위치. 크기는 화면 px 고정이라 그릴 때 기즈모가 잡는다 (종원 2026-09-15)
    const gizmo = this.activeGizmo()
    const anchor = this.rootEditing ? this.positionNode() : this.highlightBone
    if (gizmo && anchor && gizmo.visible) {
      // 헬퍼 좌표계가 root 회전을 물려주므로 역보정 — 축이 항상 **월드 정렬** 유지.
      // 위치 = 선택 관절(이펙터) 실제 월드 위치. 드래그 타겟이 아니라 관절을 따라가야
      // hinge·도달반경 제약으로 관절이 타겟에 못 미치면 기즈모도 그 자리에 멈춘다 (종원 2026-09-10)
      _boneMatrix.multiplyMatrices(_matrixWorldInv, anchor.matrixWorld)
      _vector.setFromMatrixPosition(_boneMatrix)
      _rotMatrix.extractRotation(this.root.matrixWorld)
      gizmo.quaternion.setFromRotationMatrix(_rotMatrix).invert()
      gizmo.position.copy(_vector)
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
    this.moveGizmo?.dispose()
    this.rotateGizmo?.dispose()
    this.rootMarker?.dispose()
    this.hipsMarker?.dispose()
  }
}

/** 루트 편집 값 기록 — 기즈모·숫자 입력으로 루트를 바꾼 직후 */
function keepRootEdit(node: Object3D) {
  const edit = rootEdits.get(node)
  if (edit) {
    edit.position.copy(node.position)
    edit.quaternion.copy(node.quaternion)
  } else {
    rootEdits.set(node, { position: node.position.clone(), quaternion: node.quaternion.clone() })
  }
}

/** 루트 편집 유지 (종원 2026-09-15) — 믹서 적용 뒤 매 프레임(modelControl.updateOnFrame). 루트 노드에 트랙이 있는 모션(Armature 상수
 *  위치·회전 트랙)은 재생·액션 교체 때 믹서가 루트를 트랙 값으로 되돌려(실측: Serenade 재생 1초 뒤 편집 값이 풀림) 편집 값을 다시 입힌다.
 *  스켈레톤 헬퍼가 없어도(루트 편집을 끈 뒤) 유지. 트랙이 실제로 움직이는 루트면 그 움직임 대신 편집 값으로 고정된다 */
export function holdRootEdit(node: Object3D | undefined) {
  const edit = node && rootEdits.get(node)
  if (!node || !edit || (node.position.equals(edit.position) && node.quaternion.equals(edit.quaternion))) return
  node.position.copy(edit.position)
  node.quaternion.copy(edit.quaternion)
  node.updateMatrixWorld(true)
}

/** 쿼터니언 → XYZ 오일러, 직전 표시 값과 가장 가까운 표현 (Blender compatible euler 방식, 종원 2026-09-15).
 *  XYZ 분해는 가운데 Y 가 ±90° 에 묶여, Y 로 90° 넘게 돌리면 같은 회전이 (180, 180−y, 180) 으로 뒤집혀 보인다(쿼터니언은 연속).
 *  같은 회전의 두 표현 (x, y, z)·(x+π, π−y, z+π) 의 각 성분을 직전 값 ±π 안으로 감고 가까운 쪽을 고른다 */
export function compatibleEuler(q: Quaternion, prev: Euler | undefined): Euler {
  const a = new Euler().setFromQuaternion(q, 'XYZ')
  if (!prev) return a
  const b = new Euler(a.x + Math.PI, Math.PI - a.y, a.z + Math.PI, 'XYZ')
  const wrap = (v: number, ref: number) => v - 2 * Math.PI * Math.round((v - ref) / (2 * Math.PI))
  const dist = (e: Euler) => Math.abs(e.x - prev.x) + Math.abs(e.y - prev.y) + Math.abs(e.z - prev.z)
  for (const e of [a, b]) e.set(wrap(e.x, prev.x), wrap(e.y, prev.y), wrap(e.z, prev.z))
  return dist(a) <= dist(b) ? a : b
}

type HingeState = { axisLocal: Vector3; refQuat: Quaternion; bendRef: number; hyperExtend: number }

/** hinge 관절의 기준 대비 굽힘축 twist 각(부호, (-π, π]). 2·atan2(v·axis, w) 는 w<0(음의 이중 표현)이면 ±2π 어긋나므로 감는다 */
function hingeTwist(joint: Bone, hs: HingeState): number {
  _hgRel.copy(hs.refQuat).invert().multiply(joint.quaternion) // rel = 기준 대비 로컬 회전
  _hgVec.set(_hgRel.x, _hgRel.y, _hgRel.z)
  let theta = 2 * Math.atan2(_hgVec.dot(hs.axisLocal), _hgRel.w)
  if (theta > Math.PI) theta -= 2 * Math.PI
  else if (theta < -Math.PI) theta += 2 * Math.PI
  return theta
}

/** 직립(φ=0)에서 -10° 까지 */
function hingeMinTwist(hs: HingeState) {
  return -(hs.bendRef + hs.hyperExtend)
}

function hingeMaxTwist(hs: HingeState) {
  return Math.max(0, HINGE_MAX_BEND - hs.bendRef)
}

/** 원 위 두 각의 거리 [0, π] */
function angularDistance(a: number, b: number) {
  const d = Math.abs(a - b) % (2 * Math.PI)
  return d > Math.PI ? 2 * Math.PI - d : d
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
