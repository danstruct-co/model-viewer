import { describe, expect, it } from 'vitest'
import { Bone, Object3D, Quaternion, Vector3 } from 'three'
import CustomSkeletonHelper from '../customSkeletonHelper'

// IK 해제(clearTarget)는 일시정지 중 믹서가 다시 안 써서 원 포즈를 직접 되돌린다 — 그런데 헤드가 편집 프레임을 떠나 IK 가 쉬는 동안은
// 화면이 믹서가 쓴 그 프레임 포즈다. 그때 원 포즈를 다시 쓰면 다른 프레임에 전 편집 프레임 포즈가 남는다
// (스튜디오 QA 2026-11-03: 카드가 붙은 채 초록 마름모를 440→800 으로 끌면 800 에 440 포즈가 남고, 그 포즈에서 고친 게 엉뚱한 변화량으로 구워졌다)

function makeArm() {
  const root = new Object3D()
  const bones: Record<string, Bone> = {}
  const add = (name: string, parent: Object3D, x: number, y: number) => {
    const b = new Bone()
    b.name = name
    b.position.set(x, y, 0)
    parent.add(b)
    bones[name] = b
    return b
  }
  const hips = add('Hips', root, 0, 1)
  const spine = add('Spine', hips, 0, 0.3)
  const arm = add('LeftArm', spine, 0.15, 0.1)
  const foreArm = add('LeftForeArm', arm, 0.28, 0)
  foreArm.quaternion.setFromAxisAngle(new Vector3(0, -1, 0), 0.35) // 팔꿈치 살짝 굽힘(hinge 축 폴백 회피)
  add('LeftHand', foreArm, 0.25, 0)
  root.updateMatrixWorld(true)
  const helper = new CustomSkeletonHelper(root, { body: Object.keys(bones), hips: 'Hips', hingeJoints: ['LeftForeArm'] })
  return { root, bones, helper }
}

/** 손을 잡고 끌어 IK 포즈를 만든다 — 원 포즈 = 끌기 전 포즈 */
function editHand({ bones, helper }: ReturnType<typeof makeArm>) {
  helper.setHighlightBone('LeftHand')
  const hand = new Vector3().setFromMatrixPosition(bones.LeftHand.matrixWorld)
  helper.setTargetWorld(hand.add(new Vector3(0, 0.15, 0.1)))
  helper.updateIKHold()
  helper.freezeIKPose()
}

const MIXER_FRAME = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -1.1) // 믹서가 쓴 다른 프레임의 위팔

describe('IK 해제 — 쉬는 중이면 지금 화면 포즈 그대로', () => {
  it('편집 프레임을 떠나 IK 가 쉬는 동안 믹서가 다른 프레임을 썼으면, 풀어도 그 프레임 포즈가 남는다', () => {
    const rig = makeArm()
    editHand(rig)
    rig.helper.suspendIK(true) // 헤드가 편집 프레임을 떠남
    rig.bones.LeftArm.quaternion.copy(MIXER_FRAME) // 믹서가 새 헤드 프레임 포즈를 씀
    rig.helper.clearTarget() // 새 프레임으로 고정(스튜디오 lockFrame)
    expect(rig.bones.LeftArm.quaternion.angleTo(MIXER_FRAME)).toBeLessThan(1e-6)
  })

  it('편집 프레임에서(쉬지 않음) 풀면 원 포즈로 되돌린다 — 일시정지 중엔 믹서가 다시 안 써서', () => {
    const rig = makeArm()
    const origin = rig.bones.LeftArm.quaternion.clone()
    editHand(rig)
    expect(rig.bones.LeftArm.quaternion.angleTo(origin)).toBeGreaterThan(0.01) // 끌어서 바뀜
    rig.helper.clearTarget()
    expect(rig.bones.LeftArm.quaternion.angleTo(origin)).toBeLessThan(1e-6)
  })
})
