import { Bell } from 'lucide-react'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'
import { SettingRow } from '../../components/ui/SettingRow'
import { Toggle } from '../../components/ui/Toggle'

export interface AlertsTabProps {
  hapticsAlerts: boolean
  setHapticsAlerts: (val: boolean) => void
  outOfZoneWarning: boolean
  setOutOfZoneWarning: (val: boolean) => void
}

export function AlertsTab({
  hapticsAlerts,
  setHapticsAlerts,
  outOfZoneWarning,
  setOutOfZoneWarning,
}: AlertsTabProps) {
  return (
    <div id="panel-alerts" role="tabpanel" aria-labelledby="tab-alerts" className="tab-pane-content">
      <CollapsibleCard
        title="Sensory Alerts"
        icon={<Bell size={18} />}
        defaultOpen={true}
      >
        <SettingRow
          title="Haptic vibration"
          helpText="Uses device haptic motors for tactile game feedback."
          valueDisplay={hapticsAlerts ? 'On' : 'Off'}
          action={
            <Toggle
              label="Haptic feedback"
              hideLabel
              checked={hapticsAlerts}
              onChange={(e) => setHapticsAlerts(e.currentTarget.checked)}
            />
          }
        />

        <SettingRow
          title="Zone exit warning"
          helpText="Gives players a 30s grace period to re-enter before live coordinates are exposed."
          valueDisplay={outOfZoneWarning ? 'On' : 'Off'}
          action={
            <Toggle
              label="Zone exit warning"
              hideLabel
              checked={outOfZoneWarning}
              onChange={(e) => setOutOfZoneWarning(e.currentTarget.checked)}
            />
          }
        />
      </CollapsibleCard>
    </div>
  )
}
