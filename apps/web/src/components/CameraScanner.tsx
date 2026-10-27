import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Flashlight, FlashlightOff } from 'lucide-react'

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean
}

interface TorchTrack extends MediaStreamTrack {
  getCapabilities: () => TorchCapabilities
}

export default function CameraScanner({
  onToken,
  onClose,
}: {
  onToken: (token: string) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tokenHandler = useRef(onToken)
  const activeTrackRef = useRef<MediaStreamTrack | null>(null)

  const [message, setMessage] = useState('Requesting camera…')
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  useEffect(() => {
    tokenHandler.current = onToken
  }, [onToken])

  useEffect(() => {
    const videoElement = video.current
    let stopped = false
    let frame: number | null = null
    let stream: MediaStream | null = null

    const stop = () => {
      stopped = true
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      if (videoElement) {
        videoElement.pause()
        videoElement.srcObject = null
      }
      activeTrackRef.current = null
      setTorchSupported(false)
      setTorchOn(false)
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
    }

    const scan = () => {
      if (stopped) return
      const surface = canvas.current
      if (videoElement && surface && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        surface.width = videoElement.videoWidth
        surface.height = videoElement.videoHeight
        const context = surface.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(videoElement, 0, 0, surface.width, surface.height)
          const image = context.getImageData(0, 0, surface.width, surface.height)
          const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
          if (decoded?.data) {
            stop()
            tokenHandler.current(decoded.data)
            return
          }
        }
      }
      if (!stopped) {
        frame = requestAnimationFrame(scan)
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera is not supported on this browser or requires a secure HTTPS connection.')
      return stop
    }

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((camera) => {
        if (stopped) {
          camera.getTracks().forEach((track) => track.stop())
          return
        }
        stream = camera
        const track = camera.getVideoTracks()[0]
        if (track) {
          activeTrackRef.current = track
          try {
            const torchTrack = track as TorchTrack
            if (typeof torchTrack.getCapabilities === 'function') {
              const capabilities = torchTrack.getCapabilities()
              if (Boolean(capabilities.torch)) {
                setTorchSupported(true)
              }
            }
          } catch {
            setTorchSupported(false)
          }
        }

        if (videoElement) {
          videoElement.srcObject = camera
          void videoElement.play().catch(() => {
            // Autoplay may be deferred until user interaction
          })
          setMessage('Point the camera at a Runner QR.')
        }
        frame = requestAnimationFrame(scan)
      })
      .catch((err: unknown) => {
        if (stopped) return
        const isPermission =
          err instanceof DOMException &&
          (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        if (isPermission) {
          setMessage('Camera permission denied. Allow camera access in site settings, or have the Runner use "I was tagged".')
        } else {
          setMessage('Camera unavailable. Check device permissions or ask the Runner to use "I was tagged".')
        }
      })

    return stop
  }, [])

  const toggleTorch = async () => {
    const track = activeTrackRef.current
    if (!track) return
    const nextState = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet],
      })
      setTorchOn(nextState)
    } catch {
      setTorchSupported(false)
    }
  }

  return (
    <div className="tag-scanner">
      <video ref={video} playsInline muted aria-label="Camera scanning Runner tag QR" />
      <canvas ref={canvas} className="visually-hidden" />
      <p role="status">{message}</p>
      <div className="tag-scanner__actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
        {torchSupported && (
          <button
            className="welcome__secondary"
            type="button"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
            aria-pressed={torchOn}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            {torchOn ? <FlashlightOff size={16} /> : <Flashlight size={16} />}
            <span>{torchOn ? 'Torch On' : 'Torch Off'}</span>
          </button>
        )}
        <button className="welcome__secondary" onClick={onClose} type="button">
          Close camera
        </button>
      </div>
    </div>
  )
}
