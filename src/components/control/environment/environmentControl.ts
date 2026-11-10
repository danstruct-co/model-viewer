import { Color, Euler, Mesh, PlaneGeometry, Scene, ShadowMaterial, type MeshStandardMaterial } from 'three'
import { BackgroundType, EnvironmentControlParams } from './types'
import { Sky } from 'three-stdlib'
import { backgroundSettings } from './mapper'
import { InfiniteGridHelper } from '../../object/mesh/infiniteGridHelper'
import { disposeObject } from '../model/disposeObject'

export default class EnvironmentControl {
  private scene: Scene
  private backgroundColor: Color
  private sky: Sky
  private ground: MeshStandardMaterial
  private shadow?: Mesh
  private gridHelper?: InfiniteGridHelper
  private currentType: BackgroundType = 'default'
  private isActiveGrid: boolean = false
  private isActiveShadow: boolean = false
  private gridAxes: boolean

  constructor({ scene, color, sky, ground, option }: EnvironmentControlParams) {
    this.scene = scene
    this.backgroundColor = color
    this.sky = sky
    this.ground = ground
    this.gridAxes = !!option?.gridAxes // 아래 setGridActive 가 격자를 만들기 전에

    this.setBackground(option?.defaultBackground ?? 'default')
    this.setGridActive(!!option?.defaultGridActive)
    this.setShadowActive(!!option?.defaultShadowActive)
  }

  setBackground(type: BackgroundType) {
    const { backgroundColor, groundColor, hasSky } = backgroundSettings[type]

    this.backgroundColor.set(backgroundColor)
    this.ground.color.set(groundColor)
    this.sky.visible = hasSky

    this.currentType = type

    this.setGridActive(!!this.gridHelper)
  }

  setGridActive(isActive: boolean) {
    this.removeGrid()

    if (!isActive) {
      return
    }

    this.addGrid()
  }

  setShadowActive(isActive: boolean) {
    this.removeShadow()

    if (!isActive) {
      return
    }

    this.addShadow()
  }

  get backgroundType() {
    return this.currentType
  }

  get gridActive() {
    return this.isActiveGrid
  }

  get shadowActive() {
    return this.isActiveShadow
  }

  private addGrid() {
    this.removeGrid()

    const { gridColor } = backgroundSettings[this.currentType]
    this.gridHelper = new InfiniteGridHelper({
      size1: 0.2,
      size2: 1,
      color: gridColor,
      distance: 200,
      axisLines: this.gridAxes,
    })
    this.scene.add(this.gridHelper)
    this.scene.userData.gridHelper = this.gridHelper

    this.isActiveGrid = true
  }

  private removeGrid() {
    if (this.scene.userData.gridHelper) {
      this.scene.remove(this.scene.userData.gridHelper)
      // 빼기만 하면 GPU 지오메트리·재질이 남았다(배경을 바꿀 때마다 +1, 스튜디오 QA 2026-10-13 R4 explore r4x-a7c)
      disposeObject(this.scene.userData.gridHelper)
      this.scene.userData.gridHelper = undefined
      this.gridHelper = undefined
    }

    this.isActiveGrid = false
  }

  // 그림자 판 크기 — 해 그림자 카메라(modelViewer.tsx, 직교 ±25m)를 넉넉히 덮으면 된다(그 밖은 어차피 그림자가 안 생긴다).
  // 10000(10km)일 땐 카메라 가까이 깊이가 프레임마다 흔들려 판 바로 아래(1cm) 바닥 뒤로 들어갔다 나왔다 해 그림자가 깜빡였다
  // (스튜디오 촬영 3D 무대, 2026-11-10 — polygonOffset 을 끄거나 당겨도 그대로, 판을 1km 이하로 줄이면 0프레임)
  private addShadow() {
    this.shadow = new Mesh(
      new PlaneGeometry(200, 200),
      new ShadowMaterial({ opacity: 0.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    )
    this.shadow.frustumCulled = false
    this.shadow.receiveShadow = true
    this.shadow.setRotationFromEuler(new Euler(-Math.PI / 2, 0, 0))

    this.scene.add(this.shadow)
    this.scene.userData.shadow = this.shadow

    this.isActiveShadow = true
  }

  private removeShadow() {
    if (this.scene.userData.shadow) {
      this.scene.remove(this.scene.userData.shadow)
      disposeObject(this.scene.userData.shadow) // 위와 같은 이유
      this.scene.userData.shadow = undefined
      this.shadow = undefined
    }

    this.isActiveShadow = false
  }
}
