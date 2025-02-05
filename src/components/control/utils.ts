import type CoreNodeFinder from '../../coreNodeFinder/coreNodeFinder'
import type { Object3D } from 'three'

export function getCoreModels(models: Object3D[], coreNodeFinder: CoreNodeFinder) {
  return models
    .filter((child) => coreNodeFinder.find(child))
    .toSorted((child0, child1) => {
      const child0Value = coreNodeFinder.hasDefaultCoreNode(child0) ? -1 : 1
      const child1Value = coreNodeFinder.hasDefaultCoreNode(child1) ? -1 : 1

      return child0Value - child1Value
    })
}
