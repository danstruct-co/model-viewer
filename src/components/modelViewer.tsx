"use client";

import { ContactShadows, Environment, OrbitControls, Sky, useAnimations } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Color, MeshStandardMaterial, Object3D } from "three";
import AnimationControl from "./control/animation/animationControl";
import { OrbitControls as OrbitControlsImpl, Sky as SkyImpl } from "three-stdlib";
import CameraControl from "./control/camera/cameraControl";
import ModelControl from "./control/model/modelControl";
import EnvironmentControl from "./control/environment/environmentControl";
import AudioControl from "./control/audio/audioControl";
import Spinner from "../assets/icons/ic_spinner.svg";
import type { ModelViewerProps } from "./types";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

function ModelViewer({
  url,
  camera: cameraSetting,
  animation: animationSetting,
  model: modelSetting,
  environment: environmentSetting,
  audio: audioSetting,
  onLoaded,
  fallback,
  onClick,
  className,
}: ModelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundColorRef = useRef<Color>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [progress, setProgress] = useState(0);

  const Model = () => {
    const { nodes, scene, animations } = useLoader(GLTFLoader, url, undefined, ({ loaded, total }) => setProgress((loaded / total) * 100));
    const { actions, mixer } = useAnimations(animations, scene);
    const { scene: defaultScene, camera: defaultCamera, gl } = useThree();

    const coreNodeRef = useRef<Object3D>(nodes[Object.keys(nodes).find((value) => value.includes("Hips"))!]);
    const orbitControlRef = useRef<OrbitControlsImpl>(null);
    const skyRef = useRef<SkyImpl>(null);
    const groundRef = useRef<MeshStandardMaterial>(null);

    const modelControlRef = useRef<ModelControl>();
    const animationControlRef = useRef<AnimationControl>();
    const cameraControlRef = useRef<CameraControl>();
    const environmentControlRef = useRef<EnvironmentControl>();
    const audioControlRef = useRef<AudioControl>();

    useEffect(() => {
      const modelControl = initializeModelControl();
      const animationControl = initializeAnimationControl();
      const cameraControl = initializeCameraControl(animationControl);
      const environmentControl = initializeEnvironmentControl();
      const audioControl = initializeAudioControl(animationControl);

      onLoaded?.({
        modelControl,
        animationControl,
        cameraControl,
        environmentControl,
        audioControl,
      });

      return () => {
        gl.dispose();
      };
    }, []);

    useFrame(() => {
      modelControlRef.current?.updateOnFrame();
      cameraControlRef.current?.updateOnFrame();
      animationControlRef.current?.updateOnFrame();
    });

    const initializeModelControl = () => {
      modelControlRef.current = new ModelControl({
        scene,
        nodes,
        coreNode: coreNodeRef.current,
        option: {
          defaultFixed: modelSetting?.defaultFixed,
          defaultMirrorMode: modelSetting?.defaultMirrorMode,
        },
      });

      return modelControlRef.current!;
    };

    const initializeAnimationControl = () => {
      animationControlRef.current = new AnimationControl({
        actions,
        mixer,
        option: {
          autoplay: animationSetting?.autoplay,
          defaultTimeScale: animationSetting?.defaultTimeScale,
        },
      });

      return animationControlRef.current!;
    };

    const initializeCameraControl = (animationControl: AnimationControl) => {
      cameraControlRef.current = new CameraControl({
        coreNode: coreNodeRef.current,
        camera: defaultCamera,
        animationControl: animationControl,
        orbitControl: orbitControlRef.current,
        option: {
          defaultControlMode: cameraSetting?.defaultControlMode,
          defaultTarget: cameraSetting?.defaultTarget,
          defaultPosition: cameraSetting?.defaultPosition,
          disableZoom: cameraSetting?.disableZoom,
        },
      });

      return cameraControlRef.current!;
    };

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
      });

      return environmentControlRef.current;
    };

    const initializeAudioControl = (animationControl: AnimationControl) => {
      audioControlRef.current = new AudioControl({
        audio: audioSetting?.url ? audioRef.current : null,
        animationControl,
        option: { defaultVolume: audioSetting?.defaultVolume },
      });

      return audioControlRef.current!;
    };

    return (
      <group>
        <Environment preset="city" />
        <primitive object={scene} />
        <ContactShadows position={[0, 0, 0]} scale={10} resolution={512} color="#000000" opacity={0.4} blur={0.5} />
        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry attach="geometry" args={[20, 20]} />
          <meshStandardMaterial ref={groundRef} attach="material" color="white" />
        </mesh>
        <OrbitControls ref={orbitControlRef} />
        <directionalLight position={[5, 5, 4]} intensity={0.8} />
        <ambientLight position={[5, 5, 4]} intensity={0.5} />
        <Sky ref={skyRef} sunPosition={[100, 110, 50]} />
      </group>
    );
  };

  const model = useMemo(() => <Model />, [url]);

  return (
    <div className={className} onClick={onClick}>
      <Suspense
        fallback={
          fallback?.(progress) ?? (
            <div className="relative w-full h-full grid place-items-center">
              <div className="w-fit h-fit relative">
                <Spinner className="animate-spin" />
                <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">{progress.toFixed()}%</div>
              </div>
            </div>
          )
        }
      >
        <Canvas ref={canvasRef} shadows>
          {model}
          <color ref={backgroundColorRef} attach="background" />
        </Canvas>
      </Suspense>
      <audio ref={audioRef}>
        <source src={audioSetting?.url}></source>
      </audio>
    </div>
  );
}

export default ModelViewer;
