import { AnimationAction, AnimationClip, KeyframeTrack, Quaternion } from 'three'
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
    this.stripFirstFrameFromActions(this.actions)
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

    return this.actions[0].time
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

    if (this.currentTime > this.max) {
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

  private stripFirstFrameFromActions(actions: AnimationAction[]) {
    const processed = new Set<AnimationClip>()

    actions.forEach((action) => {
      const clip = action.getClip()
      if (processed.has(clip)) {
        return
      }

      processed.add(clip)
      this.stripFirstFrameFromClip(clip)
    })
  }

  private stripFirstFrameFromClip(clip: AnimationClip) {
    if (!clip.tracks.some((track) => track.times.length > 1)) {
      return
    }

    let updated = false
    const sanitizedTracks = clip.tracks.map((track) => {
      if (track.times.length <= 1) {
        return track
      }

      updated = true
      return this.removeFirstKeyframeFromTrack(track)
    })

    if (!updated) {
      return
    }

    clip.tracks = sanitizedTracks
    clip.resetDuration()
  }

  private removeFirstKeyframeFromTrack(track: KeyframeTrack) {
    const sanitizedTrack = track.clone()
    const keyCount = sanitizedTrack.times.length - 1

    if (keyCount <= 0) {
      return sanitizedTrack
    }

    const firstTime = sanitizedTrack.times[1]
    const newTimes = new Float32Array(keyCount)
    for (let i = 0; i < keyCount; i += 1) {
      newTimes[i] = sanitizedTrack.times[i + 1] - firstTime
    }

    const valueSize = sanitizedTrack.getValueSize()
    const newValues = sanitizedTrack.values.slice(valueSize)

    sanitizedTrack.times = newTimes
    sanitizedTrack.values = newValues

    return sanitizedTrack
  }
}
