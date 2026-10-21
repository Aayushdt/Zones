import { Layers, MapPin, Maximize2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'
import { SettingRow } from '../../components/ui/SettingRow'
import { Slider } from '../../components/ui/Slider'
import { Toggle } from '../../components/ui/Toggle'
import { ZonePicker } from '../../components/ZonePicker'

export interface ZoneTabProps {
  fixedZone: boolean
  setFixedZone: (val: boolean) => void
  diameter: number
  setDiameter: (val: number) => void
  shrinkStages: number
  setShrinkStages: (val: number) => void
  shrinkIntervalMinutes: number
  setShrinkIntervalMinutes: (val: number) => void
  finalRadius: number
  setFinalRadius: (val: number) => void
  currentRadius: number
  timelineStages: Array<{ stage: number; label: string; radius: number }>
  latitude: string
  longitude: string
  setLatitude: (val: string) => void
  setLongitude: (val: string) => void
  nextRadiusPreview?: number
  setFullscreenMapOpen: (val: boolean) => void
}

export function ZoneTab({
  fixedZone,
  setFixedZone,
  diameter,
  setDiameter,
  shrinkStages,
  setShrinkStages,
  shrinkIntervalMinutes,
  setShrinkIntervalMinutes,
  finalRadius,
  setFinalRadius,
  currentRadius,
  timelineStages,
  latitude,
  longitude,
  setLatitude,
  setLongitude,
  nextRadiusPreview,
  setFullscreenMapOpen,
}: ZoneTabProps) {
  return (
    <div id="panel-zone" role="tabpanel" aria-labelledby="tab-zone" className="tab-pane-content">
      <CollapsibleCard
        title="Boundary Circle"
        icon={<MapPin size={18} />}
        defaultOpen={true}
      >
        <SettingRow
          title="Circle play zone"
          helpText="Enforces circular play area using accuracy-aware GPS checks."
          valueDisplay={fixedZone ? `${diameter}m` : 'Off'}
          action={
            <Toggle
              label="Circle zone"
              hideLabel
              checked={fixedZone}
              onChange={(e) => setFixedZone(e.currentTarget.checked)}
            />
          }
        />

        {fixedZone && (
          <SettingRow
            title="Starting diameter"
            helpText="Starting circle diameter for the outdoor field."
            valueDisplay={`${diameter}m`}
          >
            <Slider
              label="Starting diameter"
              hideHeader
              value={diameter}
              min={400}
              max={3000}
              step={100}
              unit="m"
              onChange={(val) => setDiameter(val % 2 === 0 ? val : val + 1)}
            />
          </SettingRow>
        )}
      </CollapsibleCard>

      {fixedZone && (
        <CollapsibleCard
          title="Zone Shrink Schedule"
          icon={<Layers size={18} />}
          defaultOpen={true}
        >
          <SettingRow
            title="Shrink stages"
            helpText="Number of concentric shrink contractions."
            valueDisplay={shrinkStages > 0 ? `${shrinkStages} stages` : 'Static'}
          >
            <Slider
              label="Shrink stages"
              hideHeader
              value={shrinkStages}
              min={0}
              max={10}
              step={1}
              onChange={setShrinkStages}
            />
          </SettingRow>

          {shrinkStages > 0 && (
            <>
              <SettingRow
                title="Shrink interval"
                helpText="Time between each shrink contraction."
                valueDisplay={`${shrinkIntervalMinutes} min`}
              >
                <Slider
                  label="Shrink interval"
                  hideHeader
                  value={shrinkIntervalMinutes}
                  min={2}
                  max={30}
                  step={1}
                  unit="min"
                  onChange={setShrinkIntervalMinutes}
                />
              </SettingRow>

              <SettingRow
                title="Final safe radius"
                helpText="Minimum circle radius at match endgame."
                valueDisplay={`${finalRadius}m`}
              >
                <Slider
                  label="Final safe radius"
                  hideHeader
                  value={finalRadius}
                  min={50}
                  max={currentRadius}
                  step={25}
                  unit="m"
                  onChange={setFinalRadius}
                />
              </SettingRow>
            </>
          )}

          {/* Horizontal Shrink Timeline with Scaled Circles */}
          {shrinkStages > 0 && (
            <div className="shrink-timeline-box">
              <span className="shrink-timeline-title font-mono text-xs">SHRINK TIMELINE</span>
              <div className="shrink-timeline-stages">
                {timelineStages.map((st) => (
                  <div key={st.stage} className="timeline-stage-item">
                    <div
                      className="timeline-stage-circle"
                      style={{
                        width: `${Math.max(22, (st.radius / currentRadius) * 44)}px`,
                        height: `${Math.max(22, (st.radius / currentRadius) * 44)}px`,
                      }}
                    />
                    <span className="timeline-stage-label font-mono text-xs">{st.label}</span>
                    <span className="timeline-stage-radius font-mono text-xs">{st.radius}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleCard>
      )}

      {/* Mobile & Tablet Interactive Map Preview */}
      {fixedZone && (
        <Card variant="raised" className="mobile-zone-map-card">
          <div className="mobile-map-header">
            <div className="preview-indicator">
              <span className="preview-dot" />
              <span className="preview-title font-mono">ZONE MAP PREVIEW</span>
            </div>
            <Button
              size="sm"
              variant="secondary-outline"
              icon={<Maximize2 size={14} />}
              onClick={() => setFullscreenMapOpen(true)}
              title="Expand map to fullscreen"
            >
              Expand
            </Button>
          </div>

          <div className="preview-map-container">
            <ZonePicker
              center={
                latitude && longitude
                  ? { lat: Number(latitude), lon: Number(longitude) }
                  : null
              }
              radiusM={currentRadius}
              nextRadiusM={nextRadiusPreview}
              onCenterChange={(pt) => {
                setLatitude(String(pt.lat.toFixed(6)))
                setLongitude(String(pt.lon.toFixed(6)))
              }}
            />
          </div>

          <div className="preview-legend">
            <div className="legend-item">
              <span className="legend-color legend-color--blue" />
              <span>Active Boundary ({currentRadius}m)</span>
            </div>
            {nextRadiusPreview && (
              <div className="legend-item">
                <span className="legend-color legend-color--amber" />
                <span>Next Shrink ({nextRadiusPreview}m dashed)</span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
