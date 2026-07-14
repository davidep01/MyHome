export function shouldRecognizeDoorbell(ringing: boolean, hasCamera: boolean, vision: boolean, test = false) {
  return ringing && hasCamera && vision && !test
}
