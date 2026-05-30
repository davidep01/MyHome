/**
 * Doorbell → fullscreen video alert configuration.
 * Point `doorbellEntityId` at the binary_sensor/event that fires when the bell rings,
 * and `cameraEntityId` at the camera to show. Edit to match your Home Assistant setup.
 */
export interface DoorbellConfig {
  doorbellEntityId: string
  cameraEntityId: string
  /** States considered "ringing" (rising edge into one of these triggers the alert). */
  activeStates: string[]
  /** Auto-dismiss after N ms even if the sensor stays active (0 = never). */
  autoDismissMs: number
}

export const doorbellConfig: DoorbellConfig = {
  doorbellEntityId: 'binary_sensor.campanello',
  cameraEntityId: 'camera.ingresso',
  activeStates: ['on', 'ringing', 'detected', 'pressed'],
  autoDismissMs: 60_000,
}
