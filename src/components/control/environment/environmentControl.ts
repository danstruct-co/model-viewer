import { Color, Euler, Mesh, PlaneGeometry, Scene, ShadowMaterial, type MeshStandardMaterial } from 'three'
import { BackgroundType, EnvironmentControlParams } from './types'
import { Sky } from 'three-stdlib'
import { backgroundSettings } from './mapper'
import { InfiniteGridHelper } from '../../object/mesh/infiniteGridHelper'

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
      this.gridHelper = undefined
    }

    this.isActiveGrid = false
  }

  private addShadow() {
    this.shadow = new Mesh(
      new PlaneGeometry(10000, 10000),
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
      this.shadow = undefined
    }

    this.isActiveShadow = false
  }
}
