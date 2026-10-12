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
  materials.forEach((m) => {
    for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) (value as Texture).dispose()
    m.dispose()
  })
}
