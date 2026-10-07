import { AnimationAction, Quaternion } from 'three'
import { AnimationParams, State, type Range } from './types'

export default class AnimationControl {
  actions: AnimationAction[]
  duration: number = 0
  min: number = 0
  max: number = 0
  state: State = 'stop'
  autoplay?: boolean
  private currentTimescale: number = 1
  private boneRotationOffsets: Map<string, Quaternion> = new Map()
  private originalBoneQuaternions: Map<string, Quaternion> = new Map()

  stateChangedListeners: ((state: State) => void)[] = []
  timeUpdateListeners: ((time: number) => void)[] = []
  onSetTime?: (time: number) => void
  onLoop?: () => void
  onTimeScaleUpdate?: (value: number) => void

  constructor({ actions, mixer, option }: AnimationParams) {
    this.actions = Array.from(Object.values(actions).filter((action) => !!action)) as AnimationAction[]
    this.actions = this.actions.length ? this.actions.slice(0, this.actions[0].getRoot().children.length) : []
    this.duration = this.actions.length ? this.actions[0].getClip().duration ?? 0 : 0
    this.setRange(option?.range)
    this.autoplay = option?.autoplay

    if (this.autoplay) {
      this.play()
    }
    this.setTimeScale(option?.defaultTimeScale ?? 1.0)

    mixer.addEventListener('loop', () => {
      this.onLoop?.()
    })
  }

  play() {
    this.actions.forEach((action) => {
      action.paused = false
      action.play()
    })

    this.setState('play')
  }

  pause() {
    this.actions.forEach((action) => {
      action.paused = true
    })

    this.setState('pause')
  }

  stop() {
    this.actions.forEach((action) => {
      action.paused = true
    })

    this.setTime(this.min)
    this.setState('stop')
  }

  setRange(range: Range | undefined) {
    this.min = range?.min ?? 0
    this.max = range?.max ?? this.duration
  }

  private setState(state: State) {
    this.state = state
    this.stateChangedListeners.forEach((listen) => {
      listen(state)
    })
  }

  addStateChangeListener(listener: (state: State) => void) {
    this.stateChangedListeners.push(listener)
  }

  /** 등록한 리스너 해제 — 소비자 cleanup 용. 없으면 인스턴스가 재사용될 때 클로저가 살아남아 누수가 된다 */
  removeStateChangeListener(listener: (state: State) => void) {
    const index = this.stateChangedListeners.indexOf(listener)
    if (index >= 0) this.stateChangedListeners.splice(index, 1)
  }

  addTimeUpdateListener(listener: (time: number) => void) {
    this.timeUpdateListeners.push(listener)
  }

  setTime(time: number) {
    this.actions.forEach((action) => {
      action.time = time
    })

    this.timeUpdateListeners.forEach((listen) => {
      listen(time)
    })
    this.onSetTime?.(time)
  }

  get currentTime() {
    if (!this.actions.length) {
      return 0
    }

    // 길이 0 클립(키 1개 — 포즈)은 three AnimationAction 이 재생 시각을 길이로 나눠 time 이 NaN 이 된다.
    // 그대로 내보내면 소비자의 프레임 계산·편집 캡처가 NaN 을 퍼뜨린다(스튜디오 포즈 모션 편집 → 상반신 날아감·편집 목록 NaN, 종원 2026-10-06)
    const time = this.actions[0].time
    return Number.isFinite(time) ? time : 0
  }

  setTimeScale(scale: number) {
    this.actions.forEach((action) => {
      action.setEffectiveTimeScale(scale)
    })
    this.onTimeScaleUpdate?.(scale)
    this.currentTimescale = scale
  }

  get timescale() {
    return this.currentTimescale
  }

  updateOnFrame() {
    if (this.state !== 'play') {
      return
    }

    // 구간 밖이면 시작으로 — 끝을 넘을 때만 보면 구간 앞(min 미만)에서 재생할 때 구간을 지나쳐 계속 재생되고,
    // 구간 끝이 클립 끝에 붙으면 액션 자체 루프(LoopRepeat)가 0 으로 감아 max 초과가 안 잡힌다 (스튜디오 구간 루프, 종원 2026-10-01).
    // range 미지정이면 min = 0 이라 기존 동작 그대로
    if (this.currentTime > this.max || this.currentTime < this.min) {
      this.setTime(this.min)
      this.play()
      this.onLoop?.()
    }

    this.timeUpdateListeners.forEach((listen) => {
      listen(this.currentTime)
    })

    // bone rotation offset 적용
    this.applyBoneRotationOffsets()
  }

  /**
   * 특정 bone에 상대적인 quaternion offset 설정
   * @param boneName bone 이름
   * @param offsetQuaternion 적용할 quaternion offset (상대적)
   */
  setBoneRotationOffset(boneName: string, offsetQuaternion: Quaternion) {
    this.boneRotationOffsets.set(boneName, offsetQuaternion.clone())
  }

  /**
   * 특정 bone의 quaternion offset 제거
   * @param boneName bone 이름
   */
  removeBoneRotationOffset(boneName: string) {
    this.boneRotationOffsets.delete(boneName)
  }

  /**
   * 모든 bone rotation offset 제거
   */
  clearBoneRotationOffsets() {
    this.boneRotationOffsets.clear()
  }

  /**
   * 매 프레임마다 bone rotation offset 적용
   */
  private applyBoneRotationOffsets() {
    if (this.boneRotationOffsets.size === 0 || this.actions.length === 0) {
      return
    }

    const root = this.actions[0].getRoot()

    this.boneRotationOffsets.forEach((offset, boneName) => {
      root.traverse((node) => {
        if (node.name === boneName) {
          // 처음 발견된 본이면 원본 quaternion 저장
          if (!this.originalBoneQuaternions.has(boneName)) {
            this.originalBoneQuaternions.set(boneName, node.quaternion.clone())
          }

          // 원본 quaternion에 offset을 곱해서 적용 (누적 방지)
          const original = this.originalBoneQuaternions.get(boneName)!
          node.quaternion.copy(original).multiply(offset)
        }
      })
    })
  }
}
