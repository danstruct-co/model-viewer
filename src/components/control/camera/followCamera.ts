import { Camera, Object3D, Vector3 } from "three";
import { CameraControlParams } from "./types";
import AnimationControl from "../animation/animationControl";
import { OrbitControls } from "three-stdlib";
import { State as AnimationState } from "../animation/types";

export default class FollowCamera {
  defaultPosition: Vector3;
  cameraPosition: Vector3;
  coreNode?: Object3D;
  camera: Camera;
  animation?: AnimationControl;
  orbitControls: OrbitControls | null;

  // eslint-disable-next-line no-undef
  controlTimeout?: NodeJS.Timeout;
  animationState?: AnimationState;

  // eslint-disable-next-line no-undef
  cameraMoveTimeout?: NodeJS.Timeout;

  constructor({ coreNode, camera, animationControl: animRef, orbitControl, option }: CameraControlParams) {
    this.defaultPosition = option?.defaultPosition ?? new Vector3(0, 0, 3);
    this.cameraPosition = this.defaultPosition.clone();
    this.coreNode = coreNode;
    this.camera = camera;
    this.animation = animRef;
    this.orbitControls = orbitControl;
  }

  initialize = () => {
    this.animation?.timeUpdateListeners.unshift((time) => {
      this.followModel(this.cameraPosition);

      clearTimeout(this.cameraMoveTimeout);
      this.cameraMoveTimeout = setTimeout(() => {
        this.followModel(this.cameraPosition);
      }, 10);
    });

    this.resetPosition();
  };

  dispose = () => {
    this.animation?.timeUpdateListeners.shift();
  };

  updateOnFrame = () => {
    if (this.animation?.state !== "play") {
      return;
    }

    this.followModel(this.cameraPosition);
  };

  resetPosition = () => {
    this.cameraPosition = this.defaultPosition.clone();
    this.followModel(this.cameraPosition);
  };

  onStartControl = () => {
    this.animationState = this.animation?.state;
    this.animation?.pause();
  };

  onEndControl = () => {
    this.setCameraPosition();
    if (this.animationState !== "play") {
      return;
    }

    clearTimeout(this.controlTimeout);
    this.controlTimeout = setTimeout(() => {
      this.animation?.play();
    }, 10);
  };

  private followModel = (cameraPosition: Vector3) => {
    if (!this.coreNode) {
      return;
    }

    const modelWorldPosition = new Vector3();
    this.coreNode.getWorldPosition(modelWorldPosition);

    this.camera.position.copy(modelWorldPosition);
    this.camera.position.add(cameraPosition);

    if (this.orbitControls) {
      this.orbitControls.target = modelWorldPosition;
    }
  };

  private setCameraPosition = () => {
    if (!this.coreNode) {
      return;
    }

    const worldPos = new Vector3();
    this.coreNode.getWorldPosition(worldPos);
    this.cameraPosition = new Vector3(this.camera.position.x - worldPos.x, this.camera.position.y - worldPos.y, this.camera.position.z - worldPos.z);
  };
}
