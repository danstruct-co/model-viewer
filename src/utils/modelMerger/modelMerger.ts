import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { leftHandBonePatterns, rightHandBonePatterns } from './data'
import type { ModelMergerOptions } from './types'
import { extractHandAnimation, extractHandData } from './animationExtractor'
import { mergeAnimations } from './animationMerger'

export class ModelMerger {
  private glbLoader: GLTFLoader
  private exporter: GLTFExporter
  private dracoLoader: DRACOLoader

  constructor() {
    this.glbLoader = new GLTFLoader()
    this.exporter = new GLTFExporter()
    this.dracoLoader = new DRACOLoader()
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    this.glbLoader.setDRACOLoader(this.dracoLoader)
  }

  /**
   * GLB + 왼손 GLB + 오른손 GLB를 합성하여 새로운 Blob URL 반환
   * 왼손/오른손은 optional이며, 제공된 손만 병합됨
   */
  async merge({ glbUrl, leftHandGlbUrl, rightHandGlbUrl, onProgress }: ModelMergerOptions): Promise<string> {
    try {
      // 최소 하나의 손 GLB가 제공되어야 함
      if (!leftHandGlbUrl && !rightHandGlbUrl) {
        onProgress?.(100)
        return await this.exportToGLB(await this.loadGLB(glbUrl))
      }

      // 1. Body GLB 로드
      onProgress?.(5)
      const glbData = await this.loadGLB(glbUrl)
      onProgress?.(20)

      // 2. 왼손 GLB 로드 (optional)
      let leftHandGlbData = null
      if (leftHandGlbUrl) {
        leftHandGlbData = await this.loadGLB(leftHandGlbUrl)
      }
      onProgress?.(40)

      // 3. 오른손 GLB 로드 (optional)
      let rightHandGlbData = null
      if (rightHandGlbUrl) {
        rightHandGlbData = await this.loadGLB(rightHandGlbUrl)
      }
      onProgress?.(60)

      // 4. 애니메이션 합성
      const result = this.mergeHandAnimations(glbData, leftHandGlbData, rightHandGlbData)
      onProgress?.(80)

      // 5. 합성된 Scene을 GLB로 내보내기
      const blobUrl = await this.exportToGLB(result)
      onProgress?.(100)

      return blobUrl
    } catch (error) {
      console.error('Model merge failed:', error)
      throw error
    }
  }

  /**
   * GLB 파일 로드
   */
  private loadGLB(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.glbLoader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (error) => reject(error)
      )
    })
  }

  /**
   * GLB, 왼손 GLB, 오른손 GLB의 애니메이션 합성
   * 왼손/오른손은 null일 수 있음 (optional)
   */
  private mergeHandAnimations(glbData: any, leftHandGlbData: any | null, rightHandGlbData: any | null): any {
    // 왼손/오른손 모두 없으면 Body GLB만 반환
    if (!leftHandGlbData && !rightHandGlbData) {
      return glbData
    }

    // 왼손 애니메이션 추출
    const leftHandAnimation = extractHandAnimation(leftHandGlbData)

    // 오른손 애니메이션 추출
    const rightHandAnimation = extractHandAnimation(rightHandGlbData)

    // 유효한 클립도 없고 포즈도 없으면 Body GLB만 반환
    const hasLeftHand = leftHandAnimation.clip || leftHandAnimation.hasPose
    const hasRightHand = rightHandAnimation.clip || rightHandAnimation.hasPose
    if (!hasLeftHand && !hasRightHand) {
      return glbData
    }

    // duration 계산
    const baseDuration = glbData.animations.length > 0 ? glbData.animations[0].duration : 1.0

    // 왼손 데이터 추출
    const leftHandData = extractHandData(leftHandGlbData, leftHandAnimation, leftHandBonePatterns, baseDuration)

    // 오른손 데이터 추출
    const rightHandData = extractHandData(rightHandGlbData, rightHandAnimation, rightHandBonePatterns, baseDuration)

    // 모든 손 본 이름 합치기
    const allHandBoneNames = new Set<string>([...Array.from(leftHandData.boneNames), ...Array.from(rightHandData.boneNames)])

    // 손 본이 하나도 없으면 Body GLB만 반환
    if (allHandBoneNames.size === 0) {
      return glbData
    }

    // 양손 트랙 합치기
    const allHandTracks = [...leftHandData.tracks, ...rightHandData.tracks]

    // 최대 duration 계산
    const maxHandDuration = Math.max(leftHandData.duration, rightHandData.duration)

    // Body와 손 애니메이션 병합
    return mergeAnimations(glbData, allHandBoneNames, allHandTracks, maxHandDuration)
  }

  /**
   * GLTF 데이터를 GLB로 내보내고 Blob URL 반환
   */
  private exportToGLB(gltfData: any): Promise<string> {
    return new Promise((resolve, reject) => {
      this.exporter.parse(
        gltfData.scene,
        (result) => {
          const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
          const blobUrl = URL.createObjectURL(blob)
          resolve(blobUrl)
        },
        (error) => reject(error),
        {
          binary: true,
          animations: gltfData.animations,
        }
      )
    })
  }

  /**
   * Blob URL 해제
   */
  static revokeBlobUrl(url: string) {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }
}
