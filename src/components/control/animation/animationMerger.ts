import { AnimationClip, AnimationMixer, Bone, Object3D, Skeleton, SkinnedMesh } from 'three'

export interface MergeAnimationParams {
  /**
   * 기본 GLB Scene (Body Pose)
   */
  baseScene: Object3D
  /**
   * 추가 FBX Scene (Finger Animation)
   */
  additionalScene: Object3D
  /**
   * 합성할 애니메이션 클립
   */
  additionalClip: AnimationClip
  /**
   * 필터링할 본 패턴 (예: 'Hand', 'Finger' 등)
   */
  boneFilterPatterns: string[]
}

export class AnimationMerger {
  /**
   * FBX의 Finger 애니메이션을 GLB에 합성
   */
  static mergeFingerAnimation({ baseScene, additionalScene, additionalClip, boneFilterPatterns }: MergeAnimationParams): AnimationClip | null {
    // 1. Base Scene의 Skeleton 찾기
    const baseSkeleton = this.findSkeleton(baseScene)
    if (!baseSkeleton) {
      console.warn('Base scene에서 skeleton을 찾을 수 없습니다.')
      return null
    }

    // 2. Additional Scene의 Skeleton 찾기
    const additionalSkeleton = this.findSkeleton(additionalScene)
    if (!additionalSkeleton) {
      console.warn('Additional scene에서 skeleton을 찾을 수 없습니다.')
      return null
    }

    // 3. Bone 매핑 생성 (이름 기반)
    const boneMapping = this.createBoneMapping(baseSkeleton.bones, additionalSkeleton.bones)

    // 4. Finger 본만 필터링된 트랙 생성
    const filteredTracks = additionalClip.tracks.filter((track) => {
      return boneFilterPatterns.some((pattern) => track.name.toLowerCase().includes(pattern.toLowerCase()))
    })

    if (filteredTracks.length === 0) {
      console.warn('필터링된 트랙이 없습니다.')
      return null
    }

    // 5. 본 이름 매핑을 적용한 새 트랙 생성
    const remappedTracks = filteredTracks.map((track) => {
      const trackBoneName = this.extractBoneNameFromTrack(track.name)
      const mappedBone = boneMapping.get(trackBoneName)

      if (mappedBone) {
        // Base Scene의 본 이름으로 트랙 이름 변경
        const newTrackName = track.name.replace(trackBoneName, mappedBone.name)
        return track.clone()
      }

      return track.clone()
    })

    // 6. 새로운 합성된 AnimationClip 생성
    const mergedClip = new AnimationClip(`${additionalClip.name}_merged`, additionalClip.duration, remappedTracks)

    return mergedClip
  }

  /**
   * Scene에서 첫 번째 Skeleton 찾기
   */
  private static findSkeleton(scene: Object3D): Skeleton | null {
    let skeleton: Skeleton | null = null

    scene.traverse((node) => {
      if (node instanceof SkinnedMesh && node.skeleton) {
        skeleton = node.skeleton
      }
    })

    return skeleton
  }

  /**
   * 두 본 배열 간의 이름 기반 매핑 생성
   */
  private static createBoneMapping(baseBones: Bone[], additionalBones: Bone[]): Map<string, Bone> {
    const mapping = new Map<string, Bone>()

    additionalBones.forEach((addBone) => {
      const matchedBaseBone = baseBones.find((baseBone) => this.normalizeBoneName(baseBone.name) === this.normalizeBoneName(addBone.name))

      if (matchedBaseBone) {
        mapping.set(addBone.name, matchedBaseBone)
      }
    })

    return mapping
  }

  /**
   * 본 이름 정규화 (대소문자, 공백, 특수문자 제거)
   */
  private static normalizeBoneName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[\s_\-\.]/g, '')
      .trim()
  }

  /**
   * 애니메이션 트랙 이름에서 본 이름 추출
   * 예: "mixamorig:LeftHand.position" -> "mixamorig:LeftHand"
   */
  private static extractBoneNameFromTrack(trackName: string): string {
    const parts = trackName.split('.')
    return parts[0]
  }

  /**
   * 여러 AnimationClip을 하나로 병합
   */
  static combineClips(baseClip: AnimationClip, additionalClip: AnimationClip): AnimationClip {
    const allTracks = [...baseClip.tracks, ...additionalClip.tracks]
    const maxDuration = Math.max(baseClip.duration, additionalClip.duration)

    return new AnimationClip('combined', maxDuration, allTracks)
  }

  /**
   * Mixer에 합성된 애니메이션 적용
   */
  static applyMergedAnimation(mixer: AnimationMixer, baseScene: Object3D, mergedClip: AnimationClip) {
    const action = mixer.clipAction(mergedClip, baseScene)
    return action
  }
}
