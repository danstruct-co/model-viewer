import { Camera, Object3D, Vector3 } from "three";
import { CameraControlParams } from "./types";
import { OrbitControls } from "three-stdlib";
import { computeCameraFraming } from "../utils";


export default class FollowCamera {
  defaultPosition: Vector3;
  coreNode?: Object3D;
  camera: Camera;
  orbitControls: OrbitControls | null;

  private scene: Object3D;
  private heightFit: boolean;
  // autoFit(모델 스케일 정규화)이 첫 updateOnFrame 에 적용되므로, 같은 프레임의 카메라
  // 업데이트에서 한 번 더 리셋해 스케일 반영된 bbox 로 구도를 잡는다
  private needsHeightRefit: boolean;
  private lastModelPosition = new Vector3();
  // 따라가기 멈춤 (종원 2026-09-15 루트 편집) — 멈춘 동안도 기준 위치는 갱신해 풀 때 카메라가 튀지 않는다
  private followPaused = false;

  constructor({ coreNode, camera, orbitControl, option, scene }: CameraControlParams) {
    this.coreNode = coreNode;
    this.defaultPosition = option?.defaultPosition ?? new Vector3(0, 0.3, 8);
    this.camera = camera;
    this.orbitControls = orbitControl;
    this.scene = scene;
    this.heightFit = option?.heightFit ?? false;
    this.needsHeightRefit = this.heightFit;
  }

  initialize = () => {
    this.resetPosition();
  };

  dispose = () => {};

  updateOnFrame = () => {
    if (this.needsHeightRefit) {
      this.needsHeightRefit = false;
      this.resetPosition();
    }
    this.followModel();
  };

  resetPosition = () => {
    const framing = computeCameraFraming(this.coreNode, this.scene, this.heightFit);
    if (!framing) {
      return; // 코어 본 미매칭 + bbox 불능 — 구도 기준이 없다
    }
    if (this.coreNode) {
      this.coreNode.getWorldPosition(this.lastModelPosition);
    } else {
      this.lastModelPosition.copy(framing.target);
    }

    const target = framing.target;
    const offset = this.defaultPosition.clone().multiplyScalar(framing.heightScale);

    this.camera.position.copy(target).add(offset);

    if (this.orbitControls) {
      this.orbitControls.target.copy(target);
    }
  };

  onStartControl = () => {};
  onEndControl = () => {};

  setFollowPaused = (paused: boolean) => {
    this.followPaused = paused;
  };

  private followModel = () => {
    if (!this.coreNode) {
      return;
    }

    const modelWorldPosition = new Vector3();
    this.coreNode.getWorldPosition(modelWorldPosition);

    const delta = new Vector3().subVectors(modelWorldPosition, this.lastModelPosition);
    this.lastModelPosition.copy(modelWorldPosition);
    if (this.followPaused) {
      return;
    }

    if (this.heightFit) {
      delta.y = 0; // 무대 카메라 — 수평만 추적 (점프·센터 본 상하 출렁 무시)
    }

    this.camera.position.add(delta);

    if (this.orbitControls) {
      this.orbitControls.target.add(delta);
    }
  };
}
