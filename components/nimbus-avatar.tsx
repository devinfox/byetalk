'use client'

import { useEffect, useRef } from 'react'
import Lottie, { LottieRefCurrentProps } from 'lottie-react'
import nimbusTalkingAnimation from '@/public/nimbus-talking.json'

interface NimbusAvatarProps {
  isTalking?: boolean
  size?: number
  className?: string
}

export function NimbusAvatar({ isTalking = false, size = 120, className = '' }: NimbusAvatarProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null)

  useEffect(() => {
    if (lottieRef.current) {
      if (isTalking) {
        lottieRef.current.play()
      } else {
        // When not talking, pause and show a neutral frame
        lottieRef.current.goToAndStop(0, true)
      }
    }
  }, [isTalking])

  return (
    <div className={`nimbus-avatar ${className}`} style={{ width: size, height: size }}>
      <Lottie
        lottieRef={lottieRef}
        animationData={nimbusTalkingAnimation}
        loop={isTalking}
        autoplay={isTalking}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

export default NimbusAvatar
