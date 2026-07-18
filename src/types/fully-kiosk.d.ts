export {}

declare global {
  /**
   * Subset of Fully Kiosk Browser's JavaScript interface used by MyHome.
   * Every method is optional because older Fully versions expose fewer
   * capabilities and a normal browser exposes no interface at all.
   */
  interface FullyKioskJavascriptInterface {
    bind?: (eventName: string, javascript: string) => void
    getAverageLuma?: () => unknown
    getSensorValue?: (sensorType: number) => unknown
    getScreenBrightness?: () => unknown
    setScreenBrightness?: (level: number) => void
    getScreenOn?: () => unknown
    turnScreenOn?: () => void
    startMotionDetection?: () => void
    stopMotionDetection?: () => void
    isMotionDetectionRunning?: () => unknown
    getAudioVolume?: (stream: number) => unknown
    setAudioVolume?: (level: number, stream: number) => void
    playSound?: (url: string, loop: boolean, stream?: number) => void
    stopSound?: () => void
    textToSpeech?: (text: string) => void
    stopTextToSpeech?: () => void
  }

  interface Window {
    fully?: FullyKioskJavascriptInterface
    /** Stable callback invoked by scripts registered through fully.bind(). */
    __myhomeFullyDispatch?: (eventName: string) => void
    /** Prevents duplicate native bindings across React remounts/HMR. */
    __myhomeFullyBoundEvents?: Partial<Record<string, boolean>>
  }
}
