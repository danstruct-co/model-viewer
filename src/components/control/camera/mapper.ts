import { MOUSE } from 'three'
import { CameraControlParams } from './types'
import FollowCamera from './followCamera'
import FreeCamera from './freeCamera'

export const cameraControlMode = {
  none: MOUSE.ROTATE,
  move: MOUSE.RIGHT,
  rotate: MOUSE.LEFT,
  zoom: MOUSE.MIDDLE,
  pan: MOUSE.PAN,
}

export const cameraTargets = {
  free: (params: CameraControlParams) => new FreeCamera(params),
  model: (params: CameraControlParams) => new FollowCamera(params),
}
