import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
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
  /** 캐릭터 따라가기 멈춤 — follow 카메라만 (종원 2026-09-15 루트 편집) */
  setFollowPaused?: (paused: boolean) => void
  coreNode?: Object3D
}

export type CameraControlParams = {
  scene: Object3D
  coreNodeFinder: CoreNodeFinder
  coreNode?: Object3D
  camera: Camera
  animationControl?: AnimationControl
  orbitControl: OrbitControls | null
  option?: {
    defaultTarget?: CameraTarget
    defaultControlMode?: ControlMode
    defaultPosition?: Vector3
    disableZoom?: boolean
    up?: Vector3
    /** 표준 마우스 바인딩: 좌드래그 회전 + 우드래그 팬 + 휠 줌 */
    standardMouse?: boolean
    /** 캐릭터 키 기준 구도: 타깃 Y=키×0.55, 오프셋 키 비례 — MMD 센터(바닥 피벗) 대응 */
    heightFit?: boolean
  }
}
