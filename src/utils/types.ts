export interface ModelMergerOptions {
  /**
   * 기본 GLB 파일 URL (Body Pose)
   */
  glbUrl: string
  /**
   * 왼손 GLB 파일 URL (Left Hand Finger Animation) - Optional
   */
  leftHandGlbUrl?: string
  /**
   * 오른손 GLB 파일 URL (Right Hand Finger Animation) - Optional
   */
  rightHandGlbUrl?: string
  /**
   * 왼손 본 필터링 패턴 (예: ['lefthand', 'leftfinger', 'leftthumb']) - Optional
   */
  leftHandBonePatterns?: string[]
  /**
   * 오른손 본 필터링 패턴 (예: ['righthand', 'rightfinger', 'rightthumb']) - Optional
   */
  rightHandBonePatterns?: string[]
  /**
   * 로딩 진행률 콜백
   */
  onProgress?: (progress: number) => void
}
