import { cameraControlMode, cameraTargets } from './mapper'
import { CameraControlAction, CameraControlParams, CameraTarget, ControlMode } from './types'

export default class CameraControl {
  control?: CameraControlAction
  private params: CameraControlParams

  constructor(params: CameraControlParams) {
    this.params = params
    const { option, orbitControl } = params

    this.setControlMode(option?.defaultControlMode ?? 'rotate')
    this.setDisableZoom(option?.disableZoom)
    this.setTargetType(option?.defaultTarget ?? 'model')

    orbitControl?.addEventListener('start', () => {
      this.control?.onStartControl()
    })
    orbitControl?.addEventListener('end', () => {
      this.control?.onEndControl()
    })
  }

  setControlMode(controlMode: ControlMode) {
    if (!this.params.orbitControl) {
      return
    }

    this.params.orbitControl.mouseButtons = { LEFT: cameraControlMode[controlMode] }
  }

  setDisableZoom(value?: boolean) {
    if (!this.params.orbitControl) {
      return
    }

    this.params.orbitControl.enableZoom = !value
  }

  setTargetType(type: CameraTarget) {
    this.control?.dispose()
    this.control = cameraTargets[type](this.params)
    this.control?.initialize()
  }

  resetPosition() {
    this.control?.resetPosition()
  }

  updateOnFrame() {
    this.control?.updateOnFrame()
  }
}
