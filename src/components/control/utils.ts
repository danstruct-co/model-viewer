import CoreNodeFinder from "../../coreNodeFinder/coreNodeFinder";
import { Box3, Vector3, type Bone, type Mesh, type Object3D } from "three";

export function getCoreModels(scene: Object3D, coreNodeFinder: CoreNodeFinder) {
  return getModels(scene, coreNodeFinder)
    .flat()
    .filter((child) => coreNodeFinder.find(child))
    .toSorted((child0, child1) => {
      const child0Value = coreNodeFinder.hasDefaultCoreNode(child0) ? -1 : 1;
      const child1Value = coreNodeFinder.hasDefaultCoreNode(child1) ? -1 : 1;

      return child0Value - child1Value;
    });
}

function findRoot(node: Object3D) {
  if (!node.parent) {
    return undefined;
  }

  if (!(node.parent as Mesh).isMesh && !(node.parent as Bone).isBone) {
    return node.parent;
  }

  return findRoot(node.parent);
}

export function getModels(model: Object3D, coreNodeFinder: CoreNodeFinder): Object3D[] {
  return coreNodeFinder
    .findAll(model)
    .map(findRoot)
    .filter((object) => object) as Object3D[];
}

/** 모델 트리의 지오메트리 bbox (matrixWorld 반영 — autoFit 스케일 포함).
 *  raw 정점 기준이라 스킨 변형 전 rest 형상 — 카메라 heightFit 용도로 충분. */
export function computeModelBox(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const box = new Box3();
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
  });
  return box;
}

// heightFit 구도 상수: REF_HEIGHT(1.64m — autoFit 표준 키) 기준 오프셋 비례,
// 타깃 높이 = 키의 55%(골반 부근 — hips 매핑 본 피벗 무관)
export const CAMERA_REF_HEIGHT = 1.64;
export const CAMERA_TARGET_HEIGHT_RATIO = 0.55;

/** 리셋 카메라 구도의 기준점 계산 — follow/free 리셋과 축 기즈모 피벗이 공유하는 정의.
 *  반환: target(바라보는 점) + heightScale(키/REF — 오프셋 비례용). 기준 불능 시 null. */
export function computeCameraFraming(
  coreNode: Object3D | undefined,
  scene: Object3D,
  heightFit: boolean
): { target: Vector3; heightScale: number } | null {
  const box = heightFit ? computeModelBox(scene) : undefined;
  const height = box ? box.max.y - box.min.y : 0;
  const hasBox = !!box && Number.isFinite(height) && height > 1e-3;
  if (!coreNode && !hasBox) return null;
  const target = new Vector3();
  if (coreNode) coreNode.getWorldPosition(target);
  else if (box) box.getCenter(target);
  if (hasBox && box) target.y = box.min.y + height * CAMERA_TARGET_HEIGHT_RATIO;
  return { target, heightScale: hasBox ? height / CAMERA_REF_HEIGHT : 1 };
}
