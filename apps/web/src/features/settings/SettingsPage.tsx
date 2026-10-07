import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Switch } from '@astryxdesign/core/Switch'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Icon } from '../../shared/components/Icon'
import { PageHeader } from '../../shared/components/Primitives'
import { colorModeOptions, cornerStyleOptions, dashboardSectionOptions, headingStyleOptions, surfaceStyleOptions, themeColorOptions, useSettingsStore } from '../../shared/state/settings-store'

export function SettingsPage() {
  const colorMode = useSettingsStore((state) => state.colorMode)
  const setColorMode = useSettingsStore((state) => state.setColorMode)
  const themeColor = useSettingsStore((state) => state.themeColor)
  const setThemeColor = useSettingsStore((state) => state.setThemeColor)
  const surfaceStyle = useSettingsStore((state) => state.surfaceStyle)
  const setSurfaceStyle = useSettingsStore((state) => state.setSurfaceStyle)
  const cornerStyle = useSettingsStore((state) => state.cornerStyle)
  const setCornerStyle = useSettingsStore((state) => state.setCornerStyle)
  const headingStyle = useSettingsStore((state) => state.headingStyle)
  const setHeadingStyle = useSettingsStore((state) => state.setHeadingStyle)
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn)
  const setWeekStartsOn = useSettingsStore((state) => state.setWeekStartsOn)
  const layoutDensity = useSettingsStore((state) => state.layoutDensity)
  const setLayoutDensity = useSettingsStore((state) => state.setLayoutDensity)
  const playfulMotion = useSettingsStore((state) => state.playfulMotion)
  const setPlayfulMotion = useSettingsStore((state) => state.setPlayfulMotion)
  const dashboardSections = useSettingsStore((state) => state.dashboardSections)
  const setDashboardSection = useSettingsStore((state) => state.setDashboardSection)
  const selectedTheme = themeColorOptions.find((option) => option.value === themeColor) ?? themeColorOptions[0]

  return (
    <Stack className="settings-page">
      <PageHeader eyebrow="PREFERENCES" title="Settings" description="Make Kinsen yours with colors, surfaces, typography, spacing, and dashboard controls." />

      <Stack className="settings-grid">
        <Stack as="section" className="settings-panel settings-theme-panel" aria-labelledby="theme-settings-title">
          <Stack direction="horizontal" className="settings-panel-heading">
            <Stack className="settings-panel-icon" aria-hidden="true"><Icon name="settings" size={18} /></Stack>
            <Stack>
              <Text as="p" className="eyebrow">APPEARANCE</Text>
              <Heading level={2} id="theme-settings-title">Appearance</Heading>
              <Text as="p">Personalize the whole workspace. Changes apply immediately and are saved on this device.</Text>
            </Stack>
          </Stack>

          <Stack gap={3} paddingBlockStart={4}>
            <RadioList label="Color mode" value={colorMode} onChange={(value) => setColorMode(value as typeof colorMode)} htmlName="color-mode" orientation="horizontal" aria-describedby="color-mode-hint">
              {colorModeOptions.map((option) => <RadioListItem key={option.value} label={option.label} value={option.value} />)}
            </RadioList>
            <Text type="supporting" id="color-mode-hint">System follows your device’s light or dark appearance.</Text>
          </Stack>

          <RadioList label="Accent color" value={themeColor} onChange={(value) => setThemeColor(value as typeof themeColor)} htmlName="theme-color" orientation="vertical" className="theme-picker">
            {themeColorOptions.map((option) => (
              <RadioListItem
                key={option.value}
                label={option.label}
                value={option.value}
                aria-label={option.label}
                className={`theme-option${themeColor === option.value ? ' is-selected' : ''}`}
                startContent={<Stack className="theme-swatch" style={{ backgroundColor: option.swatch, marginInlineStart: 'var(--spacing-2)' }} aria-hidden="true" />}
              />
            ))}
          </RadioList>

          <Stack direction="horizontal" className="theme-preview" aria-live="polite">
            <Stack className="theme-preview-swatch" style={{ backgroundColor: selectedTheme.swatch }} aria-hidden="true" />
            <Stack><Text weight="bold">Current color: {selectedTheme.label}</Text><Text type="supporting">Your choice is saved on this device.</Text></Stack>
            <Stack className="theme-preview-mark" aria-hidden="true"><Icon name="check" size={15} /></Stack>
          </Stack>

          <Stack gap={4} paddingBlockStart={4}>
            <Selector label="Surface palette" value={surfaceStyle} options={[...surfaceStyleOptions]} onChange={(value) => setSurfaceStyle(value as typeof surfaceStyle)} />
            <Text type="supporting">Sets workspace backgrounds, panels, and navigation independently of your accent.</Text>
            <Selector label="Corners" value={cornerStyle} options={[...cornerStyleOptions]} onChange={(value) => setCornerStyle(value as typeof cornerStyle)} />
            <Selector label="Heading style" value={headingStyle} options={[...headingStyleOptions]} onChange={(value) => setHeadingStyle(value as typeof headingStyle)} />
          </Stack>
        </Stack>

        <Stack as="section" className="settings-panel settings-tune-panel" aria-labelledby="tune-settings-title">
          <Stack direction="horizontal" className="settings-panel-heading">
            <Stack className="settings-panel-icon is-spark" aria-hidden="true"><Icon name="calendar" size={18} /></Stack>
            <Stack>
              <Text as="p" className="eyebrow">BEHAVIOR</Text>
              <Heading level={2} id="tune-settings-title">Layout &amp; calendar</Heading>
              <Text as="p">Control screen density, motion, and your calendar week start.</Text>
            </Stack>
          </Stack>

          <Stack className="settings-controls">
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

            <Stack className="settings-week-select">
              <Selector className="settings-week-control" label="Week starts on" aria-describedby="week-start-hint" value={weekStartsOn} options={[{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }]} onChange={(value) => setWeekStartsOn(value as 'sunday' | 'monday')} />
              <Text type="supporting" className="field-hint" id="week-start-hint">Sets the first day in your Calendar view.</Text>
            </Stack>
          </Stack>
        </Stack>
      </Stack>

      <Stack as="section" className="settings-panel" aria-labelledby="dashboard-settings-title">
        <Stack direction="horizontal" className="settings-panel-heading">
          <Stack className="settings-panel-icon" aria-hidden="true"><Icon name="overview" size={18} /></Stack>
          <Stack>
            <Heading level={2} id="dashboard-settings-title">Dashboard sections</Heading>
            <Text as="p">Choose what appears on your Overview. Safe to Spend and budget health always stay visible.</Text>
            <Text type="supporting">Saved automatically on this device. Hiding a section does not change your budget or delete data.</Text>
          </Stack>
        </Stack>
        <Stack className="settings-controls">
          {dashboardSectionOptions.map((section) => (
            <Switch
              key={section.value}
              label={section.label}
              description={section.description}
              labelSpacing="spread"
              value={dashboardSections[section.value]}
              onChange={(visible) => setDashboardSection(section.value, visible)}
              className="settings-toggle-row"
            />
          ))}
        </Stack>
        <Button label="View dashboard" variant="secondary" href="/" endContent={<Icon name="arrow" size={16} />} />
      </Stack>

      <Stack as="section" direction="horizontal" className="settings-account-card" aria-labelledby="account-settings-link-title">
        <Stack className="settings-account-icon" aria-hidden="true"><Icon name="wallet" size={19} /></Stack>
        <Stack>
          <Text as="p" className="eyebrow">ACCOUNT &amp; DATA</Text>
          <Heading level={2} id="account-settings-link-title">Account and data</Heading>
          <Text as="p">Manage saved budget data and sign-in access separately from these preferences.</Text>
        </Stack>
        <Button className="button button-secondary" label="Account settings" variant="secondary" href="/account" endContent={<Icon name="arrow" size={16} />} />
      </Stack>
    </Stack>
  )
}
