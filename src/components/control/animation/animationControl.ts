import { AnimationAction } from 'three'
import { AnimationParams, State } from './types'

export default class AnimationControl {
  actions: AnimationAction[]
  duration: number = 0
  state: State = 'stop'
  autoplay?: boolean
  private currentTimescale: number = 1

  stateChangedListeners: ((state: State) => void)[] = []
  timeUpdateListeners: ((time: number) => void)[] = []
  onSetTime?: (time: number) => void
  onLoop?: () => void
  onTimeScaleUpdate?: (value: number) => void

  constructor({ actions, mixer, option }: AnimationParams) {
    this.actions = Array.from(Object.values(actions).filter((action) => !!action)) as AnimationAction[]
    this.actions = this.actions.length ? this.actions.slice(0, this.actions[0].getRoot().children.length) : []
    this.duration = this.actions.length ? this.actions[0].getClip().duration ?? 0 : 0
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

    this.setTime(0)
    this.setState('stop')
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

    this.timeUpdateListeners.forEach((listen) => {
      listen(this.currentTime)
    })
  }
}
