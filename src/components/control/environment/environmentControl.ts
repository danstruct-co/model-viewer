import { Color, GridHelper, Scene, type MeshStandardMaterial } from 'three'
import { BackgroundType, EnvironmentControlParams } from './types'
import { Sky } from 'three-stdlib'
import { backgroundSettings } from './mapper'

export default class EnvironmentControl {
  private scene: Scene
  private backgroundColor: Color
  private sky: Sky
  private ground: MeshStandardMaterial
  private gridHelper?: GridHelper
  private currentType: BackgroundType = 'default'

  constructor({ scene, color, sky, ground, option }: EnvironmentControlParams) {
    this.scene = scene
    this.backgroundColor = color
    this.sky = sky
    this.ground = ground

    this.setBackground(option?.defaultBackground ?? 'default')
    this.setGridActive(!!option?.defaultGridActive)
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
    if (!isActive || this.gridHelper) {
      this.removeGrid()
    }

    if (!isActive) {
      return
    }

    this.addGrid()
  }

  private addGrid() {
    const { gridColor } = backgroundSettings[this.currentType]
    this.gridHelper = new GridHelper(20, 20, gridColor, gridColor)
    this.gridHelper.position.setY(-0.01)
    this.scene.add(this.gridHelper)
  }

  private removeGrid() {
    if (!this.gridHelper) {
      return
    }

    this.scene.remove(this.gridHelper)
    this.gridHelper = undefined
  }
}
