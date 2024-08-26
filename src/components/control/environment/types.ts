import { Color, ColorRepresentation, Scene, type MeshStandardMaterial } from 'three'
import { Sky } from 'three-stdlib'

export type BackgroundType = 'default' | 'dark'

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
  }
}
