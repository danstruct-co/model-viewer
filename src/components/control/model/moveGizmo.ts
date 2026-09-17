import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  Plane,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type MeshBasicMaterial,
  type Ray,
} from 'three'
import ScreenGizmo, {
  AXIS_COLORS,
  AXIS_DIRS,
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
 * 관절 이동 기즈모 (종원 2026-09-15 — 회전 기즈모와 같은 크기 계산·잡기·강조로 개편): 월드 X/Y/Z 화살표 + 가운데 흰 원.
 * 화살표 = 그 월드 축 직선 위에서 포인터 광선과 가장 가까운 점으로 IK 타겟 이동, 흰 원 = 관절을 지나고 시선(관절→카메라)에
 * 수직인 면 위에서 포인터를 그대로 따라감(회전 기즈모 흰 링과 같은 시선축). 시선과 거의 평행한 화살표는 화면에서 점처럼
 * 짧아져 잡기 어려워 옅게 숨긴다. 이전 월드 크기 단색 실린더 축 기즈모(2026-09-08)를 대체
 */
const RADIUS_PX = 60 // 화살표 끝(화면 px)
const VIEW_CIRCLE_RADIUS = 0.18 // 가운데 흰 원 반지름(기즈모 대비) — 약 11px
const SHAFT_START = 0.28 // 화살표는 흰 원 바깥에서 시작
const CONE_START = 0.8 // 화살촉 시작(끝 = 1)
const CONE_RADIUS = 0.07
const CONE_RADIUS_HOT = 0.09
const FACING_FADE_START = 0.93 // 축이 시선과 이만큼 평행해지면(|cos|) 옅어지기 시작
const FACING_FADE_END = 0.985 // 완전히 숨김
const FACING_PICK_MAX = 0.97 // 이 이상 평행하면 잡기 제외(거의 투명)

const _p = new Vector3()
const _w0 = new Vector3()
const _hit = new Vector3()
const _a = new Vector2()
const _b = new Vector2()
const _cPx = new Vector2()

type MoveDrag = { origin: Vector3; axis: Vector3; startT: number } | { origin: Vector3; plane: Plane; hit0: Vector3 }
type ArrowPart = Mesh<BufferGeometry, ShaderMaterial>

/** 광선과 축 직선(origin + dir·t)의 최근접 축 파라미터 t — t = (e − b·d)/(1 − b²), b=ray·dir, d=ray·w0, e=dir·w0 (w0=rayO−origin) */
function closestT(ray: Ray, origin: Vector3, dir: Vector3) {
  _w0.subVectors(ray.origin, origin)
  const b = ray.direction.dot(dir)
  const d = ray.direction.dot(_w0)
  const e = dir.dot(_w0)
  const denom = 1 - b * b
  if (Math.abs(denom) < 1e-6) return e // 시선과 평행 — 근사
  return (e - b * d) / denom
}

/** 화살표 재질 — 축이 시선과 거의 평행하면 옅어진다(화살표 로컬 +Y = 축 방향) */
function createArrowMaterial(color: number) {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) } },
    vertexShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 dir = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float facing = abs(dot(dir, normalize(cameraPosition - center)));
        vAlpha = 1.0 - smoothstep(${FACING_FADE_START.toFixed(3)}, ${FACING_FADE_END.toFixed(3)}, facing);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      varying float vAlpha;
      void main() {
        if (vAlpha < 0.02) discard;
        gl_FragColor = vec4(color, vAlpha);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: true, // transparent 큐 — 본·관절 구 위에 그린다
  })
}

/** +Y 방향 화살표 몸통 — 흰 원 바깥에서 화살촉 시작까지 */
function shaftGeometry(radius: number) {
  const geometry = new CylinderGeometry(radius, radius, CONE_START - SHAFT_START, 8)
  geometry.translate(0, (SHAFT_START + CONE_START) / 2, 0)
  return geometry
}

/** +Y 방향 화살촉 — 끝 = 기즈모 반지름 */
function coneGeometry(radius: number) {
  const geometry = new ConeGeometry(radius, 1 - CONE_START, 16)
  geometry.translate(0, (CONE_START + 1) / 2, 0)
  return geometry
}

export default class MoveGizmo extends ScreenGizmo {
  private readonly shaftGeo = shaftGeometry(this.tube(LINE_PX))
  private readonly shaftHotGeo = shaftGeometry(this.tube(LINE_HOT_PX))
  private readonly coneGeo = coneGeometry(CONE_RADIUS)
  private readonly coneHotGeo = coneGeometry(CONE_RADIUS_HOT)
  private readonly viewGeo = new TorusGeometry(VIEW_CIRCLE_RADIUS, this.tube(LINE_PX), 6, 48)
  private readonly viewHotGeo = new TorusGeometry(VIEW_CIRCLE_RADIUS, this.tube(LINE_HOT_PX), 6, 48)
  /** 축별 [몸통, 화살촉] — 재질 공유 */
  private readonly arrows: [ArrowPart, ArrowPart][]
  private readonly viewCircle: Mesh<TorusGeometry, MeshBasicMaterial>
  private readonly viewOutline: Mesh<TorusGeometry, MeshBasicMaterial>
  private drag?: MoveDrag

  constructor(renderOrder: number) {
    super(RADIUS_PX)
    this.viewOutline = new Mesh(
      new TorusGeometry(VIEW_CIRCLE_RADIUS, this.tube(OUTLINE_PX), 6, 48),
      overlayMaterial(0x000000, 0.3)
    )
    this.viewCircle = new Mesh(this.viewGeo, overlayMaterial(0xffffff, 1))
    this.arrows = AXIS_COLORS.map((color, i) => {
      const material = createArrowMaterial(color)
      const parts: [ArrowPart, ArrowPart] = [new Mesh(this.shaftGeo, material), new Mesh(this.coneGeo, material)]
      for (const part of parts) {
        if (i === 0) part.rotation.z = -Math.PI / 2 // +Y → +X
        if (i === 2) part.rotation.x = Math.PI / 2 // +Y → +Z
      }
      return parts
    })
    // 깊이 테스트 없이 겹침 순서로 표시 — 흰 원 테두리 < 흰 원 < 화살표
    ;[this.viewOutline, this.viewCircle, ...this.arrows.flat()].forEach((mesh, i) => {
      this.placeOnRender(mesh, i < 2)
      mesh.renderOrder = renderOrder + Math.min(i, 2)
      mesh.frustumCulled = false
      this.add(mesh)
    })
    this.refreshLook()
  }

  /** 호버·드래그 중인 핸들 = 굵고 밝게. 드래그 중엔 잡은 핸들만 보인다(블렌더) */
  protected refreshLook() {
    const hot = this.active ?? this.hover
    AXIS_HANDLES.forEach((handle, i) => {
      const [shaft, cone] = this.arrows[i]
      shaft.visible = cone.visible = !this.active || this.active === handle
      shaft.geometry = hot === handle ? this.shaftHotGeo : this.shaftGeo
      cone.geometry = hot === handle ? this.coneHotGeo : this.coneGeo
      shaft.material.uniforms.color.value.setHex(AXIS_COLORS[i]).lerp(WHITE, hot === handle ? HOT_WHITE_MIX : 0)
    })
    this.viewCircle.visible = this.viewOutline.visible = !this.active || this.active === 'view'
    this.viewCircle.geometry = hot === 'view' ? this.viewHotGeo : this.viewGeo
  }

  /** 화면 px 픽 — 가운데 흰 원 안쪽이면 화면 이동, 아니면 가장 가까운 화살표(시선과 거의 평행한 축 제외)가 PICK_PX 이내면 그 축 */
  pick(camera: Camera, pointer: Vector2, viewport: Vector2): GizmoHandle | null {
    const radius = this.frame(camera, viewport)
    toPx(this.center, camera, viewport, _cPx)
    const circleEdge = _p.copy(this.camRight).multiplyScalar(radius * VIEW_CIRCLE_RADIUS).add(this.center)
    if (pointer.distanceTo(_cPx) <= toPx(circleEdge, camera, viewport, _b).distanceTo(_cPx) + PICK_PX / 2) return 'view'
    let best: GizmoHandle | null = null
    let bestDist = PICK_PX
    for (let i = 0; i < AXIS_HANDLES.length; i++) {
      const dir = AXIS_DIRS[i]
      if (Math.abs(dir.dot(this.toCam)) >= FACING_PICK_MAX) continue
      toPx(_p.copy(dir).multiplyScalar(radius * SHAFT_START).add(this.center), camera, viewport, _a)
      toPx(_p.copy(dir).multiplyScalar(radius).add(this.center), camera, viewport, _b)
      const d = distToSegment(pointer, _a, _b)
      if (d < bestDist) {
        bestDist = d
        best = AXIS_HANDLES[i]
      }
    }
    return best
  }

  /** 드래그 시작 — 기준점 = 지금 기즈모 중심(선택 관절). 흰 원은 관절을 지나고 시선에 수직인 면을 잡는다 */
  beginDrag(handle: GizmoHandle, camera: Camera, ray: Ray, viewport: Vector2): boolean {
    this.frame(camera, viewport)
    const origin = this.center.clone()
    if (handle === 'view') {
      const plane = new Plane().setFromNormalAndCoplanarPoint(this.toCam, origin)
      const hit0 = ray.intersectPlane(plane, new Vector3())
      if (!hit0) return false
      this.drag = { origin, plane, hit0 }
    } else if (handle === 'x' || handle === 'y' || handle === 'z') {
      const axis = AXIS_DIRS[AXIS_HANDLES.indexOf(handle)]
      this.drag = { origin, axis, startT: closestT(ray, origin, axis) }
    } else {
      return false
    }
    this.active = handle
    this.refreshLook()
    return true
  }

  /** 드래그 시작 대비 IK 타겟(월드) — 흰 원: 면 위 포인터 이동량 그대로, 화살표: 축 위 최근접 점 이동량 */
  dragTo(ray: Ray, out: Vector3): Vector3 | null {
    const drag = this.drag
    if (!drag) return null
    if ('plane' in drag) {
      if (!ray.intersectPlane(drag.plane, _hit)) return null
      return out.subVectors(_hit, drag.hit0).add(drag.origin)
    }
    return out.copy(drag.axis).multiplyScalar(closestT(ray, drag.origin, drag.axis) - drag.startT).add(drag.origin)
  }

  endDrag() {
    this.drag = undefined
    super.endDrag()
  }

  dispose() {
    for (const geometry of [
      this.shaftGeo,
      this.shaftHotGeo,
      this.coneGeo,
      this.coneHotGeo,
      this.viewGeo,
      this.viewHotGeo,
      this.viewOutline.geometry,
    ]) {
      geometry.dispose()
    }
    for (const [shaft] of this.arrows) shaft.material.dispose()
    this.viewCircle.material.dispose()
    this.viewOutline.material.dispose()
  }
}
