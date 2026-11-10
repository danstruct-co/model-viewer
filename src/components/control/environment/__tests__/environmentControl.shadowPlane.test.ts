import { describe, expect, it, vi } from 'vitest'
import { Color, Mesh, MeshStandardMaterial, PlaneGeometry, Scene } from 'three'
import { Sky } from 'three-stdlib'
import EnvironmentControl from '../environmentControl'

// three-stdlib 통째 import 가 lottie 를 끌어와 jsdom 에서 canvas 2D 를 만지다 죽는다 — 여기서 쓰는 건 Sky 의 visible 뿐
vi.mock('three-stdlib', async () => {
  const { Mesh: M } = await import('three')
  return { Sky: class extends M {} }
})

// 그림자 판은 해 그림자 카메라(직교 ±25m)를 덮을 만큼만 — 10km 판은 카메라 가까이 깊이가 프레임마다 흔들려 1cm 아래 바닥(스튜디오 촬영 3D 무대) 뒤로
// 들어갔다 나왔다 하며 그림자가 깜빡였다(2026-11-10, 창 크롬 합성 프레임 측정: 200m·1km 는 0프레임, 10km 는 180프레임 중 17프레임 사라짐)
describe('EnvironmentControl 그림자 판', () => {
  it('크기 50m 이상(그림자 카메라 ±25m 덮음)·1km 이하(깊이 흔들림 없음), 바닥(y=0)에 눕힌 투명 그림자 재질', () => {
    const scene = new Scene()
    const control = new EnvironmentControl({
      scene,
      color: new Color(),
      sky: new Sky(),
      ground: new MeshStandardMaterial(),
      option: { defaultShadowActive: true },
    })
    expect(control.shadowActive).toBe(true)
    const plane = scene.userData.shadow as Mesh
    expect(plane).toBeInstanceOf(Mesh)
    const { width, height } = (plane.geometry as PlaneGeometry).parameters
    expect(width).toBeGreaterThanOrEqual(50)
    expect(height).toBeGreaterThanOrEqual(50)
    expect(width).toBeLessThanOrEqual(1000)
    expect(height).toBeLessThanOrEqual(1000)
    expect(plane.rotation.x).toBeCloseTo(-Math.PI / 2, 9)
    expect(plane.receiveShadow).toBe(true)
  })
})
