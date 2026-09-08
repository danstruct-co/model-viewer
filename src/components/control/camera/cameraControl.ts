import { MOUSE, type Object3D } from 'three'
import { cameraControlMode, cameraTargets } from './mapper'
import { CameraControlAction, CameraControlParams, CameraTarget, ControlMode } from './types'
import type CoreNodeFinder from '../../../coreNodeFinder/coreNodeFinder'
import { getCoreModels } from '../utils'

export default class CameraControl {
  control?: CameraControlAction
  private params: CameraControlParams
  private currentControlMode: ControlMode = 'rotate'
  private currentTarget: CameraTarget = 'model'
  private models: Object3D[] = []
  private coreNodeFinder: CoreNodeFinder
  private coreNode?: Object3D

  constructor(params: CameraControlParams) {
    this.params = params
    this.coreNodeFinder = params.coreNodeFinder
    const { camera, option, orbitControl } = params

    this.models = getCoreModels(params.scene, this.coreNodeFinder)
    this.setCoreNode(0)

    this.setControlMode(option?.defaultControlMode ?? 'rotate')
    this.setDisableZoom(option?.disableZoom)
    this.setTargetType(option?.defaultTarget ?? 'model')

    camera.up = option?.up ?? camera.up
    orbitControl?.update()

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

    // standardMouse(옵트인): 좌버튼 모드에 더해 우드래그 팬·휠 줌을 상시 바인딩 —
    // 컨트롤 모드 라디오 UI 없이 마우스만으로 회전/팬/줌 (스튜디오 2026-09-08)
    this.params.orbitControl.mouseButtons = this.params.option?.standardMouse
      ? { LEFT: cameraControlMode[controlMode], MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
      : { LEFT: cameraControlMode[controlMode] }
    this.currentControlMode = controlMode
  }

  setDisableZoom(value?: boolean) {
    if (!this.params.orbitControl) {
      return
    }

    this.params.orbitControl.enableZoom = !value
  }

  setTargetType(type: CameraTarget) {
    this.control?.dispose()
    this.control = cameraTargets[type]({ ...this.params, coreNode: this.coreNode })
    setTimeout(() => {
      this.control?.initialize()
      this.currentTarget = type
    })
  }

  setCoreNode(index: number) {
    if (index >= this.models.length) {
      return
    }

    this.coreNode = this.coreNodeFinder.find(this.models[index])

    if (!this.control) {
      return
    }
    this.control.coreNode = this.coreNode
  }

  resetPosition() {
    this.control?.resetPosition()
  }

  updateOnFrame() {
    this.control?.updateOnFrame()
  }

  get controlMode() {
    return this.currentControlMode
  }

  get cameraTarget() {
    return this.currentTarget
  }
}
