import {
  CircleGeometry,
  Color,
  Mesh,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  type Camera,
  type MeshBasicMaterial,
  type Quaternion,
} from 'three'
import ScreenGizmo, {
  AXIS_COLORS,
  AXIS_HANDLES,
  HOT_WHITE_MIX,
  LINE_HOT_PX,
  LINE_PX,
  OUTLINE_PX,
  PICK_PX,
  WHITE,
  distToSegment,
  overlayMaterial,
  toPx,
  type GizmoHandle,
} from './screenGizmo'

/**
 * 관절 회전 기즈모 (종원 2026-09-14) — 블렌더 회전 기즈모 형태: X/Y/Z 축 링(카메라 쪽 반원만 보여 구 윤곽이 됨,
 * 축 = 월드 축 또는 선택 관절 로컬 축 — 좌표계, 종원 2026-10-01)
 * + 바깥 흰 화면 링(시선축 = 관절→카메라 방향 회전) + 구 안쪽 트랙볼(자유 회전, 호버 시 옅게 표시).
 * 링 = 화면에서 기즈모 중심을 도는 각도만큼 회전(축이 카메라 반대쪽을 향하면 부호 반전), 트랙볼 = 시작점 대비 끈 거리·방향.
 * 크기(화면 px 고정)·잡기·강조 규칙은 ScreenGizmo 공통 (종원 2026-09-15)
 */

const RADIUS_PX = 40 // 축 링 반지름(화면 px) — 60px 에서 2/3 로 줄임 (종원 2026-09-15)
/** 링 평면 기저 — 링 점 = 중심 + r(cosθ·u + sinθ·v), 법선 = 축 */
const AXIS_BASIS = [
  [new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
  [new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
  [new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
] as const
const VIEW_RING_RADIUS = 1.2 // 화면 링은 축 링 바깥
const BACK_CLIP = -0.02 // 축 링 뒤쪽 반구 숨김 문턱(중심→카메라 방향 성분, 반지름 대비) — 그리기·픽 공용
const RING_SAMPLES = 72
const MIN_ANGLE_PX = 3 // 포인터가 중심에 너무 가까우면 각도가 튀어 누적하지 않음
const TRACKBALL_RAD_PER_PX = 0.01 // 트랙볼 감도 — 1px ≈ 0.57°

const _p = new Vector3()
const _u = new Vector3()
const _v = new Vector3()
const _a = new Vector2()
const _b = new Vector2()
const _cPx = new Vector2()

type RotateDrag = {
  handle: GizmoHandle
  /** 회전축(월드) — 트랙볼은 드래그마다 계산 */
  axis: Vector3
  /** 화면 반시계 → 월드 회전 부호 */
  sign: number
  /** 기즈모 중심(px) — 드래그 동안 불변(카메라 회전 잠금, 관절 자기 회전이라 위치 불변) */
  center: Vector2
  start: Vector2
  /** 직전 포인터(중심 기준, y 위 +) */
  prev: Vector2
  /** 누적 회전각(rad) */
  total: number
  right: Vector3
  up: Vector3
}

/** 축 링 재질 — 중심 기준 카메라 반대쪽 반구를 버린다(블렌더처럼 앞쪽 반원만) */
function createAxisRingMaterial(color: number) {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) } },
    vertexShader: /* glsl */ `
      varying float vFront;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vFront = dot(world.xyz - center, normalize(cameraPosition - center)) / length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      varying float vFront;
      void main() {
        if (vFront < ${BACK_CLIP.toFixed(3)}) discard;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: true, // transparent 큐 — 본·관절 구 위에 그린다(이동 기즈모와 같은 이유)
  })
}

export default class RotateGizmo extends ScreenGizmo {
  private readonly ringGeo = new TorusGeometry(1, this.tube(LINE_PX), 6, 96)
  private readonly ringHotGeo = new TorusGeometry(1, this.tube(LINE_HOT_PX), 6, 96)
  private readonly viewGeo = new TorusGeometry(VIEW_RING_RADIUS, this.tube(LINE_PX), 6, 96)
  private readonly viewHotGeo = new TorusGeometry(VIEW_RING_RADIUS, this.tube(LINE_HOT_PX), 6, 96)
  private readonly rings: Mesh<TorusGeometry, ShaderMaterial>[]
  private readonly viewRing: Mesh<TorusGeometry, MeshBasicMaterial>
  private readonly viewOutline: Mesh<TorusGeometry, MeshBasicMaterial>
  private readonly trackball: Mesh<CircleGeometry, MeshBasicMaterial>
  private drag?: RotateDrag

  constructor(renderOrder: number) {
    super(RADIUS_PX)
    this.trackball = new Mesh(new CircleGeometry(1, 48), overlayMaterial(0xffffff, 0.18))
    this.viewOutline = new Mesh(
      new TorusGeometry(VIEW_RING_RADIUS, this.tube(OUTLINE_PX), 6, 96),
      overlayMaterial(0x000000, 0.3)
    )
    this.viewRing = new Mesh(this.viewGeo, overlayMaterial(0xffffff, 1))
    this.rings = AXIS_COLORS.map((color) => new Mesh(this.ringGeo, createAxisRingMaterial(color)))
    this.rings[0].rotation.y = Math.PI / 2 // 토러스 기본 법선 +Z → +X
    this.rings[1].rotation.x = -Math.PI / 2 // → +Y
    // 깊이 테스트 없이 겹침 순서로 표시 — 트랙볼 < 화면 링 테두리 < 화면 링 < 축 링
    ;[this.trackball, this.viewOutline, this.viewRing, ...this.rings].forEach((mesh, i) => {
      this.placeOnRender(mesh, i < 3)
      mesh.renderOrder = renderOrder + Math.min(i, 3)
      mesh.frustumCulled = false
      this.add(mesh)
    })
    this.refreshLook()
  }

  /** 호버·드래그 중인 핸들 = 굵고 밝게. 드래그 중엔 잡은 링만 보인다(블렌더) */
  protected refreshLook() {
    const hot = this.active ?? this.hover
    AXIS_HANDLES.forEach((handle, i) => {
      const ring = this.rings[i]
      ring.visible = !this.active || this.active === handle
      ring.geometry = hot === handle ? this.ringHotGeo : this.ringGeo
      ring.material.uniforms.color.value.setHex(AXIS_COLORS[i]).lerp(WHITE, hot === handle ? HOT_WHITE_MIX : 0)
    })
    this.viewRing.visible = this.viewOutline.visible = !this.active || this.active === 'view'
    this.viewRing.geometry = hot === 'view' ? this.viewHotGeo : this.viewGeo
    this.trackball.visible = hot === 'trackball'
  }

  /** 화면 px 픽 — 가장 가까운 링(축 링은 보이는 앞쪽 반원만)이 PICK_PX 이내면 그 링, 아니면 구 안쪽 = 트랙볼 */
  pick(camera: Camera, pointer: Vector2, viewport: Vector2): GizmoHandle | null {
    const radius = this.frame(camera, viewport)
    toPx(this.center, camera, viewport, _cPx)
    let best: GizmoHandle | null = null
    let bestDist = PICK_PX
    for (let i = 0; i < AXIS_HANDLES.length; i++) {
      // 링 평면 기저를 기즈모 방향으로 — 로컬 좌표계면 관절 축 링
      const u = _u.copy(AXIS_BASIS[i][0]).applyQuaternion(this.orient)
      const v = _v.copy(AXIS_BASIS[i][1]).applyQuaternion(this.orient)
      let prevFront = false
      for (let s = 0; s <= RING_SAMPLES; s++) {
        const t = (s / RING_SAMPLES) * Math.PI * 2
        _p.copy(u).multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t))
        const front = _p.dot(this.toCam) >= BACK_CLIP
        toPx(_p.multiplyScalar(radius).add(this.center), camera, viewport, _b)
        if (front && prevFront) {
          const d = distToSegment(pointer, _a, _b)
          if (d < bestDist) {
            bestDist = d
            best = AXIS_HANDLES[i]
          }
        }
        _a.copy(_b)
        prevFront = front
      }
    }
    const centerDist = pointer.distanceTo(_cPx)
    const ringPx = toPx(_p.copy(this.camRight).multiplyScalar(radius).add(this.center), camera, viewport, _b).distanceTo(_cPx)
    if (Math.abs(centerDist - ringPx * VIEW_RING_RADIUS) < bestDist) best = 'view'
    if (best) return best
    return centerDist <= ringPx ? 'trackball' : null
  }

  beginDrag(handle: GizmoHandle, camera: Camera, pointer: Vector2, viewport: Vector2) {
    this.frame(camera, viewport)
    const axis =
      handle === 'view'
        ? this.toCam.clone()
        : handle === 'trackball'
          ? new Vector3()
          : this.axes[AXIS_HANDLES.indexOf(handle)].clone()
    const center = toPx(this.center, camera, viewport, new Vector2())
    this.drag = {
      handle,
      axis,
      // 축이 카메라 쪽이면 화면 반시계 = +회전, 반대쪽이면 부호 반전 — 드래그 동안 카메라가 고정이라 시작 때 한 번
      sign: handle === 'view' || axis.dot(this.toCam) >= 0 ? 1 : -1,
      center,
      start: pointer.clone(),
      prev: new Vector2(pointer.x - center.x, center.y - pointer.y),
      total: 0,
      right: this.camRight.clone(),
      up: this.camUp.clone(),
    }
    this.active = handle
    this.refreshLook()
  }

  /** 드래그 시작 대비 월드 회전 */
  dragTo(pointer: Vector2, out: Quaternion): Quaternion {
    const drag = this.drag
    if (!drag) return out.identity()
    if (drag.handle === 'trackball') {
      // 오른쪽으로 끌면 카메라 위축 기준 +, 아래로 끌면 카메라 오른쪽축 기준 + — 구 앞면이 포인터를 따라간다
      const dx = pointer.x - drag.start.x
      const dy = pointer.y - drag.start.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-6) return out.identity()
      _p.copy(drag.up).multiplyScalar(dx).addScaledVector(drag.right, dy).normalize()
      return out.setFromAxisAngle(_p, len * TRACKBALL_RAD_PER_PX)
    }
    const vx = pointer.x - drag.center.x
    const vy = drag.center.y - pointer.y
    if (Math.hypot(vx, vy) >= MIN_ANGLE_PX) {
      // 직전 대비 증분을 누적 — 한 바퀴를 넘겨 돌려도 끊기지 않는다
      drag.total += Math.atan2(drag.prev.x * vy - drag.prev.y * vx, drag.prev.x * vx + drag.prev.y * vy)
      drag.prev.set(vx, vy)
    }
    return out.setFromAxisAngle(drag.axis, drag.sign * drag.total)
  }

  endDrag() {
    this.drag = undefined
    super.endDrag()
  }

  dispose() {
    for (const geometry of [
      this.ringGeo,
      this.ringHotGeo,
      this.viewGeo,
      this.viewHotGeo,
      this.viewOutline.geometry,
      this.trackball.geometry,
    ]) {
      geometry.dispose()
    }
    for (const mesh of [...this.rings, this.viewRing, this.viewOutline, this.trackball]) mesh.material.dispose()
  }
}
