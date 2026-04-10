# model_viewer

Xstage 3D 모션 뷰어. Three.js + React Three Fiber 기반. 유저 프론트(`achid_web_front`)와 어드민(`xstage_admin`)에서 git submodule로 공유.

## Stack

- Three.js `0.167.0`, @react-three/fiber `8.15`, @react-three/drei `9.102`
- React 18, TypeScript 5, Next.js 14, Tailwind CSS 3

## Import

```tsx
import ModelViewer from 'model_viewer'

<ModelViewer
  url="/model.glb"
  onLoaded={(control) => { /* ModelViewerControl */ }}
/>
```

## Architecture

```
ModelViewer (Canvas + Suspense + ErrorBoundary)
  ├── GLB Scene (GLTFLoader + DRACOLoader)
  ├── Lights (Directional + Ambient)
  ├── Environment (HDRI "city" preset)
  ├── OrbitControls
  ├── SoftShadows
  ├── Sky
  └── Ground Mesh

onLoaded callback → ModelViewerControl:
  ├── ModelControl      (모델 머티리얼, 미러, 스케일, 스켈레톤)
  ├── AnimationControl  (재생, 정지, 속도, 범위, 본 오프셋)
  ├── CameraControl     (Free/Follow 모드, 궤도 제어)
  ├── EnvironmentControl(배경, 그리드, 그림자)
  └── AudioControl      (오디오 싱크)
```

## Source Structure

```
src/
├── index.ts                           # 엔트리 — ModelViewer export
├── components/
│   ├── modelViewer.tsx                # 메인 컴포넌트 (forwardRef Canvas)
│   ├── types.ts                       # ModelViewerProps, ModelViewerControl
│   ├── loading.tsx                    # 로딩 스피너 (progress %)
│   ├── error.tsx                      # 에러 폴백 UI
│   ├── control/
│   │   ├── utils.ts                   # getCoreModels(), getModels()
│   │   ├── model/
│   │   │   ├── modelControl.ts        # 모델 전환, 머티리얼, 미러, 오토핏
│   │   │   ├── types.ts               # MaterialType, Axis, ModelControlOption
│   │   │   ├── mapper.ts              # 머티리얼/이펙트 팩토리
│   │   │   ├── data.ts                # 이펙트 키 목록
│   │   │   ├── customSkeletonHelper.ts# 본 플래그 복원 스켈레톤 헬퍼
│   │   │   ├── SaturatedToonMaterial.ts# 카툰 셰이더 (채도 증가)
│   │   │   └── effect/
│   │   │       ├── types.ts           # Effect, MaterialEffectOption
│   │   │       ├── rimLightEffect.ts  # 림라이트 (NdotV 기반 가장자리 발광)
│   │   │       └── outlineEffect.ts   # 아웃라인 (반전 헐 메시)
│   │   ├── animation/
│   │   │   ├── animationControl.ts    # 재생/정지/시간/속도/본 회전 오프셋
│   │   │   ├── types.ts               # State, Range, AnimationParams
│   │   │   └── animationMerger.ts     # 손가락 애니메이션 머지
│   │   ├── camera/
│   │   │   ├── cameraControl.ts       # 카메라 모드 전환
│   │   │   ├── types.ts               # ControlMode, CameraTarget
│   │   │   ├── mapper.ts              # 마우스 버튼 매핑
│   │   │   ├── freeCamera.ts          # 고정 위치 카메라
│   │   │   └── followCamera.ts        # 모델 추적 카메라
│   │   ├── environment/
│   │   │   ├── environmentControl.ts  # 배경/그리드/그림자 관리
│   │   │   ├── types.ts               # BackgroundType, EnvironmentControlParams
│   │   │   └── mapper.ts              # 배경 프리셋 (default/dark/white)
│   │   └── audio/
│   │       ├── audioControl.ts        # HTML5 Audio ↔ 애니메이션 싱크
│   │       └── types.ts               # AudioControlParams
│   └── object/
│       ├── mesh/
│       │   ├── rimLightMesh.ts        # 림라이트 커스텀 메시
│       │   ├── outlineMesh.ts         # 아웃라인 커스텀 메시 (BackSide)
│       │   └── infiniteGridHelper.ts  # 셰이더 기반 무한 그리드
│       ├── material/
│       │   └── rimLightMaterial.ts    # 림라이트 셰이더 머티리얼
│       ├── geometry/
│       │   └── outlineGeometryBuilder.ts # 법선 방향 정점 확장
│       └── texture/
│           └── toonGradientMap.ts     # 카툰 그라데이션 맵 (3밴드)
├── coreNodeFinder/
│   ├── coreNodeFinder.ts              # 스켈레톤 루트 탐색 (hips/pelvis)
│   ├── types.ts                       # CoreKey 타입
│   └── data.ts                        # 기본 코어 키 패턴
├── utils/modelMerger/
│   ├── modelMerger.ts                 # 바디 + 핸드 GLB 머지 오케스트레이터
│   ├── types.ts                       # ModelMergerOptions
│   ├── animationMerger.ts             # 바디/핸드 트랙 합성
│   ├── animationExtractor.ts          # 핸드 GLB에서 애니메이션 추출
│   ├── boneNameCollector.ts           # 패턴 매칭으로 핸드 본 수집
│   ├── trackCreator.ts               # 정적 포즈 → 키프레임 변환
│   └── data.ts                        # 핸드 본 패턴 (thumb/index/middle/ring/pinky)
├── hooks/
│   └── useModelMerger.ts             # React hook (merge, clear, mergedUrl, progress)
└── types/
    └── svg.d.ts                       # SVG 모듈 선언
```

## Props

```typescript
interface ModelViewerProps {
  url: string                          // GLB URL (필수)

  camera?: {
    defaultPosition?: Vector3          // 코어 노드 기준 오프셋
    defaultControlMode?: ControlMode   // 'none'|'move'|'rotate'|'zoom'|'pan'
    defaultTarget?: CameraTarget       // 'free' (고정) | 'model' (추적)
    disableZoom?: boolean
    up?: Vector3
  }

  animation?: {
    autoplay?: boolean                 // 로드 시 자동 재생
    defaultTimeScale?: number          // 속도 (1.0 = 기본)
  }

  model?: {
    materialType?: MaterialType        // 아래 참조
    defaultMirrorMode?: boolean
    defaultFixed?: boolean             // 코어 노드 Y=0, Z=0 고정
    defaultScale?: Vector3
    materialOption?: MaterialEffectOption  // { thickness?, modelRadius? }
    opaqueOtherModel?: boolean         // 비활성 모델 불투명 유지
    mirrorAxis?: Axis                  // 'x'|'y'|'z'
    autoFit?: boolean                  // 높이 1.64 기준 자동 스케일
    defaultSkeletonHelper?: boolean    // 스켈레톤 표시
  }

  environment?: {
    defaultBackground?: BackgroundType // 'default'|'dark'|'white'
    defaultActiveGrid?: boolean
    defaultActiveShadow?: boolean
  }

  audio?: {
    url?: string                       // 오디오 URL (애니메이션 싱크)
    defaultVolume?: number             // 0~1
  }

  coreNodeKeys?: CoreKey[]             // 코어 노드 탐색 패턴 오버라이드
  onLoaded?: (control: ModelViewerControl) => void
  onDispose?: (control: ModelViewerControl) => void
  fallback?: (progress: number) => ReactNode
  onClick?: () => void
  className?: string
}
```

## MaterialType

| Type | 설명 | 이펙트 |
|------|------|--------|
| `DEFAULT` | 기본 PBR (depthWrite: true) | 없음 |
| `FABRIC` | 패브릭 (metalness: 0, roughness: 0.5) | 없음 |
| `METALIC` | 메탈릭 (metalness: 1.0, roughness: 0) | 없음 |
| `TRANSPARENT` | 반투명 (opacity: 0.3) | 없음 |
| `CARTOON` | SaturatedToonMaterial + 3밴드 그라데이션 | 림라이트 + 아웃라인 |

## Control API

### AnimationControl

```typescript
play()                                    // 재생
pause()                                   // 일시정지
stop()                                    // 정지 + min으로 리셋
setTime(time: number)                     // 특정 시간으로 점프
setTimeScale(scale: number)               // 속도 변경
setRange(range: Range)                    // 재생 구간 설정 { min, max }
setBoneRotationOffset(name, quaternion)   // 본별 회전 오프셋 (리타겟팅용)
removeBoneRotationOffset(name)
clearBoneRotationOffsets()
addStateChangeListener(fn)                // 'play'|'pause'|'stop' 콜백
addTimeUpdateListener(fn)                 // 매 프레임 시간 콜백
```

### ModelControl

```typescript
changeModel(index: number)                // 활성 모델 전환 (멀티모델)
changeMaterial(type: MaterialType)        // 머티리얼 변경
mirror()                                  // 축 기준 미러
setScale(scale: Vector3)                  // 스케일 설정
setSkeletonHelperActive(active: boolean)  // 스켈레톤 표시/숨김
```

### CameraControl

```typescript
setControlMode(mode: ControlMode)         // 조작 모드 변경
setTargetType(target: CameraTarget)       // 'free' | 'model' 전환
```

### EnvironmentControl

```typescript
setBackground(type: BackgroundType)       // 배경 변경
setGrid(active: boolean)                  // 그리드 토글
setShadow(active: boolean)               // 그림자 토글
```

### AudioControl

```typescript
setVolume(volume: number)                 // 볼륨 (0~1)
// 재생/정지는 AnimationControl과 자동 싱크
```

## Model Merger (핸드 애니메이션 합성)

바디 GLB + 좌/우 핸드 GLB를 합성하여 손가락 애니메이션 포함된 단일 GLB 생성.

```typescript
import { useModelMerger } from 'model_viewer/hooks/useModelMerger'

const { merge, mergedUrl, progress, isLoading } = useModelMerger()

await merge({
  glbUrl: '/body.glb',
  leftHandGlbUrl: '/left_hand.glb',   // optional
  rightHandGlbUrl: '/right_hand.glb', // optional
})

// mergedUrl → blob URL, ModelViewer의 url prop으로 전달
```

**합성 흐름:**
1. 바디 GLB 로드 → 핸드 GLB 로드
2. 핸드 본 패턴 매칭 (thumb/index/middle/ring/pinky)
3. 핸드에 애니메이션 있으면 트랙 추출, 없으면 정적 포즈 → 키프레임 변환
4. 바디 트랙에서 핸드 본 제거 → 핸드 트랙 머지
5. GLTFExporter로 합성된 GLB blob 출력

## Core Node Detection

스켈레톤 루트(엉덩이 본)를 자동 탐색. 기본 패턴: `hips`, `pelvis`, `hip`, `lowertorso`, `torsolower`.

`coreNodeKeys` prop으로 커스텀 패턴 지정 가능:
```typescript
type CoreKey = {
  key: string           // 매칭할 문자열 (소문자)
  constraint: 'EQUALS' | 'INCLUDES' | 'STARTS_WITH' | 'ENDS_WITH'
}
```

## Rendering Pipeline

```
GLB 로드 (DRACOLoader 압축 해제)
  → CoreNodeFinder로 스켈레톤 루트 탐색
  → ModelControl 초기화 (머티리얼 적용, 오토핏)
  → AnimationControl 초기화 (AnimationMixer 생성)
  → CameraControl 초기화 (Free/Follow 모드)
  → EnvironmentControl (배경/그리드/그림자)
  → AudioControl (오디오 엘리먼트 연결)

매 프레임 (useFrame):
  → AnimationMixer.update(delta)
  → AnimationControl.updateOnFrame() — 본 회전 오프셋 적용
  → ModelControl.updateOnFrame() — 고정 위치 보정, 오토핏
  → CameraControl.updateOnFrame() — FollowCamera 추적
```

## Scene Configuration

| 항목 | 값 |
|------|-----|
| Camera FOV | 20 |
| Shadow Map | PCFSoftShadowMap, 8192x8192 |
| DirectionalLight | position [3,5,4], intensity 2.5 |
| AmbientLight | intensity 1.0 |
| SoftShadows | size 5, samples 40 |
| DRACO CDN | https://www.gstatic.com/draco/v1/decoders/ |
| AutoFit Target | height 1.64 units |
| Max Camera Distance | 30 |
