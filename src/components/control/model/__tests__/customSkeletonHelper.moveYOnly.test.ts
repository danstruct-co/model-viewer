import { describe, expect, it } from 'vitest'
import { Bone, Object3D } from 'three'
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
  return helper
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
})
