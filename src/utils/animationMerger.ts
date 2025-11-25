import { AnimationClip } from 'three'
import { extractBoneNameFromTrack } from './boneNameCollector'
import { createTracksFromPose } from './trackCreator'

/**
 * Body 애니메이션 트랙에서 손 본 트랙 제거
 */
function filterBodyTracks(baseTracks: any[], handBoneNames: Set<string>): any[] {
  return baseTracks.filter((track: any) => {
    const boneName = extractBoneNameFromTrack(track.name)
    return !handBoneNames.has(boneName)
  })
}

/**
 * Body GLB가 애니메이션을 가지고 있는 경우 병합
 */
function mergeWithBodyAnimation(
  glbData: any,
  allHandBoneNames: Set<string>,
  allHandTracks: any[],
  maxHandDuration: number
): any {
  const baseClip = glbData.animations[0]

  // Body 트랙에서 손 본 제거
  const baseTracksFiltered = filterBodyTracks(baseClip.tracks, allHandBoneNames)

  // Body 트랙 + 손 트랙 병합
  const mergedTracks = [...baseTracksFiltered, ...allHandTracks]
  const maxDuration = Math.max(baseClip.duration, maxHandDuration)
  const mergedClip = new AnimationClip('merged', maxDuration, mergedTracks)

  return { ...glbData, animations: [mergedClip] }
}

/**
 * Body GLB가 포즈만 가지고 있는 경우 병합
 */
function mergeWithBodyPose(glbData: any, allHandBoneNames: Set<string>, allHandTracks: any[], maxHandDuration: number): any {
  // Body Scene의 모든 본에서 현재 포즈를 애니메이션 트랙으로 변환
  const bodyTracks = createTracksFromPose(glbData.scene, allHandBoneNames, maxHandDuration)

  // Body 트랙 + 손 트랙 병합
  const allTracks = [...bodyTracks, ...allHandTracks]
  const newClip = new AnimationClip('merged', maxHandDuration, allTracks)

  return { ...glbData, animations: [newClip] }
}

/**
 * Body GLB와 손 애니메이션 병합
 */
export function mergeAnimations(
  glbData: any,
  allHandBoneNames: Set<string>,
  allHandTracks: any[],
  maxHandDuration: number
): any {
  const hasBodyAnimation = glbData.animations.length > 0

  if (hasBodyAnimation) {
    return mergeWithBodyAnimation(glbData, allHandBoneNames, allHandTracks, maxHandDuration)
  } else {
    return mergeWithBodyPose(glbData, allHandBoneNames, allHandTracks, maxHandDuration)
  }
}
