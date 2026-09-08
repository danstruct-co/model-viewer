import {
  Bone,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
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
// 선택 관절 하이라이트 (종원 2026-09-08): 릭 선택 UI 의 선택 테두리와 동일 문법 —
// 초록 구를 감싸는 반투명 빨간 halo 구 (파랑 → 빨강, 종원 지시)
const HIGHLIGHT_COLOR = new Color(0xff0000) // 순수 R255 쨍한 빨강 (종원 2026-09-08)
const HIGHLIGHT_RADIUS_RATIO = 2.6
const JOINT_HOVER_SCALE = 2.0 // 관절 호버 확대 배율 (피킹 옵트인)
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
  private jointMesh?: InstancedMesh
  private jointBones?: Bone[]
  private boneMesh?: InstancedMesh
  private highlightBone?: Bone
  private highlightMesh?: Mesh
  private hoverIndex: number | null = null

  constructor(root: Object3D, filter?: SkeletonBoneFilter) {
    restoreBoneFlags(root)
    super(root)
    if (filter?.body?.length) {
      // GLTFLoader 는 노드명을 PropertyBinding.sanitizeNodeName 으로 정규화한다
      // ('腕.L'→'腕L' — 닷 제거 실측 2026-09-08). 필터명도 원문+정규화 양쪽으로 매칭.
      this.applyBoneFilter(toNameSet(filter.body), toNameSet(filter.fingers ?? []))
    }
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

    // 관절 구 (InstancedMesh 1개, 초록 단색) — body 매핑 본에만 (손가락은 구 없음)
    const joint = new InstancedMesh(
      new SphereGeometry(1, 10, 8),
      new MeshBasicMaterial({
        color: JOINT_COLOR,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
      bodyBones.length
    )
    joint.frustumCulled = false
    joint.renderOrder = this.renderOrder + 2 // 본 메시 위에 구 표시
    this.add(joint)
    this.jointMesh = joint
    this.jointBones = bodyBones
  }

  /** 관절 구 레이캐스트 피킹 — 맞은 관절의 본명/인덱스 (2026-09-08 릭 선택 연동) */
  pickJoint(raycaster: import('three').Raycaster): { name: string; index: number } | null {
    if (!this.jointMesh || !this.jointBones) return null
    const hit = raycaster.intersectObject(this.jointMesh, false)[0]
    if (hit?.instanceId == null) return null
    return { name: this.jointBones[hit.instanceId].name, index: hit.instanceId }
  }

  /** 호버 관절 확대 표시 (2배) — null 이면 해제 */
  setJointHover(index: number | null) {
    this.hoverIndex = index
  }

  /** 선택 관절 하이라이트 — 릭 선택 UI 와 연동 (종원 2026-09-08). name null 이면 해제.
   *  GLTFLoader 정규화(sanitizeNodeName) 대응으로 원문+정규화 양쪽 매칭 */
  setHighlightBone(name: string | null) {
    if (!name) {
      this.highlightBone = undefined
      if (this.highlightMesh) this.highlightMesh.visible = false
      return
    }
    const candidates = toNameSet([name])
    this.highlightBone = this.bones.find((bone) => candidates.has(bone.name))
    if (!this.highlightBone) {
      if (this.highlightMesh) this.highlightMesh.visible = false
      return
    }
    if (!this.highlightMesh) {
      const mesh = new Mesh(
        new SphereGeometry(1, 12, 10),
        new MeshBasicMaterial({
          color: HIGHLIGHT_COLOR,
          transparent: true,
          opacity: 0.75,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        })
      )
      mesh.frustumCulled = false
      mesh.renderOrder = this.renderOrder + 3 // 관절 구 위
      this.add(mesh)
      this.highlightMesh = mesh
    }
    this.highlightMesh.visible = true
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

    if (this.highlightMesh && this.highlightBone && this.highlightMesh.visible) {
      _scale.setFromMatrixScale(this.root.matrixWorld)
      const hs = (JOINT_RADIUS * HIGHLIGHT_RADIUS_RATIO) / (Math.abs(_scale.x) || 1)
      _boneMatrix.multiplyMatrices(_matrixWorldInv, this.highlightBone.matrixWorld)
      _vector.setFromMatrixPosition(_boneMatrix)
      this.highlightMesh.position.copy(_vector)
      this.highlightMesh.scale.setScalar(hs)
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
    if (this.highlightMesh) {
      this.highlightMesh.geometry.dispose()
      ;(this.highlightMesh.material as MeshBasicMaterial).dispose()
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
