import {
  Bone,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  PropertyBinding,
  SkeletonHelper,
  SkinnedMesh,
  SphereGeometry,
  Vector3,
} from 'three'

const _vector = new Vector3()
const _scale = new Vector3()
const _boneMatrix = new Matrix4()
const _instanceMatrix = new Matrix4()
const _matrixWorldInv = new Matrix4()

// 관절 구 표시 (종원 2026-09-08 확정): config body 본에만 초록 구 — 미매핑 본은 라인도 구도 없음
const JOINT_RADIUS = 0.012 // 월드 m — 루트 스케일(autoFit 등) 역보정으로 상수 크기 유지
const JOINT_COLOR = new Color(0x22cc44)

/**
 * GLB 변환 과정에서 isBone 플래그가 사라진 노드를 복원한 뒤 SkeletonHelper를 생성하는 커스텀 클래스
 *
 * glTF 스펙에서는 Bone 타입이 없고, skin.joints에 참조된 노드만 Bone으로 인스턴스화됨.
 * SkinnedMesh가 없는 모델(애니메이션만 있는 경우)에서는 모든 본이 Object3D로 로드되어
 * SkeletonHelper가 빈 geometry를 생성하는 문제를 해결함.
 *
 * boneNames 필터(옵션, 종원 2026-09-08): 지정 본만 그린다 — 각 본을 **최근접 허용 조상**과
 * 직결(미매핑 중간 본은 라인·구 모두 생략), 관절마다 초록 구 표시.
 * (중간 본 경유+노랑 구 버전은 실험 후 종원 지시로 철회 — 이 파일 이력 참조)
 */
export default class CustomSkeletonHelper extends SkeletonHelper {
  private filteredPairs?: [Bone, Bone][]
  private jointMesh?: InstancedMesh
  private jointBones?: Bone[]

  constructor(root: Object3D, boneNames?: string[]) {
    restoreBoneFlags(root)
    super(root)
    if (boneNames?.length) {
      // GLTFLoader 는 노드명을 PropertyBinding.sanitizeNodeName 으로 정규화한다
      // ('腕.L'→'腕L' — 닷 제거 실측 2026-09-08). 필터명도 원문+정규화 양쪽으로 매칭.
      const nameSet = new Set<string>()
      for (const name of boneNames) {
        nameSet.add(name)
        nameSet.add(PropertyBinding.sanitizeNodeName(name))
      }
      this.applyBoneFilter(nameSet)
    }
  }

  private applyBoneFilter(nameSet: Set<string>) {
    const allowed = this.bones.filter((bone) => nameSet.has(bone.name))
    if (allowed.length === 0) return // 이름이 하나도 안 맞으면 전체 표시 유지 (필터 오폭 방지)
    const allowedSet = new Set<Object3D>(allowed)

    // 세그먼트 = 허용 본 → 최근접 허용 조상 직결 (중간 미매핑 본은 그리지 않음)
    const pairs: [Bone, Bone][] = []
    for (const bone of allowed) {
      let parent: Object3D | null = bone.parent
      while (parent && !allowedSet.has(parent)) parent = parent.parent
      if (parent) pairs.push([bone, parent as Bone])
    }
    if (pairs.length === 0) return

    const geometry = new BufferGeometry()
    const vertices: number[] = []
    const colors: number[] = []
    const color1 = new Color(0, 0, 1)
    const color2 = new Color(0, 1, 0)
    for (let i = 0; i < pairs.length; i++) {
      vertices.push(0, 0, 0, 0, 0, 0)
      colors.push(color1.r, color1.g, color1.b, color2.r, color2.g, color2.b)
    }
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.geometry.dispose()
    this.geometry = geometry
    this.filteredPairs = pairs

    // 관절 구 (InstancedMesh 1개, 초록 단색) — config 매핑 본에만
    const joint = new InstancedMesh(
      new SphereGeometry(1, 10, 8),
      new MeshBasicMaterial({
        color: JOINT_COLOR,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
      allowed.length
    )
    joint.frustumCulled = false
    joint.renderOrder = this.renderOrder + 1
    this.add(joint)
    this.jointMesh = joint
    this.jointBones = allowed
  }

  updateMatrixWorld(force?: boolean) {
    if (!this.filteredPairs) {
      super.updateMatrixWorld(force)
      return
    }
    // three SkeletonHelper.updateMatrixWorld 와 동일 산식 — 본 목록만 필터 쌍으로 대체
    const position = this.geometry.getAttribute('position')
    _matrixWorldInv.copy(this.root.matrixWorld).invert()
    let j = 0
    for (const [bone, parent] of this.filteredPairs) {
      _boneMatrix.multiplyMatrices(_matrixWorldInv, bone.matrixWorld)
      _vector.setFromMatrixPosition(_boneMatrix)
      position.setXYZ(j, _vector.x, _vector.y, _vector.z)
      _boneMatrix.multiplyMatrices(_matrixWorldInv, parent.matrixWorld)
      _vector.setFromMatrixPosition(_boneMatrix)
      position.setXYZ(j + 1, _vector.x, _vector.y, _vector.z)
      j += 2
    }
    position.needsUpdate = true

    if (this.jointMesh && this.jointBones) {
      // 헬퍼 좌표계는 root.matrixWorld — 루트 스케일(autoFit·cm 릭 0.01 등)을 역보정해
      // 구가 화면상 상수 크기(JOINT_RADIUS m)를 유지하게 한다
      _scale.setFromMatrixScale(this.root.matrixWorld)
      const s = JOINT_RADIUS / (Math.abs(_scale.x) || 1)
      for (let i = 0; i < this.jointBones.length; i++) {
        _boneMatrix.multiplyMatrices(_matrixWorldInv, this.jointBones[i].matrixWorld)
        _vector.setFromMatrixPosition(_boneMatrix)
        _instanceMatrix.makeScale(s, s, s).setPosition(_vector)
        this.jointMesh.setMatrixAt(i, _instanceMatrix)
      }
      this.jointMesh.instanceMatrix.needsUpdate = true
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
  }
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
