/**
 * 트랙 이름에서 본 이름 추출
 */
export function extractBoneNameFromTrack(trackName: string): string {
  const parts = trackName.split('.')
  return parts[0]
}

/**
 * 애니메이션 클립에서 패턴에 맞는 본 이름 수집
 */
export function collectBoneNamesFromClip(clip: any, bonePatterns: string[]): Set<string> {
  const boneNames = new Set<string>()

  clip.tracks.forEach((track: any) => {
    const boneName = extractBoneNameFromTrack(track.name)
    if (bonePatterns.some((pattern) => boneName.toLowerCase().includes(pattern.toLowerCase()))) {
      boneNames.add(boneName)
    }
  })

  return boneNames
}

/**
 * Scene에서 패턴에 맞는 본 이름 수집
 */
export function collectBoneNamesFromScene(scene: any, bonePatterns: string[]): Set<string> {
  const boneNames = new Set<string>()

  scene.traverse((node: any) => {
    if (node.name && bonePatterns.some((pattern) => node.name.toLowerCase().includes(pattern.toLowerCase()))) {
      boneNames.add(node.name)
    }
  })

  return boneNames
}
