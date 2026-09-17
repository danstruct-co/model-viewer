import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three'

/**
 * 캐릭터 루트 표시 (종원 2026-09-15) — 위치 편집 중 대상에만 보인다: 원점 = 리그 루트 자리에 분홍 구 + 바닥 원 + 정면(+Z) 화살표,
 * 캐릭터 = hips 자리에 구만(sphereOnly).
 * 루트 = Hips 위 최상위 본의 부모 노드(Armature 같은 리그 루트) — CustomSkeletonHelper 가 고르고 켠다(setRootEditing).
 * 루트 노드의 위치·회전을 그대로 따라가 루트 트랜스폼을 바꾸면 결과가 바로 보인다. 크기는 월드 m 고정(관절 구처럼 헬퍼가
 * 루트 스케일을 역보정), 다른 스켈레톤 표시처럼 깊이를 무시하고 위에 그린다
 */
const ROOT_COLOR = 0xee46bc // xstage-pink-500 — 관절(초록)·본(파랑)·IK 체인(주황)·기즈모(RGB)와 겹치지 않는 색
export const ROOT_MARKER_SIZE = 0.15 // 바닥 원 반지름(m)
const LINE_RADIUS = 0.03 // 선 굵기(원 반지름 대비)
const SPHERE_RADIUS = 0.16 // 루트 자리 구(원 반지름 대비) — 약 2.4cm, 관절 구(1.2cm)의 2배

export default class RootMarker extends Group {
  private readonly material = new MeshBasicMaterial({
    color: ROOT_COLOR,
    transparent: true, // transparent 큐 — 캐릭터 위에 보이게
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })

  /** 반지름 1 단위 형상 — 헬퍼가 scale 로 월드 크기를 맞춘다. sphereOnly = 구만(위치 편집 캐릭터 대상 hips 표시, 종원 2026-09-15) */
  constructor(renderOrder: number, sphereOnly = false) {
    super()
    const geometries: BufferGeometry[] = [new SphereGeometry(SPHERE_RADIUS, 16, 12)]
    if (!sphereOnly) {
      const ring = new TorusGeometry(1, LINE_RADIUS, 6, 64)
      ring.rotateX(Math.PI / 2) // XY 평면 → 루트 로컬 XZ(바닥) 평면
      const shaft = new CylinderGeometry(LINE_RADIUS, LINE_RADIUS, 1.2, 8)
      shaft.translate(0, 0.6, 0)
      shaft.rotateX(Math.PI / 2) // +Y → +Z (정면)
      const head = new ConeGeometry(0.09, 0.3, 16)
      head.translate(0, 1.35, 0)
      head.rotateX(Math.PI / 2)
      geometries.push(ring, shaft, head)
    }
    for (const geometry of geometries) {
      const mesh = new Mesh(geometry, this.material)
      mesh.renderOrder = renderOrder
      mesh.frustumCulled = false
      this.add(mesh)
    }
    this.visible = false // 루트 편집 중에만 — 헬퍼가 켠다
  }

  dispose() {
    for (const child of this.children) (child as Mesh).geometry.dispose()
    this.material.dispose()
  }
}
