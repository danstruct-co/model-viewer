import type { Material, Object3D, Texture } from 'three'

/** 다 쓴 모델의 GPU 자원 놓기 — 지오메트리·재질·재질이 쥔 텍스처·스킨 본 텍스처. 객체 자체는 참조가 끊기면 GC 가 거둔다 */
export function disposeObject(root: Object3D) {
  const materials = new Set<Material>()
  root.traverse((o) => {
    const mesh = o as Object3D & {
      geometry?: { dispose: () => void }
      material?: Material | Material[]
      skeleton?: { dispose: () => void }
    }
    mesh.geometry?.dispose()
    mesh.skeleton?.dispose()
    for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) materials.add(m)
  })
  const textures = new Set<Texture>()
  const collect = (value: unknown) => {
    if ((value as Texture | null)?.isTexture) textures.add(value as Texture)
  }
  materials.forEach((m) => {
    Object.values(m).forEach(collect)
    // 셰이더 재질(MToon 툰 등)은 텍스처를 uniforms 에 든다(map 은 그 getter) — 안 보면 Toon 을 켠 채 모션을 바꿀 때 텍스처가 안 풀렸다
    // (스튜디오 QA 2026-10-13 R4 explore R4-B4, 한 번에 +11)
    const uniforms = (m as Material & { uniforms?: Record<string, { value?: unknown }> }).uniforms
    if (uniforms) Object.values(uniforms).forEach((u) => collect(u?.value))
    m.dispose()
  })
  textures.forEach((t) => t.dispose())
}
