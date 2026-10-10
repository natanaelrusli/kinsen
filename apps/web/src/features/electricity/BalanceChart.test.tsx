import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DateOnly, TokenObservation } from '@kinsen/budget-domain'
import { BalanceChart } from './BalanceChart'

/**
 * jsdom performs no layout, so ResponsiveContainer always measures 0 and renders
 * nothing. Report a fixed viewport so the chart mounts with real geometry.
 */
function stubViewport(width: number) {
  class ResizeObserverStub {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const rect = { width, height: 268, top: 0, left: 0, x: 0, y: 0, bottom: 268, right: width, toJSON: () => ({}) }
      this.callback([{ target, contentRect: rect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: width })
}

function observation(id: string, date: DateOnly, remainingMilliKwh: number, refillMilliKwh: number | null, refillSource: TokenObservation['refillSource']): TokenObservation {
  return { id, date, sequence: 0, remainingMilliKwh, refillMilliKwh, refillCostIdr: null, refillSource }
}

function xTickLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recharts-xAxis-tick-labels text')].map((node) => node.textContent ?? '')
}

function yTickLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.recharts-yAxis-tick-labels text')].map((node) => node.textContent ?? '')
}

const history: TokenObservation[] = [
  observation('opening', '2026-10-01' as DateOnly, 100_000, null, 'none'),
  observation('top-up', '2026-10-05' as DateOnly, 60_000, 5_000, 'entered'),
  observation('latest', '2026-10-09' as DateOnly, 33_340, null, 'none'),
]

beforeEach(() => stubViewport(760))

describe('BalanceChart', () => {
  it('draws the balance line, markers, and axis labels inside the plot', () => {
    const { container } = render(<BalanceChart observations={history} />)

    const surface = container.querySelector('.recharts-surface')
    expect(surface?.getAttribute('width')).toBe('760')

    // The line must span the plot; a collapsed plot area renders no usable curve.
    const curve = container.querySelector('.recharts-area-curve')?.getAttribute('d')
    expect(curve).toBeTruthy()
    const xs = [...(curve ?? '').matchAll(/[ML]([\d.]+),/g)].map((match) => Number(match[1]))
    expect(Math.min(...xs)).toBeLessThan(120)
    expect(Math.max(...xs)).toBeGreaterThan(700)

    // One marker per reading, with refills distinguished from plain readings.
    const markers = [...container.querySelectorAll('.electricity-chart-point, .electricity-chart-refill')]
    expect(markers.length).toBe(3)
    expect(container.querySelectorAll('.electricity-chart-refill').length).toBe(1)
    // Markers must sit within the surface, not off-canvas.
    for (const marker of markers) {
      expect(Number(marker.getAttribute('cy'))).toBeGreaterThan(0)
      expect(Number(marker.getAttribute('cy'))).toBeLessThan(268)
    }

    // Gridlines and both axes' labels must all be present.
    expect(container.querySelectorAll('.recharts-cartesian-grid line').length).toBeGreaterThan(1)
    expect(yTickLabels(container).length).toBeGreaterThan(1)
    expect(xTickLabels(container).length).toBeGreaterThan(0)
    // Each x tick must carry its own date; duplicates mean same-day readings collided.
    const labels = xTickLabels(container)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[0]).toBe('1 Oct 2026')
    expect(labels[labels.length - 1]).toBe('9 Oct 2026')
  })

  it('renders a single reading without dividing by a zero span', () => {
    const { container } = render(<BalanceChart observations={[history[0]!]} />)

    const surface = container.querySelector('.recharts-surface')
    expect(surface?.getAttribute('width')).toBe('760')
    expect(container.querySelectorAll('.electricity-chart-point').length).toBe(1)
    expect(xTickLabels(container).length).toBeGreaterThan(0)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})