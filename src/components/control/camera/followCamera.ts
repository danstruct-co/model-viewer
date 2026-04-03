import { Camera, Object3D, Vector3 } from "three";
import { CameraControlParams } from "./types";
import { OrbitControls } from "three-stdlib";

export default class FollowCamera {
  defaultPosition: Vector3;
  coreNode?: Object3D;
  camera: Camera;
  orbitControls: OrbitControls | null;

  private lastModelPosition = new Vector3();

  constructor({ coreNode, camera, orbitControl, option }: CameraControlParams) {
    this.coreNode = coreNode;
    this.defaultPosition = option?.defaultPosition ?? new Vector3(0, 0.3, 8);
    this.camera = camera;
    this.orbitControls = orbitControl;
  }

  initialize = () => {
    this.resetPosition();
  };

  dispose = () => {};

  updateOnFrame = () => {
    this.followModel();
  };

  resetPosition = () => {
    if (!this.coreNode) {
      return;
    }

    const modelWorldPosition = new Vector3();
    this.coreNode.getWorldPosition(modelWorldPosition);
    this.lastModelPosition.copy(modelWorldPosition);

    this.camera.position.copy(modelWorldPosition);
    this.camera.position.add(this.defaultPosition);

    if (this.orbitControls) {
      this.orbitControls.target.copy(modelWorldPosition);
    }
  };

  onStartControl = () => {};
  onEndControl = () => {};

  private followModel = () => {
    if (!this.coreNode) {
      return;
    }

    const modelWorldPosition = new Vector3();
    this.coreNode.getWorldPosition(modelWorldPosition);

    const delta = new Vector3().subVectors(modelWorldPosition, this.lastModelPosition);
    this.lastModelPosition.copy(modelWorldPosition);

    this.camera.position.add(delta);

    if (this.orbitControls) {
      this.orbitControls.target.add(delta);
    }
  };
}
