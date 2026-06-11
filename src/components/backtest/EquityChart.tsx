import { useEffect, useRef } from 'react'
import {
  createChart, AreaSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type SeriesMarker, type Time,
  type ISeriesMarkersPluginApi,
} from 'lightweight-charts'
import { toChartDay, type EquityRow, type TradeRow, type BenchRow } from '../../api/perf'

interface Props {
  equity: EquityRow[]    // already filtered to a single sym, ascending by dt
  trades: TradeRow[]     // filtered to the same sym
  bench: BenchRow[]      // underlying close for the same sym (may be empty)
  theme: 'dark' | 'light'
  showMarkers: boolean   // overlay entry/exit markers on the curve
  showBench: boolean     // overlay buy-and-hold benchmark line
}

const THEMES = {
  dark: {
    bg: 'transparent', text: '#a1a1aa', grid: '#27272a', border: '#3f3f46',
    line: '#3b82f6', top: 'rgba(59,130,246,0.35)', bottom: 'rgba(59,130,246,0.02)',
    dd: 'rgba(244,63,94,0.55)',
    long: '#34d399', short: '#f43f5e', bench: '#f59e0b',
  },
  light: {
    bg: 'transparent', text: '#52525b', grid: '#e4e4e7', border: '#d4d4d8',
    line: '#2563eb', top: 'rgba(37,99,235,0.30)', bottom: 'rgba(37,99,235,0.02)',
    dd: 'rgba(225,29,72,0.45)',
    long: '#059669', short: '#e11d48', bench: '#d97706',
  },
} as const

export default function EquityChart({ equity, trades, bench, theme, showMarkers, showBench }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const equitySeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const benchSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const ddSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const c = THEMES[theme]

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: c.bg },
        textColor: c.text,
        fontFamily: "'Sora', sans-serif",
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: c.border, separatorHoverColor: c.border },
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { visible: true, borderVisible: true, borderColor: c.border, scaleMargins: { top: 0.12, bottom: 0.12 } },
      leftPriceScale: { visible: false, borderVisible: true, borderColor: c.bench, scaleMargins: { top: 0.12, bottom: 0.12 } },  // benchmark's own scale
      timeScale: { borderColor: c.border, rightOffset: 4 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c.border, style: LineStyle.Dashed },
        horzLine: { color: c.border, style: LineStyle.Dashed },
      },
      autoSize: true,
    })

    const equitySeries = chart.addSeries(AreaSeries, {
      lineColor: c.line, lineWidth: 2,
      topColor: c.top, bottomColor: c.bottom,
      priceLineVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })

    // Buy-and-hold benchmark — dashed line on its OWN (left) price scale, so a
    // big benchmark move doesn't squash the strategy curve flat.
    const benchSeries = chart.addSeries(LineSeries, {
      color: c.bench, lineWidth: 1, lineStyle: LineStyle.Dashed,
      priceScaleId: 'left',
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })

    const ddSeries = chart.addSeries(HistogramSeries, {
      color: c.dd,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      priceLineVisible: false,
    }, 1) // pane 1 — drawdown below equity

    // Make the drawdown pane shorter than the equity pane.
    const panes = chart.panes()
    if (panes.length > 1) panes[1].setHeight(110)

    chartRef.current = chart
    equitySeriesRef.current = equitySeries
    benchSeriesRef.current = benchSeries
    ddSeriesRef.current = ddSeries
    markersRef.current = createSeriesMarkers(equitySeries, [])

    return () => { chart.remove(); chartRef.current = null; markersRef.current = null }
  }, [theme])

  // Push data whenever it changes.
  useEffect(() => {
    const eq = equitySeriesRef.current
    const bm = benchSeriesRef.current
    const dd = ddSeriesRef.current
    const chart = chartRef.current
    if (!eq || !bm || !dd || !chart) return

    // De-dupe on day (last wins) and keep ascending order for the chart.
    const eqByDay = new Map<string, number>()
    const ddByDay = new Map<string, number>()
    for (const r of equity) {
      const t = toChartDay(r.dt)
      eqByDay.set(t, r.pv)
      ddByDay.set(t, -Math.abs(r.dd_pct)) // plot drawdown as negative
    }
    const days = Array.from(eqByDay.keys()).sort()

    eq.setData(days.map(t => ({ time: t as Time, value: eqByDay.get(t)! })))
    dd.setData(days.map(t => ({ time: t as Time, value: ddByDay.get(t)! })))

    // Benchmark: buy-and-hold the underlying, scaled to start at the same
    // equity as the strategy (pv0 * close/close0) so the two lines are comparable.
    const benchOn = showBench && bench.length > 0 && days.length > 0
    if (benchOn) {
      const sorted = [...bench].sort((a, b) => a.dt.localeCompare(b.dt))
      const close0 = sorted[0].close
      const pv0 = eqByDay.get(days[0])!
      const benchByDay = new Map<string, number>()
      for (const b of sorted) if (close0) benchByDay.set(toChartDay(b.dt), pv0 * b.close / close0)
      bm.setData(Array.from(benchByDay.keys()).sort().map(t => ({ time: t as Time, value: benchByDay.get(t)! })))
    } else {
      bm.setData([])
    }
    chart.priceScale('left').applyOptions({ visible: benchOn })

    // Trade entry markers — slim arrows, no text (text is unreadable past a
    // handful of trades). Exits are omitted to halve marker density; the trades
    // table carries the per-trade detail.
    const c = THEMES[theme]
    if (showMarkers) {
      const markers: SeriesMarker<Time>[] = []
      for (const tr of trades) {
        const isLong = tr.side === 'L'
        markers.push({
          time: toChartDay(tr.entryTime) as Time,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? c.long : c.short,
          shape: isLong ? 'arrowUp' : 'arrowDown',
        })
      }
      markers.sort((a, b) => String(a.time).localeCompare(String(b.time)))
      markersRef.current?.setMarkers(markers)
    } else {
      markersRef.current?.setMarkers([])
    }

    chart.timeScale().fitContent()
  }, [equity, trades, bench, theme, showMarkers, showBench])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <span className="absolute bottom-1 left-2 z-10 text-[10px] font-medium tracking-wide text-[var(--text-faint)] pointer-events-none select-none">
        qbt.ie
      </span>
    </div>
  )
}
