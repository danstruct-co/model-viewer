import { Camera, Object3D, Vector3 } from 'three'
import { CameraControlParams } from './types'
import { OrbitControls } from 'three-stdlib'
import { computeCameraFraming } from '../utils'

export default class FreeCamera {
  defaultPosition: Vector3
  coreNode?: Object3D
  camera: Camera
  orbitControls: OrbitControls | null
  private scene: Object3D
  private heightFit: boolean
  private isInitialized = false

  constructor({ coreNode, camera, orbitControl, option, scene }: CameraControlParams) {
    this.defaultPosition = option?.defaultPosition ?? new Vector3(0, 0.3, 8)
    this.coreNode = coreNode
    this.camera = camera
    this.orbitControls = orbitControl
    this.scene = scene
    this.heightFit = option?.heightFit ?? false
  }

  initialize = () => {
    this.resetPosition()
  }

  /** 현재 카메라 유지 전환용 — 첫 프레임 자동 initialize(리셋 스냅)를 건너뛴다 */
  skipInitialReset = () => {
    this.isInitialized = true
  }

  resetPosition = () => {
    const framing = computeCameraFraming(this.coreNode, this.scene, this.heightFit)
    if (!framing) {
      return // 코어 본 미매칭 + bbox 불능 — 구도 기준이 없다
    }

    const target = framing.target
    const offset = this.defaultPosition.clone().multiplyScalar(framing.heightScale)

    this.camera.position.copy(target).add(offset)

    if (this.orbitControls) {
      this.orbitControls.target.copy(target)
    }
  }

  updateOnFrame = () => {
    if (this.isInitialized) {
      return
    }

    this.initialize()
    this.isInitialized = true
  }

  dispose = () => {}

  onStartControl = () => {}
  onEndControl = () => {}
}
