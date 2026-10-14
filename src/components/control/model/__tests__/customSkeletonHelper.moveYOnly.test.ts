import { describe, expect, it } from 'vitest'
import { Bone, Object3D, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three'
import CustomSkeletonHelper from '../customSkeletonHelper'
import MoveGizmo from '../moveGizmo'

// 제자리 모션 중 이동 기즈모 = 위아래 화살표만 (종원 2026-10-13) — 위치 편집(원점·캐릭터)뿐 아니라 모션 편집의 Hips 이동도.
// 굽기 끝 제자리가 hips 수평 위치를 원점에 고정해, 옆으로 옮긴 Hips 는 화면엔 보이고 저장·다운로드에선 지워졌다(스튜디오 QA 2026-10-13 섞기 C3, 21cm)

function makeHelper() {
  const root = new Object3D()
  const bone = (name: string, parent: Object3D, y: number) => {
    const b = new Bone()
    b.name = name
    b.position.set(0, y, 0)
    parent.add(b)
    return b
  }
  const hips = bone('Hips', root, 1)
  const spine = bone('Spine', hips, 0.2)
  bone('Head', spine, 0.4)
  const helper = new CustomSkeletonHelper(root, { body: ['Hips', 'Spine', 'Head'], hips: 'Hips' })
  helper.setGizmoMode('move')
  return Object.assign(helper, { testRoot: root })
}

/** 이동 기즈모에서 보이는 메시 수 — 흰 원 테두리·흰 원 + 축 화살표 3개(몸통·머리) = 8, 위아래만이면 Y 화살표 몸통·머리 2 */
const visibleParts = (helper: CustomSkeletonHelper) => {
  const gizmo = helper.children.find((c) => c instanceof MoveGizmo)
  expect(gizmo).toBeDefined()
  return gizmo!.children.filter((c) => c.visible).length
}

describe('CustomSkeletonHelper — 제자리 모션 중 이동 기즈모', () => {
  it('제자리 중 Hips 를 고르면 위아래(Y) 화살표만', () => {
    const helper = makeHelper()
    helper.setRootMoveYOnly(true)
    helper.setHighlightBone('Hips')
    expect(visibleParts(helper)).toBe(2)
  })

  it('제자리 중이어도 Hips 가 아닌 관절(IK 이동)은 세 축 다', () => {
    const helper = makeHelper()
    helper.setRootMoveYOnly(true)
    helper.setHighlightBone('Head')
    expect(visibleParts(helper)).toBe(8)
  })

  it('제자리를 끄면 Hips 도 세 축 다 — 켜고 끄는 순서와 상관없이', () => {
    const helper = makeHelper()
    helper.setHighlightBone('Hips')
    helper.setRootMoveYOnly(true)
    expect(visibleParts(helper)).toBe(2)
    helper.setRootMoveYOnly(false)
    expect(visibleParts(helper)).toBe(8)
  })

  it('제자리 중 Hips 를 화면 평면(흰 원)으로 비스듬히 끌어도 월드 X·Z 는 잡을 때 그대로, 위아래만 움직인다(dragHipsMove 고정)', () => {
    const helper = makeHelper()
    const root = helper.testRoot
    const scene = new Scene()
    scene.add(root, helper)
    helper.setRootMoveYOnly(true)
    helper.setHighlightBone('Hips')
    scene.updateMatrixWorld(true)
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 1, 5)
    camera.lookAt(0, 1, 0)
    camera.updateMatrixWorld()
    const viewport = new Vector2(800, 800)
    const ray = (x: number, y: number) => {
      const rc = new Raycaster()
      rc.setFromCamera(new Vector2(x, y), camera)
      return rc
    }
    const hips = root.getObjectByName('Hips')!
    const before = hips.getWorldPosition(new Vector3())
    // 흰 원 핸들은 제자리 중엔 안 보이지만 끌기 식 자체가 X·Z 를 막는지 — 화면 대각선으로 끈다
    expect(helper.beginGizmoDrag('view', ray(0, 0), new Vector2(0, 0), viewport)).toBe(true)
    helper.dragGizmo(ray(0.3, 0.2), new Vector2(0.3, 0.2))
    const after = hips.getWorldPosition(new Vector3())
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.z).toBeCloseTo(before.z, 6)
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(0.05)
  })
})
