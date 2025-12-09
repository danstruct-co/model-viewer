import { collectBoneNamesFromClip, collectBoneNamesFromScene, extractBoneNameFromTrack } from './boneNameCollector'
import { createTracksFromPoseForSpecificBones } from './trackCreator'

export interface HandAnimationData {
  clip: any | null
  hasPose: boolean
}

export interface ExtractedHandData {
  boneNames: Set<string>
  tracks: any[]
  duration: number
}

/**
 * GLB 데이터에서 손 애니메이션 정보 추출
 */
export function extractHandAnimation(glbData: any | null): HandAnimationData {
  if (!glbData) {
    return { clip: null, hasPose: false }
  }

  const animations = glbData.animations || []

  if (animations.length === 0) {
    return { clip: null, hasPose: true }
  }

  return { clip: animations[0], hasPose: false }
}

/**
 * 손 애니메이션 데이터에서 본 이름, 트랙, duration 추출
 */
export function extractHandData(
  glbData: any | null,
  animationData: HandAnimationData,
  bonePatterns: string[],
  baseDuration: number
): ExtractedHandData {
  const { clip, hasPose } = animationData
  let boneNames = new Set<string>()
  let tracks: any[] = []
  let duration = baseDuration

  if (clip) {
    // 애니메이션이 있는 경우
    boneNames = collectBoneNamesFromClip(clip, bonePatterns)
    tracks = filterHandTracks(clip.tracks, boneNames)
    duration = clip.duration
  } else if (hasPose && glbData) {
    // 포즈만 있는 경우
    boneNames = collectBoneNamesFromScene(glbData.scene, bonePatterns)
    tracks = createTracksFromPoseForSpecificBones(glbData.scene, boneNames, baseDuration)
    duration = baseDuration
  }

  return { boneNames, tracks, duration }
}

/**
 * 손 본 트랙 필터링 (position, quaternion만, scale 제외)
 */
function filterHandTracks(tracks: any[], boneNames: Set<string>): any[] {
  return tracks.filter((track: any) => {
    const boneName = extractBoneNameFromTrack(track.name)
    const trackType = track.name.split('.')[1]
    return boneNames.has(boneName) && trackType !== 'scale'
  })
}
