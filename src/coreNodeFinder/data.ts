import type { CoreKey } from './types'

export const defaultCoreKeys: CoreKey[] = [
  { name: 'hips', constraint: 'INCLUDES' },
  { name: 'pelvis', constraint: 'INCLUDES' },
  { name: 'hip', constraint: 'INCLUDES' },
  { name: 'lowertorso', constraint: 'INCLUDES' },
  { name: 'torsolower', constraint: 'INCLUDES' },
]
export const exceptCoreKeys: CoreKey[] = [{ name: 'root', constraint: 'INCLUDES' }]
