import type { ReactNode } from 'react'
import { Vector3 } from 'three'
import type AnimationControl from './control/animation/animationControl'
import type CameraControl from './control/camera/cameraControl'
import type { ControlMode, CameraTarget } from './control/camera/types'
import type EnvironmentControl from './control/environment/environmentControl'
import type { BackgroundType } from './control/environment/types'
import type ModelControl from './control/model/modelControl'
import type AudioControl from './control/audio/audioControl'
import type { MaterialType } from './control/model/types'

export interface ModelViewerControl {
  modelControl: ModelControl
  animationControl: AnimationControl
  cameraControl: CameraControl
  environmentControl: EnvironmentControl
  audioControl: AudioControl
}

export type ModelViewerProps = {
  /**
   * GLB 파일 URL
   */
  url: string
  /**
   * 카메라 기본 설정
   */
  camera?: {
    defaultPosition?: Vector3
    defaultControlMode?: ControlMode
    defaultTarget?: CameraTarget
    disableZoom?: boolean
  }
  /**
   * 애니메이션 기본 설정
   */
  animation?: {
    autoplay?: boolean
    defaultTimeScale?: number
  }
  /**
   * 모델 기본 설정
   */
  model?: {
    materialType?: MaterialType
    defaultMirrorMode?: boolean
    defaultFixed?: boolean
    defaultScale?: Vector3
  }
  /**
   * 환경 기본 설정
   */
  environment?: {
    defaultBackground?: BackgroundType
    defaultActiveGrid?: boolean
  }
  /**
   * 오디오 기본 설정
   */
  audio?: {
    url?: string
    defaultVolume?: number
  }
  /**
   * 로딩 완료 시 callback, 애니메이션, 카메라, 모델, 환경, 오디오 컨트롤 객체가 탑재되어 있음
   */
  onLoaded?: (control: ModelViewerControl) => void
  /**
   * 소멸 시 callback
   */
  onDispose?: (control: ModelViewerControl) => void
  /**
   * 로딩중일때 띄울 컴포넌트를 반환하는 함수, 로딩 상황을 위한 progress 값이 주어짐. 값 범위: 0 - 100
   */
  fallback?: (progress: number) => ReactNode
  /**
   * 모델 뷰어 클릭 시 이벤트 트리거
   */
  onClick?: () => void
  /**
   * tailwind css 작성을 위한 className
   */
  className?: string
}
