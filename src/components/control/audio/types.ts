import AnimationControl from '../animation/animationControl'

export type AudioControlParams = {
  audio: HTMLAudioElement | null
  animationControl: AnimationControl
  option?: {
    defaultVolume?: number
  }
}
