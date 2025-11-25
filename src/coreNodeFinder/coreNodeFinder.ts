import type { AnimationAction, Object3D } from 'three'
import type { CoreKey, CoreNodeFinderParams } from './types'
import { defaultCoreKeys, exceptCoreKeys } from './data'

export default class CoreNodeFinder {
  private coreKeys: CoreKey[] = [...defaultCoreKeys]

  constructor({ nodes, actions, coreKeys }: CoreNodeFinderParams) {
    coreKeys && (this.coreKeys = coreKeys)
    Object.entries(nodes).forEach(([key, node]) => (node.name = key))
    this.registerAnimationKeys(actions)
  }

  private registerAnimationKeys(actions: Record<string, AnimationAction | null>) {
    let targetActions = Array.from(Object.values(actions).filter((action) => !!action)) as AnimationAction[]
    targetActions = targetActions.length ? targetActions.slice(0, targetActions[0].getRoot().children.length) : []

    const clips = targetActions.map((action) => action.getClip())
    clips.forEach((clip) => {
      const key = clip.tracks
        .filter((track) => this.hasCoreNode(exceptCoreKeys, track))
        .at(0)
        ?.name.split('.')
        .at?.(0)

      if (key) {
        this.coreKeys.push({ name: key.toLowerCase(), constraint: 'EXACT' })
      }
    })
  }

  find(object: Object3D) {
    let coreNode: Object3D | undefined

    if (this.checkCoreNode(object)) {
      return object
    }

    object.traverse((node) => !coreNode && this.checkCoreNode(node) && (coreNode = node))

    return coreNode
  }

  findAll(object: Object3D) {
    const coreNodes: Object3D[] = []

    object.traverse((node) => this.checkCoreNode(node) && coreNodes.push(node))

    return coreNodes
  }

  private checkCoreNode(node: Object3D) {
    return this.hasCoreNode(this.coreKeys, node)
  }

  hasDefaultCoreNode(object: Object3D) {
    let hasCoreNode = false
    object.traverse((node) => this.hasCoreNode(defaultCoreKeys, node) && (hasCoreNode = true))

    return hasCoreNode
  }

  private hasCoreNode(coreKeys: CoreKey[], node: { name: string }) {
    return coreKeys.some(({ name, constraint }) => {
      if (constraint === 'INCLUDES') {
        return node.name.toLowerCase().includes(name)
      } else {
        return node.name.toLowerCase() === name
      }
    })
  }
}
