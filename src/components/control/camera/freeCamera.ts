import { Camera, Object3D, Vector3 } from "three";
import { CameraControlParams } from "./types";
import { OrbitControls } from "three-stdlib";

export default class FreeCamera {
  defaultPosition: Vector3;
  coreNode?: Object3D;
  camera: Camera;
  orbitControls: OrbitControls | null;

  constructor({ coreNode, camera, orbitControl, option }: CameraControlParams) {
    this.defaultPosition = option?.defaultPosition ?? new Vector3(0, 0, 3);
    this.coreNode = coreNode;
    this.camera = camera;
    this.orbitControls = orbitControl;
  }

  initialize = () => {
    this.resetPosition();
  };

  resetPosition = () => {
    if (!this.coreNode) {
      return;
    }

    const modelWorldPosition = new Vector3();
    this.coreNode.getWorldPosition(modelWorldPosition);

    this.camera.position.copy(modelWorldPosition);
    this.camera.position.add(this.defaultPosition);

    if (this.orbitControls) {
      this.orbitControls.target = modelWorldPosition;
    }
  };

  dispose = () => {};
  updateOnFrame = () => {};
  onStartControl = () => {};
  onEndControl = () => {};
}
