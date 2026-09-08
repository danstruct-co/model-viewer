import CoreNodeFinder from "../../coreNodeFinder/coreNodeFinder";
import { Box3, type Bone, type Mesh, type Object3D } from "three";

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
