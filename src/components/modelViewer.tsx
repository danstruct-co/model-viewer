'use client'

import { ContactShadows, Environment, OrbitControls, Sky, useAnimations } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Color, MeshStandardMaterial } from 'three'
import AnimationControl from './control/animation/animationControl'
import { OrbitControls as OrbitControlsImpl, Sky as SkyImpl } from 'three-stdlib'
import CameraControl from './control/camera/cameraControl'
import ModelControl from './control/model/modelControl'
import EnvironmentControl from './control/environment/environmentControl'
import AudioControl from './control/audio/audioControl'
import type { ModelViewerProps } from './types'
import { DRACOLoader, GLTFLoader } from 'three/examples/jsm/Addons.js'
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
      const coreNodeFinder = new CoreNodeFinder({ nodes, actions })

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

      const initializeModelControl = () => {
        modelControlRef.current = new ModelControl({
          scene,
          coreNodeFinder,
          materialType: modelSetting?.materialType,
          option: {
            defaultFixed: modelSetting?.defaultFixed,
            defaultMirrorMode: modelSetting?.defaultMirrorMode,
            defaultScale: modelSetting?.defaultScale,
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
          <Environment preset="city" />
          <primitive object={scene} />
          <ContactShadows position={[0, 0, 0]} scale={20} resolution={512} color="#000000" opacity={0.7} blur={0.7} />
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry attach="geometry" args={[20, 20]} />
            <meshStandardMaterial ref={groundRef} attach="material" color="white" />
          </mesh>
          <OrbitControls ref={orbitControlRef} />
          <directionalLight position={[5, 5, 4]} intensity={0.8} />
          <ambientLight position={[5, 5, 4]} intensity={0.5} />
          <Sky ref={skyRef} sunPosition={[100, 110, 50]} />
        </group>
      )
    }

    const model = useMemo(() => <Model />, [url])

    return (
      <div className={className} onClick={onClick}>
        <Suspense fallback={fallback?.(progress) ?? <Loading progress={progress} />}>
          <ErrorBoundary resetKeys={[url]} fallbackRender={({ error }) => <Error error={error} />}>
            <Canvas ref={ref} shadows>
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
