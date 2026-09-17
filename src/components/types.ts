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
    /** 스켈레톤 헬퍼 표시 본 필터 (body 구+라인 / fingers 라인만) — 미지정 시 전체.
     *  hips = IK 고정 베이스 본명 (체인이 절대 넘지 않는 경계, 2026-09-09).
     *  lockedChainRoot = MMD spine1(腰) 추가 경계·잠금 (2026-09-10) */
    skeletonFilter?: { body: string[]; fingers?: string[]; hips?: string; lockedChainRoot?: string; hingeJoints?: string[] }
    /** 관절 구 피킹 옵트인(스켈레톤 헬퍼 켜진 동안) — 호버 시 구 2배·클릭 시 본명 콜백 (2026-09-08) */
    onJointPick?: (boneName: string) => void
    /** 관절 호버 — 이름 툴팁용. info=null 이면 해제, clientX/Y = 커서 위치 (종원 2026-09-10) */
    onJointHover?: (info: { name: string; locked: boolean } | null, clientX: number, clientY: number) => void
    /** 관절 우클릭 — 선택 관절의 조상이면 IK 루트 지정용 본명 콜백 (종원 2026-09-10) */
    onJointRightPick?: (boneName: string) => void
    /** 관절 기즈모 드래그 종료 — 선택 관절 위치(월드, 이동은 도달 위치로 클램프된 IK 타겟). 스튜디오 기즈모 조작
     *  되돌리기 단계용 (종원 2026-09-14) */
    onJointDragEnd?: (target: Vector3) => void
    /** 루트 편집 기즈모로 캐릭터 루트 트랜스폼이 바뀔 때(드래그 중·끝) — 패널 값 표시·저장용 (종원 2026-09-15) */
    onRootTransformChange?: (transform: import('./control/model/customSkeletonHelper').SkeletonRootTransform) => void
    /** 위치 편집 기즈모 드래그 끝 (종원 2026-09-15) — 캐릭터(hips) 대상은 이때 스튜디오가 모든 프레임 키에 굽는다(드래그 중엔
     *  지금 프레임 미리보기, onRootTransformChange 도 그대로 불려 패널 값을 갱신) */
    onPositionEditDragEnd?: () => void
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
   * 로드·렌더 에러 시 callback (뷰어 ErrorBoundary 포착 — 에러 화면은 그대로 표시)
   */
  onError?: (error: Error) => void
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
