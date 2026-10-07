import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Switch } from '@astryxdesign/core/Switch'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon, type IconName } from '../../shared/components/Icon'
import { colorModeOptions, cornerStyleOptions, dashboardSectionOptions, headingStyleOptions, surfaceStyleOptions, themeColorOptions, useSettingsStore } from '../../shared/state/settings-store'

const categories: { value: string; label: string; description: string; icon: IconName }[] = [
  { value: 'appearance', label: 'Appearance', description: 'Colors, surfaces, and typography.', icon: 'appearance' },
  { value: 'layout', label: 'Layout & motion', description: 'Adjust spacing and interaction effects.', icon: 'settings' },
  { value: 'calendar', label: 'Calendar', description: 'Set up your preferred calendar week.', icon: 'calendar' },
  { value: 'dashboard', label: 'Dashboard', description: 'Choose the sections on your Overview.', icon: 'overview' },
]

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const category = categories.find((item) => item.value === searchParams.get('section')) ?? categories[0]!
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousCategory = useRef(category.value)

  useEffect(() => {
    if (previousCategory.current !== category.value) {
      headingRef.current?.focus()
      previousCategory.current = category.value
    }
  }, [category.value])

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
    <Stack className="settings-page" gap={6}>
      <Stack as="header" gap={2} className="settings-header">
        <Heading level={1}>Settings</Heading>
        <Text>Personalize your workspace, one detail at a time.</Text>
        <Stack direction="horizontal" gap={2} className="settings-save-note">
          <Icon name="check" aria-hidden="true" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />
          <Text type="supporting">Changes apply immediately and are saved on this device.</Text>
        </Stack>
      </Stack>

      <Stack className="settings-workspace">
        <Stack as="nav" aria-label="Settings categories" className="settings-submenu" gap={2}>
          <Text weight="semibold" className="settings-nav-label">Preferences</Text>
          <Stack className="settings-category-links" gap={1}>
            {categories.map((item) => (
              <Button
                key={item.value}
                label={item.label}
                variant="ghost"
                aria-current={category.value === item.value ? 'page' : undefined}
                className={`settings-nav-item${category.value === item.value ? ' is-active' : ''}`}
                icon={<Icon name={item.icon} aria-hidden="true" style={{ width: 'var(--spacing-5)', height: 'var(--spacing-5)' }} />}
                onClick={() => {
                  const next = new URLSearchParams(searchParams)
                  next.set('section', item.value)
                  setSearchParams(next)
                }}
              />
            ))}
          </Stack>
          <Stack className="settings-nav-account" gap={2}>
            <Text weight="semibold" className="settings-nav-label">Account</Text>
            <Button label="Account & data" variant="ghost" href="/account" className="settings-nav-item"
              icon={<Icon name="wallet" aria-hidden="true" style={{ width: 'var(--spacing-5)', height: 'var(--spacing-5)' }} />}
              endContent={<Icon name="arrow" aria-hidden="true" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />} />
            <Text type="supporting">Manage your saved budget and sign-in access.</Text>
          </Stack>
        </Stack>

        <Stack as="section" className="settings-detail" aria-labelledby="settings-category-title" gap={6}>
          <Stack gap={2} className="settings-detail-heading">
            <Heading level={2} id="settings-category-title" ref={headingRef} tabIndex={-1}>{category.label}</Heading>
            <Text>{category.description}</Text>
          </Stack>

          {category.value === 'appearance' && (
            <Stack gap={6}>
              <Stack className="settings-group" gap={3}>
                <Heading level={3}>Color & theme</Heading>
                <RadioList label="Color mode" value={colorMode} onChange={(value) => setColorMode(value as typeof colorMode)} htmlName="color-mode" orientation="horizontal" aria-describedby="color-mode-hint">
                  {colorModeOptions.map((option) => <RadioListItem key={option.value} label={option.label} value={option.value} />)}
                </RadioList>
                <Text type="supporting" id="color-mode-hint">System follows your device’s light or dark appearance.</Text>
                <RadioList label="Accent color" value={themeColor} onChange={(value) => setThemeColor(value as typeof themeColor)} htmlName="theme-color" orientation="vertical" className="theme-picker">
                  {themeColorOptions.map((option) => (
                    <RadioListItem key={option.value} label={option.label} value={option.value} aria-label={option.label}
                      className={`theme-option${themeColor === option.value ? ' is-selected' : ''}`}
                      startContent={<Stack className="theme-swatch" style={{ backgroundColor: option.swatch, marginInlineStart: 'var(--spacing-2)' }} aria-hidden="true" />} />
                  ))}
                </RadioList>
                <Stack direction="horizontal" gap={2} className="settings-color-note" aria-live="polite">
                  <Icon name="check" aria-hidden="true" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />
                  <Text type="supporting">Current accent: {selectedTheme.label}</Text>
                </Stack>
              </Stack>
              <Stack className="settings-group" gap={4}>
                <Heading level={3}>Workspace style</Heading>
                <Stack className="settings-style-fields" gap={4}>
                  <Stack gap={2}>
                    <Selector label="Surface palette" value={surfaceStyle} options={[...surfaceStyleOptions]} onChange={(value) => setSurfaceStyle(value as typeof surfaceStyle)} aria-describedby="surface-hint" />
                    <Text type="supporting" id="surface-hint">Sets backgrounds and panels independently of your accent.</Text>
                  </Stack>
                  <Selector label="Corners" value={cornerStyle} options={[...cornerStyleOptions]} onChange={(value) => setCornerStyle(value as typeof cornerStyle)} />
                  <Selector label="Heading style" value={headingStyle} options={[...headingStyleOptions]} onChange={(value) => setHeadingStyle(value as typeof headingStyle)} />
                </Stack>
              </Stack>
            </Stack>
          )}

          {category.value === 'layout' && (
            <Stack className="settings-group" gap={3}>
              <Heading level={3}>Workspace comfort</Heading>
              <Switch label="Compact layout" description="Reduce spacing to fit more information on screen." labelPosition="start" labelSpacing="spread"
                value={layoutDensity === 'compact'} onChange={(checked) => setLayoutDensity(checked ? 'compact' : 'comfortable')} className="settings-toggle-row" />
              <Switch label="Motion effects" description="Use gentle transitions. Your device’s reduced-motion setting always takes priority." labelPosition="start" labelSpacing="spread"
                value={playfulMotion} onChange={setPlayfulMotion} className="settings-toggle-row" />
            </Stack>
          )}

          {category.value === 'calendar' && (
            <Stack className="settings-group" gap={4}>
              <Heading level={3}>Week preferences</Heading>
              <Stack gap={2} className="settings-calendar-field">
                <Selector label="Week starts on" aria-describedby="week-start-hint" value={weekStartsOn}
                  options={[{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }]}
                  onChange={(value) => setWeekStartsOn(value as 'sunday' | 'monday')} />
                <Text type="supporting" id="week-start-hint">Sets the first day in your Calendar view.</Text>
              </Stack>
              <Button label="View calendar" variant="secondary" href="/calendar" />
            </Stack>
          )}

          {category.value === 'dashboard' && (
            <Stack className="settings-group" gap={3}>
              <Heading level={3}>Visible sections</Heading>
              <Text>Safe to Spend and budget health always stay visible. Hiding a section does not change your budget or delete data.</Text>
              {dashboardSectionOptions.map((section) => (
                <Switch key={section.value} label={section.label} description={section.description} labelPosition="start" labelSpacing="spread"
                  value={dashboardSections[section.value]} onChange={(visible) => setDashboardSection(section.value, visible)} className="settings-toggle-row" />
              ))}
              <Button label="View dashboard" variant="secondary" href="/" />
            </Stack>
          )}
        </Stack>
      </Stack>
    </Stack>
  )
}
