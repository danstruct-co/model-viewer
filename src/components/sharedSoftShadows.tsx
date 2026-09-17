'use client'

import { SoftShadows } from '@react-three/drei'
import { useEffect, useState, useSyncExternalStore } from 'react'

// drei SoftShadows 는 마운트 때 전역 THREE.ShaderChunk.shadowmap_pars_fragment 에 PCSS 함수를 덧대고, 언마운트 때
// "자기 마운트 시점 값"으로 되돌린다. 뷰어가 둘 이상 동시에 뜨면 두 번째부터 이미 덧대진 청크에 또 덧대
// 'PCSS' : function already has a body 셰이더 에러 → 그 뒤 컴파일되는 그림자 재질(캐릭터)이 전부 미렌더
// (스튜디오 편집 확인 팝업 실측 2026-09-14 — useProgram: program not valid 512건). 해제 순서가 꼬이면 덧댄 청크가
// 전역에 남기도 한다. → 동시에 뜬 뷰어 중 먼저 등록된 하나만 SoftShadows 를 렌더하고(나머지는 이미 덧대진 청크로
// 컴파일돼 결과 동일), 그 뷰어가 내려가면 다음 뷰어가 이어받는다.
// ⚠ 알려진 한계 (파트라슈 리뷰 2026-09-17, 별건): 소유자(owners[0])가 먼저 내려가면 drei SoftShadows 언마운트가
// 전역 청크를 "자기 마운트 시점 값"= 원본으로 되돌린다. 남은 뷰어가 다시 패치하기 전에 컴파일되는 재질은
// PCSS 없이 굳는다. 제대로 고치려면 ShaderChunk 패치를 이 모듈이 참조 카운트로 직접 쥐고 있어야 한다
// (drei 의 마운트/언마운트에 맡기지 않는다). 지금 뷰어가 둘이 되는 경로는 스튜디오 편집 비교 팝업뿐이다.
// id 는 모듈 카운터 — Canvas 마다 React 루트가 달라 useId 는 뷰어끼리 같은 값이 나올 수 있다
let seq = 0
const owners: number[] = []
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const notify = () => listeners.forEach((listener) => listener())

export default function SharedSoftShadows(props: Parameters<typeof SoftShadows>[0]) {
  const [id] = useState(() => ++seq)
  useEffect(() => {
    owners.push(id)
    notify()
    return () => {
      owners.splice(owners.indexOf(id), 1)
      notify()
    }
  }, [id])
  const isOwner = useSyncExternalStore(
    subscribe,
    () => owners[0] === id,
    () => false
  )
  return isOwner ? <SoftShadows {...props} /> : null
}
