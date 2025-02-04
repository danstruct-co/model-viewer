import AnimationControl from '../animation/animationControl'
import { State as AnimationState } from '../animation/types'
import { AudioControlParams } from './types'

export default class AudioControl {
  audio: HTMLAudioElement | null
  animationControl: AnimationControl
  time: number = 0
  state: AnimationState = 'stop'

  constructor({ audio, animationControl, option }: AudioControlParams) {
    this.audio = audio
    this.animationControl = animationControl

    animationControl.addStateChangeListener((state) => {
      this.onAnimationStateChanged(state)
    })
    animationControl.onSetTime = (time) => {
      this.onSetAnimationTime(time)
    }
    animationControl.onTimeScaleUpdate = (value) => {
      this.onSetAnimationTimeScale(value)
    }
    animationControl.onLoop = () => {
      this.onSetAnimationTime(0)
    }
    animationControl.addTimeUpdateListener((time) => (this.time = time))

    this.setVolume(option?.defaultVolume ?? 1.0)

    if (animationControl.autoplay) {
      this.autoplay()
    }
  }

  private autoplay() {
    this.state = 'play'
    if (!this.audio || this.audio?.volume === 0) {
      return
    }

    this.audio.play()
  }

  private onAnimationStateChanged(state: AnimationState) {
    if (!this.audio) {
      return
    }

    this.state = state
    switch (state) {
      case 'play':
        this.audio.play()
        break

      case 'pause':
        this.audio.pause()
        break

      case 'stop':
        this.audio.pause()
        this.audio.currentTime = 0
    }
  }

  private onSetAnimationTime(time: number) {
    if (!this.audio) {
      return
    }

    this.audio.currentTime = time
  }

  private onSetAnimationTimeScale(value: number) {
    if (!this.audio) {
      return
    }

    this.audio.playbackRate = value
  }

  setVolume(value: number) {
    if (!this.audio) {
      return
    }

    if (this.audio.volume === 0 && this.state === 'play') {
      this.audio.play()
      this.audio.currentTime = this.time
    }

    this.audio.volume = value
  }

  get volume() {
    return this.audio?.volume
  }
}
