import CoreNodeFinder from '../../coreNodeFinder/coreNodeFinder'
import type { Object3D } from 'three'

export function getCoreModels(models: Object3D[], coreNodeFinder: CoreNodeFinder) {
  return models
    .map((model) => getModels(model, coreNodeFinder))
    .flat()
    .filter((child) => coreNodeFinder.find(child))
    .toSorted((child0, child1) => {
      const child0Value = coreNodeFinder.hasDefaultCoreNode(child0) ? -1 : 1
      const child1Value = coreNodeFinder.hasDefaultCoreNode(child1) ? -1 : 1

      return child0Value - child1Value
    })
}

export function getModels(model: Object3D, coreNodeFinder: CoreNodeFinder): Object3D[] {
  if (coreNodeFinder.findAll(model).length <= 1) {
    return [model]
  }

  return model.children.map((child) => getModels(child, coreNodeFinder)).flat()
}
