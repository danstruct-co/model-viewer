import { AnimationAction, AnimationMixer } from 'three'

export type State = 'stop' | 'play' | 'pause'

export type Range = { min?: number, max?: number }

export type AnimationParams = {
  actions: { [x: string]: AnimationAction | null }
  mixer: AnimationMixer
  option?: {
    autoplay?: boolean
    defaultTimeScale?: number
    range?: Range
  }
}
