import type { ReactNode } from 'react'
import { Vector3 } from 'three'
import type AnimationControl from './control/animation/animationControl'
import type CameraControl from './control/camera/cameraControl'
import type { ControlMode, CameraTarget } from './control/camera/types'
import type EnvironmentControl from './control/environment/environmentControl'
import type { BackgroundType } from './control/environment/types'
import type ModelControl from './control/model/modelControl'
import type AudioControl from './control/audio/audioControl'
import type { Axis, MaterialOption, MaterialType } from './control/model/types'
import type { CoreKey } from '../coreNodeFinder/types'

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
    up?: Vector3
    /** 표준 마우스 바인딩: 좌드래그 회전 + 우드래그 팬 + 휠 줌 (미지정 시 기존 좌버튼 단일 모드) */
    standardMouse?: boolean
    /** 캐릭터 키 기준 카메라 구도 (타깃 Y=키×0.55·오프셋 키 비례, follow 는 수평만 추적) */
    heightFit?: boolean
    /** 우상단 월드 좌표축 기즈모 (Blender 식 — 축 클릭 시 해당 방향 뷰로 전환) */
    axisGizmo?: boolean
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
    materialOption?: MaterialOption
    opaqueOtherModel?: boolean
    mirrorAxis?: Axis
    autoFit?: boolean
    defaultSkeletonHelper?: boolean
    /** 스켈레톤 헬퍼 표시 본 필터 (body 구+라인 / fingers 라인만) — 미지정 시 전체 */
    skeletonFilter?: { body: string[]; fingers?: string[] }
  }
  /**
   * 환경 기본 설정
   */
  environment?: {
    defaultBackground?: BackgroundType
    defaultActiveGrid?: boolean
    defaultActiveShadow?: boolean
  }
  /**
   * 오디오 기본 설정
   */
  audio?: {
    url?: string
    defaultVolume?: number
  }
  /**
   * 카메라 중심점 본 key
   */
  coreNodeKeys?: CoreKey[]
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
