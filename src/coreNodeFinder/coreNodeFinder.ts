import type { AnimationAction, Object3D } from 'three'
import type { CoreNodeFinderParams } from './types'

export default class CoreNodeFinder {
  private coreKeys: string[] = ['hips', 'pelvis']
  private exceptKeys: string[] = ['root']

  constructor({ nodes, actions }: CoreNodeFinderParams) {
    Object.entries(nodes).forEach(([key, node]) => (node.name = key))

    let targetActions = Array.from(Object.values(actions).filter((action) => !!action)) as AnimationAction[]
    targetActions = targetActions.length ? targetActions.slice(0, targetActions[0].getRoot().children.length) : []

    const clips = targetActions.map((action) => action.getClip())
    clips.forEach((clip) => {
      const key = clip.tracks
        .filter((track) => this.exceptKeys.some((exceptKey) => !track.name.toLowerCase().includes(exceptKey)))
        .at(0)
        ?.name.split('.')
        .at?.(0)

      if (key) {
        this.coreKeys.push(key.toLowerCase())
      }
    })
  }

  find(object: Object3D) {
    let coreNode: Object3D | undefined

    if (this.checkCoreNode(object)) {
      return object
    }

    object.traverse((node) => this.checkCoreNode(node) && (coreNode = node))

    return coreNode
  }

  private checkCoreNode(node: Object3D) {
    return this.coreKeys.some((coreKey) => node.name.toLowerCase().includes(coreKey))
  }
}
