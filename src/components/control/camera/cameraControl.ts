import type { Object3D } from "three";
import { cameraControlMode, cameraTargets } from "./mapper";
import { CameraControlAction, CameraControlParams, CameraTarget, ControlMode } from "./types";
import type CoreNodeFinder from "../../../coreNodeFinder/coreNodeFinder";
import { getCoreModels } from "../utils";

export default class CameraControl {
  control?: CameraControlAction;
  private params: CameraControlParams;
  private currentControlMode: ControlMode = "rotate";
  private currentTarget: CameraTarget = "model";
  private models: Object3D[] = [];
  private coreNodeFinder: CoreNodeFinder;
  private coreNode?: Object3D;

  constructor(params: CameraControlParams) {
    this.params = params;
    this.coreNodeFinder = params.coreNodeFinder;
    const { option, orbitControl } = params;

    this.models = getCoreModels(params.scene.children, this.coreNodeFinder);
    this.setCoreNode(0);

    this.setControlMode(option?.defaultControlMode ?? "rotate");
    this.setDisableZoom(option?.disableZoom);
    this.setTargetType(option?.defaultTarget ?? "model");

    orbitControl?.addEventListener("start", () => {
      this.control?.onStartControl();
    });
    orbitControl?.addEventListener("end", () => {
      this.control?.onEndControl();
    });
  }

  setControlMode(controlMode: ControlMode) {
    if (!this.params.orbitControl) {
      return;
    }

    this.params.orbitControl.mouseButtons = { LEFT: cameraControlMode[controlMode] };
    this.currentControlMode = controlMode;
  }

  setDisableZoom(value?: boolean) {
    if (!this.params.orbitControl) {
      return;
    }

    this.params.orbitControl.enableZoom = !value;
  }

  setTargetType(type: CameraTarget) {
    this.control?.dispose();
    this.control = cameraTargets[type]({ ...this.params, coreNode: this.coreNode });
    this.control?.initialize();
    this.currentTarget = type;
  }

  setCoreNode(index: number) {
    if (index >= this.models.length) {
      return;
    }

    this.coreNode = this.coreNodeFinder.find(this.models[index]);

    if (!this.control) {
      return;
    }
    this.control.coreNode = this.coreNode;
  }

  resetPosition() {
    this.control?.resetPosition();
  }

  updateOnFrame() {
    this.control?.updateOnFrame();
  }

  get controlMode() {
    return this.currentControlMode;
  }

  get cameraTarget() {
    return this.currentTarget;
  }
}
