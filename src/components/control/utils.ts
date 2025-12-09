import CoreNodeFinder from "../../coreNodeFinder/coreNodeFinder";
import type { Bone, Mesh, Object3D } from "three";

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
