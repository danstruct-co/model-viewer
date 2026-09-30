import { Color, ColorRepresentation, Scene, type MeshStandardMaterial } from 'three'
import { Sky } from 'three-stdlib'

export type BackgroundType = 'default' | 'dark' | 'white'

export type BackgroundSetting = {
  backgroundColor: ColorRepresentation
  gridColor: ColorRepresentation
  hasSky: boolean
}

export type EnvironmentControlParams = {
  scene: Scene
  color: Color
  sky: Sky
  ground: MeshStandardMaterial
  option?: {
    defaultBackground?: BackgroundType
    defaultGridActive?: boolean
    /** 격자에 원점 축 선(x 빨강·z 파랑) — InfiniteGridHelper axisLines */
    gridAxes?: boolean
    defaultShadowActive?: boolean
    defaultSkyVisible?: boolean
  }
}
