import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

export default function CameraScanner({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tokenHandler = useRef(onToken)
  const [message, setMessage] = useState('Requesting camera…')

  useEffect(() => { tokenHandler.current = onToken }, [onToken])
  useEffect(() => {
    let stopped = false
    let frame = 0
    let stream: MediaStream | null = null
    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
    const scan = () => {
      if (stopped) return
      const element = video.current
      const surface = canvas.current
      if (element && surface && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        surface.width = element.videoWidth; surface.height = element.videoHeight
        const context = surface.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(element, 0, 0, surface.width, surface.height)
          const image = context.getImageData(0, 0, surface.width, surface.height)
          const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
          if (decoded?.data) { stop(); tokenHandler.current(decoded.data); return }
        }
      }
      frame = requestAnimationFrame(scan)
    }
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((camera) => {
        if (stopped) { camera.getTracks().forEach((track) => track.stop()); return }
        stream = camera
        if (video.current) { video.current.srcObject = camera; void video.current.play(); setMessage('Point the camera at a Runner QR.') }
        frame = requestAnimationFrame(scan)
      })
      .catch(() => setMessage('Camera unavailable. Check permission and secure HTTPS, then ask the Runner to use “I was tagged” if needed.'))
    return stop
  }, [])

  return <div className="tag-scanner">
    <video ref={video} playsInline muted aria-label="Camera scanning Runner tag QR" />
    <canvas ref={canvas} className="visually-hidden" />
    <p role="status">{message}</p>
    <button className="welcome__secondary" onClick={onClose} type="button">Close camera</button>
  </div>
}
