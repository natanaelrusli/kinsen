import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Switch } from '@astryxdesign/core/Switch'
import { Selector } from '@astryxdesign/core/Selector'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon, type IconName } from '../../shared/components/Icon'
import { backdropStyleOptions, cheerToneOptions, colorModeOptions, cornerStyleOptions, dashboardSectionOptions, headingStyleOptions, moneyStyleOptions, surfaceStyleOptions, themeColorOptions, useSettingsStore } from '../../shared/state/settings-store'
import { BankEmailSettings } from './BankEmailSettings'
import { formatIdr } from '../../shared/format/money'

const categories: { value: string; label: string; description: string; icon: IconName }[] = [
  { value: 'appearance', label: 'Appearance', description: 'Colors, surfaces, typography, number style, and little celebrations.', icon: 'appearance' },
  { value: 'layout', label: 'Layout & motion', description: 'Adjust spacing and interaction effects.', icon: 'settings' },
  { value: 'calendar', label: 'Calendar', description: 'Set up your preferred calendar week.', icon: 'calendar' },
  { value: 'dashboard', label: 'Dashboard', description: 'Choose the sections on your Overview.', icon: 'overview' },
  { value: 'bank-email', label: 'Bank email import', description: 'Configure BCA transaction email preferences.', icon: 'receipt' },
]

// Reached from this menu rather than the sidebar, to keep preferences together.
const manageLinks = [
  { heading: 'Budget', label: 'Budget settings', href: '/budget', icon: 'wallet' as IconName, description: 'Plan your period, categories, and allocations.' },
  { heading: 'Account', label: 'Account & data', href: '/account', icon: 'settings' as IconName, description: 'Manage your saved budget and sign-in access.' },
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
  const moneyStyle = useSettingsStore((state) => state.moneyStyle)
  const setMoneyStyle = useSettingsStore((state) => state.setMoneyStyle)
  const backdropStyle = useSettingsStore((state) => state.backdropStyle)
  const setBackdropStyle = useSettingsStore((state) => state.setBackdropStyle)
  const cheerTone = useSettingsStore((state) => state.cheerTone)
  const setCheerTone = useSettingsStore((state) => state.setCheerTone)
  const celebrateOnSave = useSettingsStore((state) => state.celebrateOnSave)
  const setCelebrateOnSave = useSettingsStore((state) => state.setCelebrateOnSave)
  const selectedTheme = themeColorOptions.find((option) => option.value === themeColor) ?? themeColorOptions[0]
  const selectedSurface = surfaceStyleOptions.find((option) => option.value === surfaceStyle) ?? surfaceStyleOptions[0]
  const modeLabel = colorMode === 'system' ? 'System' : colorMode === 'dark' ? 'Dark' : 'Light'

  return (
    <Stack className="settings-page" gap={6}>
      <Stack as="header" gap={2} className="settings-header">
        <Heading level={1}>Settings</Heading>
        <Text>Personalize your workspace, one detail at a time.</Text>
        <Stack direction="horizontal" gap={2} className="settings-save-note">
          <Icon name="check" aria-hidden="true" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />
          <Text type="supporting">{category.value === 'bank-email' ? 'Bank email configuration is saved on this device when you select Save.' : 'Changes apply immediately and are saved on this device.'}</Text>
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
          {manageLinks.map((link, index) => (
            <Stack key={link.href} className={`settings-nav-account${index === 0 ? ' is-first' : ''}`} gap={2}>
              <Text weight="semibold" className="settings-nav-label">{link.heading}</Text>
              <Button label={link.label} variant="ghost" href={link.href} className="settings-nav-item"
                icon={<Icon name={link.icon} aria-hidden="true" style={{ width: 'var(--spacing-5)', height: 'var(--spacing-5)' }} />}
                endContent={<Icon name="arrow" aria-hidden="true" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />} />
              <Text type="supporting">{link.description}</Text>
            </Stack>
          ))}
        </Stack>

        <Stack as="section" className="settings-detail" aria-labelledby="settings-category-title" gap={6}>
          <Stack gap={2} className="settings-detail-heading">
            <Heading level={2} id="settings-category-title" ref={headingRef} tabIndex={-1}>{category.label}</Heading>
            <Text>{category.description}</Text>
          </Stack>

          {category.value === 'appearance' && (
            <Stack gap={6}>
              <Stack className="settings-group" gap={4}>
                <Heading level={3}>Color & theme</Heading>
                <Stack className="settings-preview-card" gap={3} aria-live="polite">
                  <span className="settings-preview-label">Live preview</span>
                  <span className="settings-preview-body">
                    <span className="settings-preview-panel">
                      <span className="settings-preview-title">Safe to spend today</span>
                      <span className="settings-preview-figure">{formatIdr(1_250_000)}</span>
                      <span className="settings-preview-meter"><span /></span>
                    </span>
                    <span className="settings-preview-meta">
                      <span className="settings-preview-chip">{selectedTheme.label}</span>
                      <span className="settings-preview-chip">{selectedSurface.label}</span>
                      <span className="settings-preview-chip">{modeLabel}</span>
                    </span>
                  </span>
                </Stack>
                <Stack gap={2}>
                  <RadioList label="Color mode" value={colorMode} onChange={(value) => setColorMode(value as typeof colorMode)} htmlName="color-mode" orientation="horizontal" aria-describedby="color-mode-hint">
                    {colorModeOptions.map((option) => <RadioListItem key={option.value} label={option.label} value={option.value} />)}
                  </RadioList>
                  <Text type="supporting" id="color-mode-hint">System follows your device’s light or dark appearance.</Text>
                </Stack>
                <Stack gap={2}>
                  <Text id="accent-hint" weight="semibold">Accent color</Text>
                  <Stack className="settings-accent-grid" gap={2} role="radiogroup" aria-label="Accent color" aria-describedby="accent-hint">
                    {themeColorOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={themeColor === option.value}
                        className={`accent-swatch${themeColor === option.value ? ' is-selected' : ''}`}
                        onClick={() => setThemeColor(option.value)}>
                        <span className="accent-swatch-preview" aria-hidden="true">
                          <span className="accent-swatch-bar" style={{ backgroundColor: option.swatch }} />
                          <span className="accent-swatch-dot" style={{ backgroundColor: option.highlight }} />
                        </span>
                        <span className="accent-swatch-label">{option.label}</span>
                        {themeColor === option.value && <Icon name="check" aria-hidden="true" className="accent-swatch-check" />}
                      </button>
                    ))}
                  </Stack>
                </Stack>
              </Stack>
              <Stack className="settings-group" gap={4}>
                <Heading level={3}>Surface palette</Heading>
                <Text id="surface-hint">Sets backgrounds and panels independently of your accent.</Text>
                <Stack className="settings-palette-grid" gap={2} role="radiogroup" aria-label="Surface palette" aria-describedby="surface-hint">
                  {surfaceStyleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={surfaceStyle === option.value}
                      className={`palette-swatch is-${option.value}${surfaceStyle === option.value ? ' is-selected' : ''}`}
                      onClick={() => setSurfaceStyle(option.value)}>
                      <span className="palette-swatch-preview" aria-hidden="true">
                        <span className="palette-swatch-panel" />
                        <span className="palette-swatch-line" />
                        <span className="palette-swatch-line is-short" />
                      </span>
                      <span className="palette-swatch-label">{option.label}</span>
                    </button>
                  ))}
                </Stack>
              </Stack>
              <Stack className="settings-group" gap={4}>
                <Heading level={3}>Typography</Heading>
                <Stack gap={2}>
                  <Text id="heading-style-hint">Pairs a heading face with a body face. Uses fonts already on your device, so nothing is downloaded.</Text>
                  <Stack className="settings-font-grid" gap={2} role="radiogroup" aria-label="Heading style" aria-describedby="heading-style-hint">
                    {headingStyleOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={headingStyle === option.value}
                        className={`font-swatch is-${option.value}${headingStyle === option.value ? ' is-selected' : ''}`}
                        onClick={() => setHeadingStyle(option.value)}>
                        <span className="font-swatch-sample" aria-hidden="true">Aa</span>
                        <span className="font-swatch-label">{option.label}</span>
                      </button>
                    ))}
                  </Stack>
                </Stack>
                <Selector label="Corners" value={cornerStyle} options={[...cornerStyleOptions]} onChange={(value) => setCornerStyle(value as typeof cornerStyle)} />
              </Stack>
              <Stack className="settings-group" gap={3}>
                <Heading level={3}>Backdrop</Heading>
                <Text>Patterns sit behind your workspace. They are decorative only and never sit on top of content.</Text>
                <Stack className="settings-backdrop-grid" gap={2}>
                  {backdropStyleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`backdrop-swatch is-${option.value}${backdropStyle === option.value ? ' is-selected' : ''}`}
                      aria-pressed={backdropStyle === option.value}
                      onClick={() => setBackdropStyle(option.value)}>
                      <span className="backdrop-swatch-preview" aria-hidden="true" />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </Stack>
              </Stack>
              <Stack className="settings-group" gap={3}>
                <Heading level={3}>Number style</Heading>
                <RadioList label="How amounts are shown" value={moneyStyle} onChange={(value) => setMoneyStyle(value as typeof moneyStyle)} htmlName="money-style" orientation="vertical" aria-describedby="money-style-hint">
                  {moneyStyleOptions.map((option) => (
                    <RadioListItem key={option.value} label={option.label} value={option.value} description={option.hint} />
                  ))}
                </RadioList>
                <Text type="supporting" id="money-style-hint">Applies everywhere in the app. Amounts are stored exactly as entered either way.</Text>
              </Stack>
              <Stack className="settings-group" gap={3}>
                <Heading level={3}>Celebrations</Heading>
                <Switch label="Celebrate saved expenses" description="Show a brief burst and message after you add an expense." labelPosition="start" labelSpacing="spread"
                  value={celebrateOnSave} onChange={setCelebrateOnSave} className="settings-toggle-row" />
                <Stack gap={2}>
                  <Selector label="Cheerful messages" value={cheerTone} options={[...cheerToneOptions]}
                    onChange={(value) => setCheerTone(value as typeof cheerTone)} isDisabled={!celebrateOnSave}
                    aria-describedby="cheer-hint" />
                  <Text type="supporting" id="cheer-hint">Playful picks a random line each time. Motion settings still control the animation.</Text>
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

          {category.value === 'bank-email' && <BankEmailSettings />}
        </Stack>
      </Stack>
    </Stack>
  )
}
