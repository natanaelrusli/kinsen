import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Switch } from '@astryxdesign/core/Switch'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '../../shared/components/Icon'
import { PageHeader } from '../../shared/components/Primitives'
import { themeColorOptions, useSettingsStore } from '../../shared/state/settings-store'

export function SettingsPage() {
  const themeColor = useSettingsStore((state) => state.themeColor)
  const setThemeColor = useSettingsStore((state) => state.setThemeColor)
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn)
  const setWeekStartsOn = useSettingsStore((state) => state.setWeekStartsOn)
  const layoutDensity = useSettingsStore((state) => state.layoutDensity)
  const setLayoutDensity = useSettingsStore((state) => state.setLayoutDensity)
  const playfulMotion = useSettingsStore((state) => state.playfulMotion)
  const setPlayfulMotion = useSettingsStore((state) => state.setPlayfulMotion)
  const selectedTheme = themeColorOptions.find((option) => option.value === themeColor) ?? themeColorOptions[0]

  return (
    <div className="settings-page">
      <PageHeader eyebrow="PREFERENCES" title="Settings" description="Adjust the colors, spacing, and calendar defaults used throughout Kinsen." />

      <div className="settings-grid">
        <section className="settings-panel settings-theme-panel" aria-labelledby="theme-settings-title">
          <div className="settings-panel-heading">
            <span className="settings-panel-icon" aria-hidden="true"><Icon name="settings" size={18} /></span>
            <div>
              <p className="eyebrow">APPEARANCE</p>
              <h2 id="theme-settings-title">Accent color</h2>
              <p>Choose the color used for highlights and active controls.</p>
            </div>
          </div>

          <RadioList label="Theme color" isLabelHidden value={themeColor} onChange={(value) => setThemeColor(value as typeof themeColor)} htmlName="theme-color" orientation="vertical" className="theme-picker">
            {themeColorOptions.map((option) => (
              <RadioListItem
                key={option.value}
                label={option.label}
                value={option.value}
                aria-label={option.label}
                className={`theme-option${themeColor === option.value ? ' is-selected' : ''}`}
                startContent={<span className="theme-swatch" style={{ backgroundColor: option.swatch, marginLeft: '0.5rem' }} aria-hidden="true" />}
              />
            ))}
          </RadioList>

          <div className="theme-preview" aria-live="polite">
            <span className="theme-preview-swatch" style={{ backgroundColor: selectedTheme.swatch }} aria-hidden="true" />
            <span><strong>Current color: {selectedTheme.label}</strong><small>Your choice is saved on this device.</small></span>
            <span className="theme-preview-mark" aria-hidden="true"><Icon name="check" size={15} /></span>
          </div>
        </section>

        <section className="settings-panel settings-tune-panel" aria-labelledby="tune-settings-title">
          <div className="settings-panel-heading">
            <span className="settings-panel-icon is-spark" aria-hidden="true"><Icon name="calendar" size={18} /></span>
            <div>
              <p className="eyebrow">BEHAVIOR</p>
              <h2 id="tune-settings-title">Layout &amp; calendar</h2>
              <p>Control screen density, motion, and your calendar week start.</p>
            </div>
          </div>

          <div className="settings-controls">
            <Switch
              label="Compact layout"
              description="Reduce spacing to fit more information on screen."
              labelSpacing="spread"
              value={layoutDensity === 'compact'}
              onChange={(checked) => setLayoutDensity(checked ? 'compact' : 'comfortable')}
              className="settings-toggle-row"
            />

            <Switch
              label="Motion effects"
              description="Use gentle transitions. Your device’s reduced-motion setting always takes priority."
              labelSpacing="spread"
              value={playfulMotion}
              onChange={setPlayfulMotion}
              className="settings-toggle-row"
            />

            <div className="settings-week-select">
              <Selector className="settings-week-control" label="Week starts on" aria-describedby="week-start-hint" value={weekStartsOn} options={[{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }]} onChange={(value) => setWeekStartsOn(value as 'sunday' | 'monday')} />
              <small className="field-hint" id="week-start-hint">Sets the first day in your Calendar view.</small>
            </div>

          </div>
        </section>
      </div>

      <section className="settings-account-card" aria-labelledby="account-settings-link-title">
        <span className="settings-account-icon" aria-hidden="true"><Icon name="wallet" size={19} /></span>
        <div>
          <p className="eyebrow">ACCOUNT & DATA</p>
          <h2 id="account-settings-link-title">Account and data</h2>
          <p>Manage saved budget data and sign-in access separately from these preferences.</p>
        </div>
        <Button className="button button-secondary" label="Account settings" variant="secondary" href="/account" endContent={<Icon name="arrow" size={16} />} />
      </section>
    </div>
  )
}
