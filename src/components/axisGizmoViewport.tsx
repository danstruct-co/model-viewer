// 축 기즈모 뷰포트 — drei GizmoViewport 클론 + 확장 (종원 2026-09-08):
// 음축(−X/−Y/−Z)도 라벨 달린 풀사이즈 구로 표시 (drei 는 음축이 라벨 없는 0.75× 점),
// 구 크기 1.2×. 클릭 동작은 drei 컨텍스트(tweenCamera) 그대로.
import * as React from 'react'
import { useGizmoContext } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { CanvasTexture } from 'three'

const AXIS_COLORS = ['#ff2060', '#20df80', '#2080ff'] as const
const LABEL_COLOR = 'black' // drei 기본과 동일 — 기존 양축 라벨 룩 유지
const FONT = '18px Inter var, Arial, sans-serif'
const HEAD_SCALE = 1.2 // 종원 튜닝 (2026-09-08)
const ROOT_SCALE = 32 // GizmoHelper 가상 카메라 기준 크기 (drei 기본 40 의 0.8×)

function Axis({ color, rotation }: { color: string; rotation: [number, number, number] }) {
  return (
    <group rotation={rotation}>
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.8, 0.05, 0.05]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

function AxisHead({
  arcStyle,
  label,
  position,
}: {
  arcStyle: string
  label: string
  position: [number, number, number]
}) {
  const gl = useThree((state) => state.gl)
  const { tweenCamera } = useGizmoContext()
  const texture = React.useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')!
    context.beginPath()
    context.arc(32, 32, 16, 0, 2 * Math.PI)
    context.closePath()
    context.fillStyle = arcStyle
    context.fill()
    context.font = FONT
    context.textAlign = 'center'
    context.fillStyle = LABEL_COLOR
    context.fillText(label, 32, 40)
    return new CanvasTexture(canvas)
  }, [arcStyle, label])
  const [active, setActive] = React.useState(false)
  const scale = (active ? 1.2 : 1) * HEAD_SCALE
  return (
    <sprite
      scale={scale}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation()
        setActive(true)
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setActive(false)
      }}
      onPointerDown={(e) => {
        tweenCamera(e.object.position)
        e.stopPropagation()
      }}
    >
      <spriteMaterial
        map={texture}
        map-anisotropy={gl.capabilities.getMaxAnisotropy() || 1}
        alphaTest={0.3}
        toneMapped={false}
      />
    </sprite>
  )
}

export function AxisGizmoViewport() {
  const [colorX, colorY, colorZ] = AXIS_COLORS
  return (
    <group scale={ROOT_SCALE}>
      <Axis color={colorX} rotation={[0, 0, 0]} />
      <Axis color={colorY} rotation={[0, 0, Math.PI / 2]} />
      <Axis color={colorZ} rotation={[0, -Math.PI / 2, 0]} />
      <AxisHead arcStyle={colorX} position={[1, 0, 0]} label="X" />
      <AxisHead arcStyle={colorY} position={[0, 1, 0]} label="Y" />
      <AxisHead arcStyle={colorZ} position={[0, 0, 1]} label="Z" />
      <AxisHead arcStyle={colorX} position={[-1, 0, 0]} label="-X" />
      <AxisHead arcStyle={colorY} position={[0, -1, 0]} label="-Y" />
      <AxisHead arcStyle={colorZ} position={[0, 0, -1]} label="-Z" />
    </group>
  )
}
