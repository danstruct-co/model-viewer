'use client'

import { Environment, GizmoHelper, OrbitControls, Sky, useAnimations } from '@react-three/drei'
import { AxisGizmoViewport } from './axisGizmoViewport'
import SharedSoftShadows from './sharedSoftShadows'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { State } from './control/animation/types'
import { Color, MeshStandardMaterial, PCFSoftShadowMap, Raycaster, Vector2, Vector3 } from 'three'
import AnimationControl from './control/animation/animationControl'
import { OrbitControls as OrbitControlsImpl, Sky as SkyImpl } from 'three-stdlib'
import CameraControl from './control/camera/cameraControl'
import ModelControl from './control/model/modelControl'
import EnvironmentControl from './control/environment/environmentControl'
import AudioControl from './control/audio/audioControl'
import type { ModelViewerProps } from './types'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import Loading from './loading'
import { ErrorBoundary } from 'react-error-boundary'
import Error from './error'
import CoreNodeFinder from '../coreNodeFinder/coreNodeFinder'

const ModelViewer = React.forwardRef<HTMLCanvasElement, ModelViewerProps>(
  (
    {
      url,
      camera: cameraSetting,
      animation: animationSetting,
      model: modelSetting,
      environment: environmentSetting,
      audio: audioSetting,
      coreNodeKeys,
      onLoaded,
      onDispose,
      onError,
      fallback,
      onClick,
      className,
    },
    ref
  ) => {
    const backgroundColorRef = useRef<Color>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const dracoLoaderRef = useRef<DRACOLoader>()
    // 관절 콜백은 라이브 ref 로 참조 — Model 이 url 로만 메모이즈돼 이펙트([] deps)가 초기 마운트
    // 시점의 modelSetting 을 캡처, 이후 추가된 콜백(onJointHover)을 못 받던 문제 (종원 2026-09-10)
    const onJointPickRef = useRef(modelSetting?.onJointPick)
    const onJointHoverRef = useRef(modelSetting?.onJointHover)
    const onJointRightPickRef = useRef(modelSetting?.onJointRightPick)
    const onJointDragEndRef = useRef(modelSetting?.onJointDragEnd)
    const onRootTransformChangeRef = useRef(modelSetting?.onRootTransformChange)
    const onPositionEditDragEndRef = useRef(modelSetting?.onPositionEditDragEnd)
    onJointPickRef.current = modelSetting?.onJointPick
    onJointHoverRef.current = modelSetting?.onJointHover
    onJointRightPickRef.current = modelSetting?.onJointRightPick
    onJointDragEndRef.current = modelSetting?.onJointDragEnd
    onRootTransformChangeRef.current = modelSetting?.onRootTransformChange
    onPositionEditDragEndRef.current = modelSetting?.onPositionEditDragEnd

    const [progress, setProgress] = useState(0)

    const Model = () => {
      const { nodes, scene, animations } = useLoader(
        GLTFLoader,
        url,
        (loader) => {
          if (!dracoLoaderRef.current) {
            dracoLoaderRef.current = new DRACOLoader()
            dracoLoaderRef.current.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
          }
          loader.setDRACOLoader(dracoLoaderRef.current)
        },
        ({ loaded, total }) => setProgress((loaded / total) * 100)
      )
      const { actions, mixer } = useAnimations(animations, scene)
      const { scene: defaultScene, camera: defaultCamera, gl } = useThree()
      const coreNodeFinder = new CoreNodeFinder({ nodes, actions, coreKeys: coreNodeKeys })

      const orbitControlRef = useRef<OrbitControlsImpl>(null)
      // 축 기즈모 트윈 동안 지킬 카메라~피벗 거리 (onTarget 에서 잡는다)
      const axisTweenDistanceRef = useRef<number | null>(null)
      const skyRef = useRef<SkyImpl>(null)
      const groundRef = useRef<MeshStandardMaterial>(null)

      const modelControlRef = useRef<ModelControl>()
      const animationControlRef = useRef<AnimationControl>()
      const cameraControlRef = useRef<CameraControl>()
      const environmentControlRef = useRef<EnvironmentControl>()
      const audioControlRef = useRef<AudioControl>()

      useEffect(() => {
        const modelControl = initializeModelControl()
        const animationControl = initializeAnimationControl()
        const cameraControl = initializeCameraControl(animationControl)
        const environmentControl = initializeEnvironmentControl()
        const audioControl = initializeAudioControl(animationControl)

        const modelViewerControl = {
          modelControl,
          animationControl,
          cameraControl,
          environmentControl,
          audioControl,
        }
        onLoaded?.(modelViewerControl)

        return () => {
          onDispose?.(modelViewerControl)
          dracoLoaderRef.current?.dispose()
          gl.dispose()
        }
      }, [])

      useFrame(() => {
        modelControlRef.current?.updateOnFrame()
        cameraControlRef.current?.updateOnFrame()
        animationControlRef.current?.updateOnFrame()
      })

      // 관절 구 피킹 옵트인 (2026-09-08): 스켈레톤 헬퍼가 켜진 동안 호버 = 구 2배 + 커서,
      // 클릭(드래그와 구분 — 이동 5px 미만) = onJointPick(본명). 헬퍼 꺼짐이면 자동 무동작.
      // 선택 관절 기즈모 (종원 2026-09-15 이동·회전 공통): 호버 = 핸들 굵고 밝게, 좌드래그 = 이동(축·가운데 흰 원 → IK 타겟) /
      // 회전(링·트랙볼 → 선택 관절). 픽·드래그 계산은 뷰어 헬퍼가 화면 px 로
      useEffect(() => {
        // 관절 피킹/호버 콜백은 위 onJointPickRef·onJointHoverRef(라이브)로 읽는다 (종원 2026-09-10).
        // 등록 자체를 콜백 유무로 막지 않는다 — deps 가 [] 라 마운트 시점 값으로 막으면 나중에 콜백을 붙인
        // 소비자는 리스너가 영영 안 붙고 에러도 안 난다(url 이 안 바뀌면 재마운트도 없다). 대신 각 핸들러
        // 선두에서 ref 를 보고 빠진다 (파트라슈 리뷰 2026-09-17)
        const dom = gl.domElement
        const raycaster = new Raycaster()
        const pointer = new Vector2()
        // 기즈모는 화면 px 로 픽·드래그를 잰다 (종원 2026-09-14) — 캔버스 기준 포인터·크기
        const pointerPx = new Vector2()
        const viewport = new Vector2()
        let dragging = false
        let downX = 0
        let downY = 0

        const setRay = (e: MouseEvent) => {
          const rect = dom.getBoundingClientRect()
          pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
          pointerPx.set(e.clientX - rect.left, e.clientY - rect.top)
          viewport.set(rect.width, rect.height)
          raycaster.setFromCamera(pointer, defaultCamera)
        }

        const onMove = (e: PointerEvent) => {
          const model = modelControlRef.current
          if (!model) return
          if (!model.skeletonPickEnabled && !model.skeletonRootEditing) {
            // 피킹 게이트 꺼짐 (종원 2026-09-09 모션 편집 모드) — 호버/커서 정리, 진행 중 드래그 중단.
            // 루트 편집은 관절 피킹 없이 루트 기즈모만 (종원 2026-09-15)
            if (dragging) {
              dragging = false
              model.endSkeletonGizmoDrag()
              if (orbitControlRef.current) orbitControlRef.current.enabled = true
            }
            model.setSkeletonJointHover(null)
            model.setSkeletonGizmoHover(null)
            onJointHoverRef.current?.(null, 0, 0)
            dom.style.cursor = ''
            return
          }
          setRay(e)
          if (dragging) {
            // 기즈모 드래그 중 — 이동은 IK 타겟(설정 즉시 updateOnFrame 의 CCD 홀드가 추종), 회전은 선택 관절에 바로 반영
            model.dragSkeletonGizmo(raycaster, pointerPx)
            if (model.skeletonRootEditing) {
              const root = model.getSkeletonRootTransform()
              if (root) onRootTransformChangeRef.current?.(root) // 패널 값 실시간 표시
            }
            return
          }
          const handle = model.pickSkeletonGizmoHandle(raycaster, pointerPx, viewport)
          model.setSkeletonGizmoHover(handle)
          if (handle !== null) {
            model.setSkeletonJointHover(null)
            onJointHoverRef.current?.(null, 0, 0)
            dom.style.cursor = 'pointer'
            return
          }
          if (!model.skeletonPickEnabled) {
            dom.style.cursor = '' // 루트 편집 — 관절 호버 없음
            return
          }
          const hit = model.pickSkeletonJoint(raycaster)
          model.setSkeletonJointHover(hit?.index ?? null)
          // 잠금 관절도 호버 확대·이름 툴팁은 뜬다(종원 2026-09-10) — 커서 pointer 는 선택 가능(비잠금)만
          onJointHoverRef.current?.(hit ? { name: hit.name, locked: hit.locked } : null, e.clientX, e.clientY)
          dom.style.cursor = hit && !hit.locked ? 'pointer' : ''
        }
        const onDown = (e: PointerEvent) => {
          downX = e.clientX
          downY = e.clientY
          const model = modelControlRef.current
          if (!model || e.button !== 0 || (!model.skeletonPickEnabled && !model.skeletonRootEditing)) return
          // IK 드래그는 일시정지(또는 무애니 T포즈)에서만 — 재생 중엔 mixer 와 싸운다 (종원 2026-09-08).
          // 위치 편집 원점은 재생 중에도 편집 가능(holdRootEdit), 캐릭터(hips)는 잡는 순간 재생을 멈춘다 — 믹서가 매 프레임 hips 를
          // 다시 써 드래그 미리보기를 덮는다 (종원 2026-09-15)
          const anim = animationControlRef.current
          const playing = !!anim && anim.actions.length > 0 && anim.state === 'play'
          if (!model.skeletonRootEditing && playing) return
          setRay(e)
          const handle = model.pickSkeletonGizmoHandle(raycaster, pointerPx, viewport)
          if (handle === null) return
          if (playing && model.skeletonRootEditing && model.skeletonPositionTarget === 'character') anim?.pause()
          if (!model.beginSkeletonGizmoDrag(handle, raycaster, pointerPx, viewport)) return
          // 기즈모 드래그 시작 — 카메라 회전 잠금 + 포인터 캡처
          dragging = true
          if (orbitControlRef.current) orbitControlRef.current.enabled = false
          dom.setPointerCapture(e.pointerId)
        }
        const onUp = (e: PointerEvent) => {
          if (dragging) {
            dragging = false
            if (orbitControlRef.current) orbitControlRef.current.enabled = true
            if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId)
            // 이동은 저장 타겟을 도달 위치로 클램프 — 제약으로 못 간 raw 타겟이 남아 이후 루트 변경 시
            // 그 위치로 튀는 것 방지 (종원 2026-09-10)
            modelControlRef.current?.endSkeletonGizmoDrag()
            if (modelControlRef.current?.skeletonRootEditing) {
              // 루트 편집 — 마지막 값 알림 (관절 기즈모 조작 단계와 무관, 종원 2026-09-15)
              const root = modelControlRef.current.getSkeletonRootTransform()
              if (root) onRootTransformChangeRef.current?.(root)
              onPositionEditDragEndRef.current?.() // 캐릭터 대상은 스튜디오가 이때 모든 프레임에 굽는다 (종원 2026-09-15)
              return
            }
            // 드래그 종료 알림 — 선택 관절 위치(이동은 클램프된 도달 위치). 스튜디오 기즈모 조작 되돌리기 단계 (종원 2026-09-14)
            const joint = modelControlRef.current?.getSkeletonTargetWorldPosition(new Vector3())
            if (joint) onJointDragEndRef.current?.(joint)
            return // 드래그 종료 — 관절 클릭 아님
          }
          if (e.button !== 0) return // 우클릭(IK 루트 지정)은 선택 트리거 금지 — contextmenu 가 처리 (종원 2026-09-10)
          if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 5) return
          if (!modelControlRef.current?.skeletonPickEnabled) return
          setRay(e)
          const hit = modelControlRef.current?.pickSkeletonJoint(raycaster)
          if (hit && !hit.locked) onJointPickRef.current?.(hit.name) // 잠금 관절은 선택 불가(호버 툴팁만)
        }
        // 캔버스 벗어나면 호버 확대·이름 툴팁 정리 (종원 2026-09-10)
        const onLeave = () => {
          modelControlRef.current?.setSkeletonJointHover(null)
          modelControlRef.current?.setSkeletonGizmoHover(null)
          onJointHoverRef.current?.(null, 0, 0)
          dom.style.cursor = ''
        }
        // 우클릭 = 맞은 관절이 선택 관절의 조상이면 IK 루트 지정 (종원 2026-09-10).
        // 조상 여부·유효성은 스튜디오(onJointRightPick)가 판정 — 뷰어는 맞은 본명만 전달
        const onContext = (e: MouseEvent) => {
          const model = modelControlRef.current
          if (!model || !model.skeletonPickEnabled) return
          e.preventDefault() // 편집 중 브라우저 컨텍스트 메뉴 억제
          setRay(e)
          const hit = model.pickSkeletonJoint(raycaster)
          if (hit) onJointRightPickRef.current?.(hit.name)
        }
        dom.addEventListener('pointermove', onMove)
        dom.addEventListener('pointerdown', onDown)
        dom.addEventListener('pointerup', onUp)
        dom.addEventListener('pointerleave', onLeave)
        dom.addEventListener('contextmenu', onContext)
        // 재생 재개 = IK 타겟 해제 (홀드 포즈는 mixer 원 포즈로 복귀) — 종원 2026-09-08
        const onAnimationState = (state: State) => {
          if (state === 'play') {
            dragging = false // 기즈모 드래그 상태는 clearSkeletonIK 가 정리 (종원 2026-09-14)
            if (orbitControlRef.current) orbitControlRef.current.enabled = true
            modelControlRef.current?.clearSkeletonIK()
          }
        }
        const animationControl = animationControlRef.current
        animationControl?.addStateChangeListener(onAnimationState)
        return () => {
          dom.removeEventListener('pointermove', onMove)
          dom.removeEventListener('pointerdown', onDown)
          dom.removeEventListener('pointerup', onUp)
          dom.removeEventListener('pointerleave', onLeave)
          dom.removeEventListener('contextmenu', onContext)
          dom.style.cursor = ''
          // 등록 당시 인스턴스에서 해제 — ref 를 다시 읽으면 그새 교체된 인스턴스를 건드린다
          animationControl?.removeStateChangeListener(onAnimationState)
        }
      }, [])

      const initializeModelControl = () => {
        modelControlRef.current = new ModelControl({
          scene,
          coreNodeFinder,
          materialType: modelSetting?.materialType,
          option: {
            defaultFixed: modelSetting?.defaultFixed,
            defaultMirrorMode: modelSetting?.defaultMirrorMode,
            defaultSkeletonHelper: modelSetting?.defaultSkeletonHelper,
            defaultScale: modelSetting?.defaultScale,
            materialOption: modelSetting?.materialOption,
            opaqueOtherModel: modelSetting?.opaqueOtherModel,
            mirrorAxis: modelSetting?.mirrorAxis,
            autoFit: modelSetting?.autoFit,
            skeletonFilter: modelSetting?.skeletonFilter,
          },
        })

        return modelControlRef.current!
      }

      const initializeAnimationControl = () => {
        animationControlRef.current = new AnimationControl({
          actions,
          mixer,
          option: {
            autoplay: animationSetting?.autoplay,
            defaultTimeScale: animationSetting?.defaultTimeScale,
          },
        })

        return animationControlRef.current!
      }

      const initializeCameraControl = (animationControl: AnimationControl) => {
        cameraControlRef.current = new CameraControl({
          scene,
          coreNodeFinder,
          camera: defaultCamera,
          animationControl: animationControl,
          orbitControl: orbitControlRef.current,
          option: {
            defaultControlMode: cameraSetting?.defaultControlMode,
            defaultTarget: cameraSetting?.defaultTarget,
            defaultPosition: cameraSetting?.defaultPosition,
            disableZoom: cameraSetting?.disableZoom,
            up: cameraSetting?.up,
            standardMouse: cameraSetting?.standardMouse,
            heightFit: cameraSetting?.heightFit,
          },
        })

        return cameraControlRef.current!
      }

      const initializeEnvironmentControl = () => {
        environmentControlRef.current = new EnvironmentControl({
          scene: defaultScene,
          color: backgroundColorRef.current!,
          sky: skyRef.current!,
          ground: groundRef.current!,
          option: {
            defaultBackground: environmentSetting?.defaultBackground,
            defaultGridActive: environmentSetting?.defaultActiveGrid,
            gridAxes: environmentSetting?.gridAxes,
            defaultShadowActive: environmentSetting?.defaultActiveShadow,
          },
        })

        return environmentControlRef.current
      }

      const initializeAudioControl = (animationControl: AnimationControl) => {
        audioControlRef.current = new AudioControl({
          audio: audioSetting?.url ? audioRef.current : null,
          animationControl,
          option: { defaultVolume: audioSetting?.defaultVolume },
        })

        return audioControlRef.current!
      }

      return (
        <group>
          <Environment files="/hdri/potsdamer_platz_1k.hdr" />
          <primitive object={scene} />
          {/* 다중 뷰어 동시 표시 시 PCSS 셰이더 중복 덧대기 방지 — 한 뷰어만 전역 청크를 패치 (2026-09-14) */}
          <SharedSoftShadows size={5} samples={40} focus={-20} />
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial ref={groundRef} attach="material" color="white" />
          </mesh>
          {/* makeDefault: drei GizmoHelper 가 state.controls 를 요구 — 없으면 트윈 프레임마다
              isOrbitControls(null) 크래시 (drei 9.102 실측). 다른 소비자는 없어 동작 동일 */}
          <OrbitControls ref={orbitControlRef} makeDefault maxDistance={30} />
          {cameraSetting?.axisGizmo && (
            /* 월드 좌표축 기즈모 (Blender 식, 종원 2026-09-08): 축 클릭 시 **리셋 카메라
               기준점**(heightFit 타깃) 피벗으로 그 방향 뷰 트윈 — 거리는 현재 줌 유지.
               OrbitControls 는 makeDefault 지만 target 은 여기서 직접 갱신한다 — GizmoHelper 가 주는
               기본 피벗(원점)이 아니라 heightFit 기준점을 써야 하기 때문 */
            <GizmoHelper
              alignment="top-right"
              margin={[50, 50]}
              onTarget={() => {
                const target =
                  cameraControlRef.current?.getResetTarget() ?? orbitControlRef.current?.target ?? new Vector3()
                // 트윈 동안 지킬 거리 = 지금 카메라 ~ 피벗. drei 는 반경을 원점까지 거리로 재서(피벗이 원점이 아니면) 누를 때마다
                // 조금씩 멀어지고, 트윈 중 연타하면 쌓였다(축 구 6번 → 8.19 → 11.33, QA 2026-10-07)
                const camera = orbitControlRef.current?.object
                axisTweenDistanceRef.current = camera ? camera.position.distanceTo(target) : null
                orbitControlRef.current?.target.copy(target)
                return target
              }}
              onUpdate={() => {
                const controls = orbitControlRef.current
                const distance = axisTweenDistanceRef.current
                if (controls && distance) {
                  const offset = controls.object.position.clone().sub(controls.target)
                  if (offset.lengthSq() > 0) controls.object.position.copy(controls.target).add(offset.setLength(distance))
                }
                controls?.update()
              }}
            >
              <AxisGizmoViewport />
            </GizmoHelper>
          )}
          <directionalLight
            position={[3, 5, 4]}
            intensity={2.5}
            castShadow
            target-position={[0, 0, 0]}
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-left={-25}
            shadow-camera-right={25}
            shadow-camera-top={25}
            shadow-camera-bottom={-25}
            shadow-camera-near={0.1}
            shadow-camera-far={200}
          />
          <ambientLight position={[5, 5, 4]} intensity={1.0} />
          <Sky
            ref={skyRef}
            sunPosition={[400000, 400000, 400000]}
            turbidity={10}
            rayleigh={2}
            mieCoefficient={0.005}
            mieDirectionalG={0.8}
            inclination={0.49}
            azimuth={0.25}
          />
        </group>
      )
    }

    const model = useMemo(() => <Model />, [url])

    return (
      <div className={className} onClick={onClick}>
        <Suspense fallback={fallback?.(progress) ?? <Loading progress={progress} />}>
          <ErrorBoundary resetKeys={[url]} onError={onError} fallbackRender={({ error }) => <Error error={error} />}>
            <Canvas
              ref={ref}
              shadows={{ enabled: true, type: PCFSoftShadowMap }}
              camera={{ fov: 20 }}
              gl={{ antialias: true, powerPreference: 'high-performance', alpha: true, stencil: true, depth: true, preserveDrawingBuffer: false }}
              dpr={Math.min(window.devicePixelRatio, 2)}
            >
              {model}
              <color ref={backgroundColorRef} attach="background" />
            </Canvas>
          </ErrorBoundary>
        </Suspense>
        <audio ref={audioRef}>
          <source src={audioSetting?.url}></source>
        </audio>
      </div>
    )
  }
)

ModelViewer.displayName = 'ModelViewer'
export default ModelViewer
