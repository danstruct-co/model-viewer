import type { AnimationAction, Bone, Object3D } from 'three'
import type { CoreKey, CoreNodeFinderParams } from './types'
import { defaultCoreKeys, exceptCoreKeys } from './data'

export default class CoreNodeFinder {
  private coreKeys: CoreKey[] = [...defaultCoreKeys]
  private hasCustomCoreKeys: boolean = false

  constructor({ nodes, actions, coreKeys }: CoreNodeFinderParams) {
    if (coreKeys) {
      this.coreKeys = coreKeys
      this.hasCustomCoreKeys = true
    }
    Object.entries(nodes).forEach(([key, node]) => (node.name = key))
    if (!this.hasCustomCoreKeys) {
      this.registerAnimationKeys(actions)
    }
  }

  private registerAnimationKeys(actions: Record<string, AnimationAction | null>) {
    let targetActions = Array.from(Object.values(actions).filter((action) => !!action)) as AnimationAction[]
    targetActions = targetActions.length ? targetActions.slice(0, targetActions[0].getRoot().children.length) : []

    const clips = targetActions.map((action) => action.getClip())
    clips.forEach((clip) => {
      const key = clip.tracks
        .filter((track) => !this.hasCoreNode(exceptCoreKeys, track))
        .at(0)
        ?.name.split('.')
        .at?.(0)

      if (key && !this.coreKeys.map(({ name }) => name).includes(key)) {
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
    const nameMatch = this.hasCoreNode(this.coreKeys, node)

    // 커스텀 coreKeys가 제공된 경우, 이름 매칭만으로 충분
    // (사용자가 명시적으로 bone 이름을 지정했으므로 isBone 체크 불필요)
    if (this.hasCustomCoreKeys) {
      return nameMatch
    }

    // 기본 coreKeys를 사용하는 경우, isBone 체크 필수
    return nameMatch && (node as Bone).isBone
  }

  hasDefaultCoreNode(object: Object3D) {
    let hasCoreNode = false
    object.traverse((node) => this.hasCoreNode(defaultCoreKeys, node) && (node as Bone).isBone && (hasCoreNode = true))

    return hasCoreNode
  }

  private normalize(name: string) {
    // \w 는 ASCII 전용이라 일본어 본명(センター 등)이 통째로 지워져 매칭 불능 — 유니코드 문자/숫자 보존
    return name
      .replace(/\s/g, '_')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .toLowerCase()
  }

  private hasCoreNode(coreKeys: CoreKey[], node: { name: string }) {
    return coreKeys.some(({ name, constraint }) => {
      const nodeName = this.normalize(node.name)
      const keyName = this.normalize(name)
      if (constraint === 'INCLUDES') {
        return nodeName.includes(keyName)
      } else {
        return nodeName === keyName
      }
    })
  }
}
