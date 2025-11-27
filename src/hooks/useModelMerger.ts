import { useState } from 'react'
import { ModelMerger } from '../utils/modelMerger/modelMerger'
import type { ModelMergerOptions } from '../utils/modelMerger/types'

export default function useModelMerger() {
  const [mergedUrl, setMergedUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const merge = async ({ glbUrl, leftHandGlbUrl, rightHandGlbUrl }: Pick<ModelMergerOptions, 'glbUrl' | 'leftHandGlbUrl' | 'rightHandGlbUrl'>) => {
    setIsLoading(true)
    setProgress(0)
    setError(null)
    setMergedUrl(null)

    const merger = new ModelMerger()
    try {
      const blobUrl = await merger.merge({ glbUrl, leftHandGlbUrl, rightHandGlbUrl, onProgress: setProgress })
      setMergedUrl(blobUrl)
    } catch (error) {
      setError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      setIsLoading(false)
    }
  }

  return { merge, mergedUrl, progress, error, isLoading }
}
