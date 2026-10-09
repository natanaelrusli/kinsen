import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetLineChart } from './AssetLineChart'

function lineCoordinates() {
  return screen.getByRole('img').querySelector('polyline')!.getAttribute('points')!
    .split(' ')
    .map((point) => point.split(',').map(Number))
}

afterEach(cleanup)

describe('AssetLineChart date geometry', () => {
  it('spaces irregular observations by elapsed calendar days', () => {
    render(<AssetLineChart points={[
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 20 },
      { date: '2026-02-01', value: 30 },
    ]} />)

    const points = lineCoordinates()
    const first = points[0]![0]!
    const second = points[1]![0]!
    const last = points[2]![0]!
    expect(first).toBe(14)
    expect(last).toBe(626)
    expect(second).toBeCloseTo(14 + 612 / 31)
  })

  it('gives observations on the same local date a shared x and preserves endpoint markers', () => {
    const { container } = render(<AssetLineChart points={[
      { date: '2026-03-08', value: 10 },
      { date: '2026-03-08', value: 20 },
      { date: '2026-03-08', value: 30 },
    ]} />)

    const points = lineCoordinates()
    const firstX = points[0]![0]!
    const secondX = points[1]![0]!
    const lastX = points[2]![0]!
    expect(firstX).toBe(secondX)
    expect(secondX).toBe(lastX)
    expect(container.querySelectorAll('.asset-chart-point')).toHaveLength(2)
  })

  it('centers a one-point history and produces finite geometry', () => {
    render(<AssetLineChart points={[{ date: '2026-05-14', value: 50 }]} />)

    expect(lineCoordinates()).toEqual([[320, 90]])
    expect(screen.getByRole('img').querySelector('circle')).toHaveAttribute('cx', '320')
  })

  it('centers a zero-duration multi-point range without losing line values', () => {
    render(<AssetLineChart points={[
      { date: '2026-07-04', value: 10 },
      { date: '2026-07-04', value: 20 },
    ]} />)

    const coordinates = lineCoordinates()
    expect(coordinates).toEqual([[320, 164], [320, 16]])
    expect(coordinates.flat().every(Number.isFinite)).toBe(true)
  })
})
