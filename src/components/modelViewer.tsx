'use client'

import { Environment, GizmoHelper, OrbitControls, Sky, SoftShadows, useAnimations } from '@react-three/drei'
import { AxisGizmoViewport } from './axisGizmoViewport'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
      fallback,
      onClick,
      className,
    },
    ref
  ) => {
    const backgroundColorRef = useRef<Color>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const dracoLoaderRef = useRef<DRACOLoader>()

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
      // 클릭(드래그와 구분 — 이동 5px 미만) = onJointPick(본명). 헬퍼 꺼짐이면 자동 무동작
      useEffect(() => {
        const onJointPick = modelSetting?.onJointPick
        if (!onJointPick) return
        const dom = gl.domElement
        const raycaster = new Raycaster()
        const pointer = new Vector2()
        let downX = 0
        let downY = 0
        const cast = (e: PointerEvent) => {
          const rect = dom.getBoundingClientRect()
          pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
          raycaster.setFromCamera(pointer, defaultCamera)
          return modelControlRef.current?.pickSkeletonJoint(raycaster) ?? null
        }
        const onMove = (e: PointerEvent) => {
          const hit = cast(e)
          modelControlRef.current?.setSkeletonJointHover(hit?.index ?? null)
          dom.style.cursor = hit ? 'pointer' : ''
        }
        const onDown = (e: PointerEvent) => {
          downX = e.clientX
          downY = e.clientY
        }
        const onUp = (e: PointerEvent) => {
          if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 5) return
          const hit = cast(e)
          if (hit) onJointPick(hit.name)
        }
        dom.addEventListener('pointermove', onMove)
        dom.addEventListener('pointerdown', onDown)
        dom.addEventListener('pointerup', onUp)
        return () => {
          dom.removeEventListener('pointermove', onMove)
          dom.removeEventListener('pointerdown', onDown)
          dom.removeEventListener('pointerup', onUp)
          dom.style.cursor = ''
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
          <SoftShadows size={5} samples={40} focus={-20} />
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial ref={groundRef} attach="material" color="white" />
          </mesh>
          {/* makeDefault: drei GizmoHelper 가 state.controls 를 요구 — 없으면 트윈 프레임마다
              isOrbitControls(null) 크래시 (drei 9.102 실측). 다른 소비자는 없어 동작 동일 */}
          <OrbitControls ref={orbitControlRef} makeDefault maxDistance={30} />
          {cameraSetting?.axisGizmo && (
            /* 월드 좌표축 기즈모 (Blender 식, 종원 2026-09-08): 축 클릭 시 **리셋 카메라
               기준점**(heightFit 타깃) 피벗으로 그 방향 뷰 트윈 — 거리는 현재 줌 유지.
               비-makeDefault OrbitControls 라 피벗 갱신은 onTarget 에서 직접 수행 */
            <GizmoHelper
              alignment="top-right"
              margin={[50, 50]}
              onTarget={() => {
                const target =
                  cameraControlRef.current?.getResetTarget() ?? orbitControlRef.current?.target ?? new Vector3()
                orbitControlRef.current?.target.copy(target)
                return target
              }}
              onUpdate={() => orbitControlRef.current?.update()}
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
          <ErrorBoundary resetKeys={[url]} fallbackRender={({ error }) => <Error error={error} />}>
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
