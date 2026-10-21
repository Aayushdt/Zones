import { Clock, Radar } from 'lucide-react'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'
import { SettingRow } from '../../components/ui/SettingRow'
import { Slider } from '../../components/ui/Slider'
import { Toggle } from '../../components/ui/Toggle'

export interface GameplayTabProps {
  timerEnabled: boolean
  setTimerEnabled: (val: boolean) => void
  duration: number
  setDuration: (val: number) => void
  durationOptions: ReadonlyArray<{ label: string; value: string }>
  headStart: number
  setHeadStart: (val: number) => void
  pingMinutes: number | null
  setPingMinutes: (val: number | null) => void
  pingOptions: ReadonlyArray<{ label: string; value: string }>
}

export function GameplayTab({
  timerEnabled,
  setTimerEnabled,
  duration,
  setDuration,
  durationOptions,
  headStart,
  setHeadStart,
  pingMinutes,
  setPingMinutes,
  pingOptions,
}: GameplayTabProps) {
  return (
    <div id="panel-gameplay" role="tabpanel" aria-labelledby="tab-gameplay" className="tab-pane-content">
      <CollapsibleCard
        title="Timing & Duration"
        icon={<Clock size={18} />}
        defaultOpen={true}
      >
        <SettingRow
          title="Round timer"
          helpText="Authoritative server timer that decides match completion."
          valueDisplay={timerEnabled ? `${duration} min` : 'Off'}
          action={
            <Toggle
              label="Round timer"
              hideLabel
              checked={timerEnabled}
              onChange={(e) => setTimerEnabled(e.currentTarget.checked)}
            />
          }
        />

        {timerEnabled && (
          <SettingRow
            title="Match duration"
            helpText="Defines total match length including head start."
            valueDisplay={`${duration} min`}
          >
            <div className="button-group-row">
              {durationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={duration === Number(opt.value)}
                  onClick={() => setDuration(Number(opt.value))}
                  className={`mini-segment-btn ${duration === Number(opt.value) ? 'is-selected' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingRow>
        )}

        <SettingRow
          title="Hider head start"
          helpText="Seekers remain frozen while Hiders disperse across the field."
          valueDisplay={headStart > 0 ? `${headStart}s` : 'None'}
        >
          <Slider
            label="Hider head start"
            hideHeader
            value={headStart}
            min={0}
            max={300}
            step={30}
            unit="s"
            ticks={[0, 30, 60, 180, 300]}
            onChange={setHeadStart}
          />
        </SettingRow>
      </CollapsibleCard>

      <CollapsibleCard
        title="Radar & Tagging"
        icon={<Radar size={18} />}
        defaultOpen={true}
      >
        <SettingRow
          title="Seeker ping interval"
          helpText="Controls frequency of periodic radar snapshots sent to Seekers."
          valueDisplay={pingMinutes === null ? 'Off' : `${pingMinutes} min`}
        >
          <select
            className="form-control font-mono"
            value={pingMinutes === null ? 'off' : String(pingMinutes)}
            onChange={(e) => setPingMinutes(e.currentTarget.value === 'off' ? null : Number(e.currentTarget.value))}
            aria-label="Seeker ping interval"
          >
            {pingOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label === 'Off' ? 'Off (No automatic pings)' : `${opt.label} interval`}
              </option>
            ))}
          </select>
        </SettingRow>
      </CollapsibleCard>
    </div>
  )
}
