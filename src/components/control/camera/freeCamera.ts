import { Camera, Object3D, Vector3 } from "three";
import { CameraControlParams } from "./types";
import { OrbitControls } from "three-stdlib";
import { computeModelBox } from "../utils";

// followCamera 와 동일한 heightFit 구도 상수 (리셋 구도 공유 — follow 여부만 다름)
const REF_HEIGHT = 1.64;
const TARGET_HEIGHT_RATIO = 0.55;

export default class FreeCamera {
  defaultPosition: Vector3;
  coreNode?: Object3D;
  camera: Camera;
  orbitControls: OrbitControls | null;
  private scene: Object3D;
  private heightFit: boolean;
  private isInitialized = false;

  constructor({ coreNode, camera, orbitControl, option, scene }: CameraControlParams) {
    this.defaultPosition = option?.defaultPosition ?? new Vector3(0, 0.3, 8);
    this.coreNode = coreNode;
    this.camera = camera;
    this.orbitControls = orbitControl;
    this.scene = scene;
    this.heightFit = option?.heightFit ?? false;
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

    const target = modelWorldPosition.clone();
    const offset = this.defaultPosition.clone();
    if (this.heightFit) {
      const box = computeModelBox(this.scene);
      const height = box.max.y - box.min.y;
      if (Number.isFinite(height) && height > 1e-3) {
        target.y = box.min.y + height * TARGET_HEIGHT_RATIO;
        offset.multiplyScalar(height / REF_HEIGHT);
      }
    }

    this.camera.position.copy(target).add(offset);

    if (this.orbitControls) {
      this.orbitControls.target.copy(target);
    }
  };

  updateOnFrame = () => {
    if (this.isInitialized) {
      return;
    }

    this.initialize();
    this.isInitialized = true;
  };

  dispose = () => {};

  onStartControl = () => {};
  onEndControl = () => {};
}
