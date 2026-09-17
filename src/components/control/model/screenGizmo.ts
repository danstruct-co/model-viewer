import {
  Color,
  DoubleSide,
  Group,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Camera,
  type Mesh,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Vector2,
} from 'three'

/**
 * 화면 크기 고정 관절 기즈모 공통 (종원 2026-09-15) — 이동·회전 기즈모가 같은 크기 계산·잡기·강조 규칙을 쓴다.
 * 크기 = 기즈모별 화면 px 반지름 고정(블렌더처럼 줌 무관) — 월드 크기(7.2cm)면 기본 줌에서 반지름 22px 라 핸들끼리 겹쳐 잡기
 * 어려웠다(2026-09-14 실측). 선 굵기도 화면 px 고정 — 기즈모 크기가 달라도 같은 굵기로 보인다.
 * 위치(선택 관절)·월드 정렬은 CustomSkeletonHelper 가 매 프레임 잡고, 크기·카메라 방향은 그리기 직전에 잡는다.
 * 픽·드래그는 마지막으로 그린 행렬 기준(보이는 그대로)
 */
export type GizmoHandle = 'x' | 'y' | 'z' | 'view' | 'trackball'

export const AXIS_HANDLES = ['x', 'y', 'z'] as const
export const AXIS_COLORS = [0xff0000, 0x00ff00, 0x0000ff] // 순수 RGB (종원 2026-09-08)
export const AXIS_DIRS = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
export const LINE_PX = 1.3 // 선 반굵기(화면 px) — 두께 약 2.6px
export const LINE_HOT_PX = 2.7 // 호버·드래그 중
export const OUTLINE_PX = 3.3 // 흰 원·링 뒤 반투명 검은 테두리 — 밝은 배경에서도 보이게
export const HOT_WHITE_MIX = 0.35 // 호버·드래그 중 색을 흰색 쪽으로
export const PICK_PX = 8 // 핸들 픽 허용 거리(px)
export const WHITE = new Color(0xffffff)

const _ndc = new Vector3()
const _camPos = new Vector3()
const _camZ = new Vector3()
const _center = new Vector3()
const _pos = new Vector3()
const _scl = new Vector3()
const _quat = new Quaternion()

export function toPx(world: Vector3, camera: Camera, viewport: Vector2, out: Vector2) {
  _ndc.copy(world).project(camera)
  return out.set(((_ndc.x + 1) / 2) * viewport.x, ((1 - _ndc.y) / 2) * viewport.y)
}

export function distToSegment(p: Vector2, a: Vector2, b: Vector2) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t)
}

export function overlayMaterial(color: number, opacity: number) {
  return new MeshBasicMaterial({
    color,
    opacity,
    transparent: true, // transparent 큐 — 본·관절 구 위에 그린다
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  })
}

/** 기즈모 중심 깊이에서 화면 1px 의 월드 길이 */
function worldPerPixel(camera: Camera, center: Vector3, viewportHeight: number) {
  const ortho = camera as OrthographicCamera
  if (ortho.isOrthographicCamera) return (ortho.top - ortho.bottom) / ortho.zoom / viewportHeight
  const persp = camera as PerspectiveCamera
  _camZ.setFromMatrixColumn(persp.matrixWorld, 2).normalize() // 카메라 +Z(시선 반대) 월드 방향
  const depth = Math.max(1e-6, _camPos.setFromMatrixPosition(persp.matrixWorld).sub(center).dot(_camZ))
  return (2 * depth * Math.tan((persp.fov * Math.PI) / 360)) / persp.zoom / viewportHeight
}

export default abstract class ScreenGizmo extends Group {
  hover: GizmoHandle | null = null
  active: GizmoHandle | null = null
  /** 기즈모 반지름(화면 px) — 지오메트리는 반지름 1 기준으로 만들고 그릴 때 이 크기로 늘린다 */
  protected readonly radiusPx: number
  /** frame() 결과(월드) — 기즈모 중심·중심→카메라 방향·카메라 오른쪽/위 */
  protected readonly center = new Vector3()
  protected readonly toCam = new Vector3()
  protected readonly camRight = new Vector3()
  protected readonly camUp = new Vector3()

  constructor(radiusPx: number) {
    super()
    this.radiusPx = radiusPx
  }

  abstract pick(camera: Camera, pointer: Vector2, viewport: Vector2): GizmoHandle | null
  abstract dispose(): void
  /** 호버·드래그 상태에 맞춰 굵기·색·표시 갱신 */
  protected abstract refreshLook(): void

  /** 화면 px 굵기 → 반지름 1 기준 지오메트리 굵기 (선 굵기는 기즈모 크기와 무관하게 px 고정) */
  protected tube(px: number) {
    return px / this.radiusPx
  }

  /** 화면 radiusPx 가 되는 월드 반지름(기즈모 중심 깊이 기준) — 그리기·픽 공용 */
  worldRadius(camera: Camera, viewportHeight: number) {
    _center.setFromMatrixPosition(this.matrixWorld)
    return this.radiusPx * worldPerPixel(camera, _center, Math.max(1, viewportHeight))
  }

  setHover(handle: GizmoHandle | null) {
    if (this.hover === handle) return
    this.hover = handle
    this.refreshLook()
  }

  /** 드래그 표시 끝 — 모든 핸들이 다시 보인다 */
  endDrag() {
    this.active = null
    this.refreshLook()
  }

  /** 중심·반지름·카메라 방향 갱신 — 픽·드래그 시작 공용 */
  protected frame(camera: Camera, viewport: Vector2) {
    const radius = this.worldRadius(camera, viewport.y)
    this.center.setFromMatrixPosition(this.matrixWorld)
    this.toCam.setFromMatrixPosition(camera.matrixWorld).sub(this.center).normalize()
    this.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    return radius
  }

  /** 그리기 직전 월드 행렬 = 기즈모 위치 · 방향(월드 정렬 핸들 / faceCamera 면 카메라를 향함) · 화면 px 고정 크기 */
  protected placeOnRender(mesh: Mesh, faceCamera: boolean) {
    mesh.onBeforeRender = (renderer, _scene, camera) => {
      this.matrixWorld.decompose(_pos, _quat, _scl)
      const radius = this.worldRadius(camera, renderer.domElement.clientHeight)
      if (faceCamera) camera.getWorldQuaternion(_quat)
      else _quat.multiply(mesh.quaternion)
      mesh.matrixWorld.compose(_pos, _quat, _scl.setScalar(radius))
    }
  }
}
