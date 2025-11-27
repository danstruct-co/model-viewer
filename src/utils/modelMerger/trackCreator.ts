import { Object3D, VectorKeyframeTrack, QuaternionKeyframeTrack } from 'three'

/**
 * 단일 노드에 대한 트랙 생성
 */
function createTracksForNode(node: any, duration: number, includeScale: boolean): any[] {
  const tracks: any[] = []
  const boneName = node.name

  // Position 트랙
  if (node.position) {
    tracks.push(
      new VectorKeyframeTrack(
        `${boneName}.position`,
        [0, duration],
        [node.position.x, node.position.y, node.position.z, node.position.x, node.position.y, node.position.z]
      )
    )
  }

  // Quaternion 트랙
  if (node.quaternion) {
    tracks.push(
      new QuaternionKeyframeTrack(
        `${boneName}.quaternion`,
        [0, duration],
        [
          node.quaternion.x,
          node.quaternion.y,
          node.quaternion.z,
          node.quaternion.w,
          node.quaternion.x,
          node.quaternion.y,
          node.quaternion.z,
          node.quaternion.w,
        ]
      )
    )
  }

  // Scale 트랙 (옵션)
  if (includeScale && node.scale) {
    tracks.push(
      new VectorKeyframeTrack(
        `${boneName}.scale`,
        [0, duration],
        [node.scale.x, node.scale.y, node.scale.z, node.scale.x, node.scale.y, node.scale.z]
      )
    )
  }

  return tracks
}

/**
 * Scene의 현재 포즈를 애니메이션 트랙으로 변환
 */
export function createTracksFromPose(scene: Object3D, excludeBoneNames: Set<string>, duration: number): any[] {
  const tracks: any[] = []

  scene.traverse((node: any) => {
    // Bone이나 Object3D이고, 제외할 본이 아닌 경우만 처리
    if (node.name && !excludeBoneNames.has(node.name)) {
      tracks.push(...createTracksForNode(node, duration, true))
    }
  })

  return tracks
}

/**
 * Scene의 특정 본들만 포즈를 애니메이션 트랙으로 변환 (position, quaternion만, scale 제외)
 */
export function createTracksFromPoseForSpecificBones(scene: Object3D, boneNames: Set<string>, duration: number): any[] {
  const tracks: any[] = []

  scene.traverse((node: any) => {
    // 지정된 본 이름에 해당하는 경우만 처리
    if (node.name && boneNames.has(node.name)) {
      tracks.push(...createTracksForNode(node, duration, false))
    }
  })

  return tracks
}
