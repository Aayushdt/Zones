import { Coins } from 'lucide-react'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'
import { SettingRow } from '../../components/ui/SettingRow'
import { Toggle } from '../../components/ui/Toggle'

export interface EconomyTabProps {
  itemsEnabled: boolean
  setItemsEnabled: (val: boolean) => void
}

export function EconomyTab({
  itemsEnabled,
  setItemsEnabled,
}: EconomyTabProps) {
  return (
    <div id="panel-economy" role="tabpanel" aria-labelledby="tab-economy" className="tab-pane-content">
      <CollapsibleCard
        title="Tactical Field Items"
        icon={<Coins size={18} />}
        defaultOpen={true}
      >
        <SettingRow
          title="Tactical items"
          helpText="Free tactical items including Scans, Alarms, Decoys, and Zone Shields. No locks or paywalls."
          valueDisplay={itemsEnabled ? 'On' : 'Off'}
          action={
            <Toggle
              label="Tactical items"
              hideLabel
              checked={itemsEnabled}
              onChange={(e) => setItemsEnabled(e.currentTarget.checked)}
            />
          }
        />
      </CollapsibleCard>
    </div>
  )
}
