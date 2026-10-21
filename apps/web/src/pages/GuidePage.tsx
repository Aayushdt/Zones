import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Crosshair,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Radar,
  QrCode,
  ShieldAlert,
  Trophy,
} from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

interface AccordionSection {
  id: string
  title: string
  content: string[]
}

const ACCORDION_SECTIONS: AccordionSection[] = [
  {
    id: 'setup',
    title: 'Before the round starts',
    content: [
      'Play strictly in permitted public outdoor parks or campuses. Stay out of roadways, restricted property, and hazardous areas.',
      'All players select Seeker (Hunter) or Hider (Runner) in the private lobby.',
      'Allow location permission while in use. GPS coordinates are only shared during active play and deleted immediately when the match concludes.',
      'Runners get a Head Start (typically 3 minutes) to disperse before Seekers are released to hunt.',
    ],
  },
  {
    id: 'radar',
    title: 'Radar pings & information visibility',
    content: [
      'Hunters see live teammate positions and receive Runner locations ONLY as scheduled periodic snapshots with age labels (e.g. 15s ago).',
      'Runners never see Hunter locations — complete stealth concealment is maintained.',
      'Stationary play warning: Runners who remain in one spot for too long trigger a warning before appearing on the next scheduled snapshot; it does not itself eliminate them.',
    ],
  },
  {
    id: 'tagging',
    title: 'Tagging & in-person verification',
    content: [
      'Primary Tag: Seekers use their camera to scan a short-lived single-use QR code displayed on the Runner’s screen.',
      'GPS proximity alone NEVER constitutes a tag. Physical line-of-sight and in-person verification is mandatory.',
      'Runner Fallback: A Runner can voluntarily confirm “I was tagged” on their own screen if camera scanning fails.',
      'Tagged Runners immediately become spectators; their live location is no longer broadcast.',
    ],
  },
  {
    id: 'zone',
    title: 'Circular zone & boundary shrink',
    content: [
      'If enabled, all players must remain within the circular GPS boundary (400m to 3,000m diameter).',
      'Players outside the boundary receive an audio/haptic warning.',
      'Remaining outside the boundary past the 30-second grace period makes the Runner live-visible to Seekers until they re-enter.',
      'In shrinking zone matches, the boundary contracts in scheduled stages with a 60-second advance warning.',
    ],
  },
  {
    id: 'outcomes',
    title: 'Win rules & emergency stop',
    content: [
      'Seekers Win: When all Runners have been tagged or have left the match.',
      'Hiders Win: When the round timer expires while at least one Runner remains untagged, or if all Seekers leave.',
      'Emergency Stop: Anyone can leave or ask to pause. Use the in-game End or Leave buttons at any time.',
    ],
  },
]

export function GuidePage() {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    setup: true,
    radar: false,
    tagging: false,
    zone: false,
    outcomes: false,
  })

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <main className="guide-screen">
      <div className="guide-container">
        {/* Header with back button */}
        <header className="guide-header">
          <Link to="/" className="guide-back-btn" title="Back to Home" aria-label="Back">
            <ArrowLeft size={20} />
          </Link>
          <div className="guide-title-wrap">
            <h1 className="guide-title">How to play</h1>
          </div>
        </header>

        {/* Short Illustrated Steps */}
        <section className="guide-steps-grid" aria-label="Game steps">
          <Card variant="surface" className="guide-step-card">
            <div className="guide-step-icon guide-step-icon--green">
              <Radar size={28} />
            </div>
            <span className="guide-step-number font-mono">STEP 01</span>
            <h3 className="guide-step-title">Disperse & Hide</h3>
            <p className="guide-step-desc">
              Hiders use the head start timer to scatter across the permitted park zone. Seekers stay frozen at spawn.
            </p>
          </Card>

          <Card variant="surface" className="guide-step-card">
            <div className="guide-step-icon guide-step-icon--amber">
              <ShieldAlert size={28} />
            </div>
            <span className="guide-step-number font-mono">STEP 02</span>
            <h3 className="guide-step-title">Scheduled Pings</h3>
            <p className="guide-step-desc">
              Seekers hunt using periodic radar snapshots. Stationary play warns first before pinging; it does not itself eliminate them.
            </p>
          </Card>

          <Card variant="surface" className="guide-step-card">
            <div className="guide-step-icon guide-step-icon--red">
              <QrCode size={28} />
            </div>
            <span className="guide-step-number font-mono">STEP 03</span>
            <h3 className="guide-step-title">In-Person QR Tag</h3>
            <p className="guide-step-desc">
              When caught, the Seeker scans the Hider’s match-bound QR code. Proximity never tags automatically.
            </p>
          </Card>

          <Card variant="surface" className="guide-step-card">
            <div className="guide-step-icon guide-step-icon--blue">
              <Trophy size={28} />
            </div>
            <span className="guide-step-number font-mono">STEP 04</span>
            <h3 className="guide-step-title">Survive the Clock</h3>
            <p className="guide-step-desc">
              If any Hider stays untagged when the timer expires, Hiders win! If all are tagged, Seekers claim victory.
            </p>
          </Card>
        </section>

        {/* Dual Role Cards */}
        <section className="guide-roles-section" aria-label="Game roles">
          <span className="section-label font-mono">TEAM ROLES</span>
          <div className="guide-roles-grid">
            {/* Seeker Card */}
            <Card variant="raised" className="role-card role-card--seeker">
              <div className="role-card__header">
                <div className="role-card__badge role-card__badge--seeker">
                  <Crosshair size={22} />
                  <span>SEEKERS (HUNTERS)</span>
                </div>
              </div>
              <ul className="role-card__list">
                <li>Receive scheduled radar snapshots of Hider locations.</li>
                <li>See live coordinates of fellow Seeker teammates.</li>
                <li>Tag Hiders by scanning their dynamic QR code in-person.</li>
                <li>Goal: Tag every active Hider before the clock expires.</li>
              </ul>
            </Card>

            {/* Hider Card */}
            <Card variant="raised" className="role-card role-card--hider">
              <div className="role-card__header">
                <div className="role-card__badge role-card__badge--hider">
                  <EyeOff size={22} />
                  <span>HIDERS (RUNNERS)</span>
                </div>
              </div>
              <ul className="role-card__list">
                <li>Get head start seconds to run and find cover.</li>
                <li>See fellow Hider teammates on the map to coordinate.</li>
                <li>Runners never see Hunter locations — stealth is maintained.</li>
                <li>Goal: Survive until the match round timer expires.</li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Accordion for Detailed Rules */}
        <section className="guide-accordion-section" aria-label="Detailed game rules">
          <span className="section-label font-mono">DETAILED FIELD REGULATIONS</span>
          <div className="guide-accordion-list">
            {ACCORDION_SECTIONS.map((sec) => {
              const isOpen = openSections[sec.id]
              return (
                <Card key={sec.id} variant="surface" className="accordion-card">
                  <button
                    type="button"
                    className="accordion-header"
                    onClick={() => toggleSection(sec.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="accordion-title">{sec.title}</span>
                    <span className="accordion-chevron" aria-hidden="true">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="accordion-body">
                      <ul>
                        {sec.content.map((bullet, idx) => (
                          <li key={idx}>{bullet}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </section>

        {/* Quick action buttons */}
        <footer className="guide-footer-actions">
          <Link to="/">
            <Button variant="secondary-outline" size="md">
              Back to Home
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost" size="md">
              Settings & Privacy
            </Button>
          </Link>
        </footer>
      </div>
    </main>
  )
}
