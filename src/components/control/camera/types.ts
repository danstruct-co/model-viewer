import AnimationControl from '../animation/animationControl'
import { Camera } from '@react-three/fiber'
import { Object3D, type Vector3 } from 'three'
import { OrbitControls } from 'three-stdlib'

export type ControlMode = 'none' | 'move' | 'rotate' | 'zoom' | 'pan'

export type CameraTarget = 'free' | 'model'

export type CameraControlAction = {
  initialize: () => void
  dispose: () => void
  updateOnFrame: () => void
  resetPosition: () => void
  onStartControl: () => void
  onEndControl: () => void
}

export type CameraControlParams = {
  coreNode: Object3D
  camera: Camera
  animationControl?: AnimationControl
  orbitControl: OrbitControls | null
  option?: {
    defaultTarget?: CameraTarget
    defaultControlMode?: ControlMode
    defaultPosition?: Vector3
    disableZoom?: boolean
  }
}
