import { Camera, Object3D, Vector3 } from "three";
import { CameraControlParams } from "./types";
import { OrbitControls } from "three-stdlib";
import { computeModelBox } from "../utils";

// heightFit 구도 상수: REF_HEIGHT(1.64m — autoFit 표준 키)에서 기존 오프셋 (0,0.3,8) 구도와
// 동일해지도록 키 비례 스케일. 타깃 높이 = 키의 55%(골반 부근) — MMD 센터처럼 hips 매핑
// 본의 피벗이 바닥에 있어도 구도가 무너지지 않는다 (종원 2026-09-08).
const REF_HEIGHT = 1.64;
const TARGET_HEIGHT_RATIO = 0.55;

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
    if (!this.coreNode) {
      return;
    }

    const modelWorldPosition = new Vector3();
    this.coreNode.getWorldPosition(modelWorldPosition);
    this.lastModelPosition.copy(modelWorldPosition);

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

    if (this.heightFit) {
      delta.y = 0; // 무대 카메라 — 수평만 추적 (점프·센터 본 상하 출렁 무시)
    }

    this.camera.position.add(delta);

    if (this.orbitControls) {
      this.orbitControls.target.add(delta);
    }
  };
}
