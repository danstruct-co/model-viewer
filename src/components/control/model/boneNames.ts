import type { Object3D } from 'three'

/**
 * 뼈와 이름이 같은 메시 이름 바꾸기 — GLTFLoader 하나 사는 이름 짓기(createUniqueName)는 밑 이름만 세서, 여러 조각 메시 'head' 가
 * 'head'·'head_1'·'head_2' 를 가져간 뒤 파일 원래 이름이 'head_1' 인 뼈가 같은 이름이 된다. 애니 트랙('head_1.quaternion')은
 * PropertyBinding.findNode 가 깊이 우선 처음 만난 노드에 붙어 얼굴 메시가 받고, 머리 뼈는 모션을 안 따랐다
 * (Seed-san.vrm 11.6°~20.4°, 스튜디오 QA 2026-10-13 R2 hard-matrix R2-B5).
 * 뼈 쪽은 그대로 두고(트랙·본매칭이 쓰는 이름) 메시만 '_mesh' 를 붙인다. 트랙을 바인딩하기 전(믹서·내보내기 전)에 불러야 한다
 */
export function renameMeshesShadowingBones(root: Object3D): number {
  const bones = new Set<string>()
  root.traverse((o) => {
    if ((o as Object3D & { isBone?: boolean }).isBone && o.name) bones.add(o.name)
  })
  let renamed = 0
  root.traverse((o) => {
    if (!(o as Object3D & { isMesh?: boolean }).isMesh || !bones.has(o.name)) return
    let name = `${o.name}_mesh`
    for (let i = 2; bones.has(name); i++) name = `${o.name}_mesh${i}`
    o.name = name
    renamed++
  })
  if (renamed) console.debug('[viewer] 뼈와 이름이 겹친 메시 이름 바꿈', renamed)
  return renamed
}
