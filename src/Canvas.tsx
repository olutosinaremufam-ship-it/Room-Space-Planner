import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'
import { type GridAnalysis } from './lib/analysis'
import { CATALOG, getItemDimensions, type PlacedItem, type Room } from './lib/catalog'

interface CanvasProps {
  room: Room
  items: PlacedItem[]
  analysis: GridAnalysis
  selectedId: string | null
  showUnreachable: boolean
  showTight: boolean
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
}

interface RoomTransform {
  originX: number
  originY: number
  scale: number
  toCanvas: (cm: number) => number
  toCm: (pixel: number) => number
}

function getRoomTransform(room: Room, width: number, height: number): RoomTransform {
  const margin = 34
  const scale = Math.max(0.01, Math.min((width - margin * 2) / room.width, (height - margin * 2) / room.depth))
  const toCanvas = (cm: number) => cm * scale
  const toCm = (pixel: number) => pixel / scale
  return {
    originX: (width - toCanvas(room.width)) / 2,
    originY: (height - toCanvas(room.depth)) / 2,
    scale,
    toCanvas,
    toCm,
  }
}

function Canvas({ room, items, analysis, selectedId, showUnreachable, showTight, onSelect, onMove }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef<() => void>(() => {})
  const dragRef = useRef<{ pointerId: number; itemId: string; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(bounds.width * dpr)
      canvas.height = Math.round(bounds.height * dpr)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, bounds.width, bounds.height)

      const transform = getRoomTransform(room, bounds.width, bounds.height)
      const { originX, originY, toCanvas } = transform
      const palette = getComputedStyle(canvas)
      const color = (name: string, fallback: string) => palette.getPropertyValue(name).trim() || fallback
      const floor = color('--plan-floor', '#f8f9f5')
      const minorGrid = color('--plan-grid-minor', '#e7ebe7')
      const majorGrid = color('--plan-grid-major', '#cbd4ce')
      const outline = color('--plan-outline', '#52645d')
      const label = color('--plan-label', '#263832')
      const furniture = color('--plan-furniture', '#e0e7e2')
      const machine = color('--plan-machine', '#dce4e8')
      const storage = color('--plan-storage', '#e8e9df')
      const fixture = color('--plan-fixture', '#c8d3d0')
      const selected = color('--plan-selected', '#246b54')

      context.save()
      context.translate(originX, originY)
      context.fillStyle = floor
      context.fillRect(0, 0, toCanvas(room.width), toCanvas(room.depth))

      const drawMask = (mask: boolean[][], fill: string) => {
        context.fillStyle = fill
        for (let y = 0; y < analysis.grid.rows; y += 1) {
          for (let x = 0; x < analysis.grid.cols; x += 1) {
            if (!mask[y]?.[x]) continue
            context.fillRect(
              toCanvas(x * analysis.grid.cellCm),
              toCanvas(y * analysis.grid.cellCm),
              toCanvas(Math.min(analysis.grid.cellCm, room.width - x * analysis.grid.cellCm)),
              toCanvas(Math.min(analysis.grid.cellCm, room.depth - y * analysis.grid.cellCm)),
            )
          }
        }
      }
      if (showUnreachable) drawMask(analysis.unreachable, 'rgba(187, 63, 57, 0.20)')
      if (showTight) drawMask(analysis.tight, 'rgba(194, 132, 35, 0.23)')

      for (let cm = 0; cm <= room.width; cm += 10) {
        context.beginPath()
        context.strokeStyle = cm % 100 === 0 ? majorGrid : minorGrid
        context.lineWidth = cm % 100 === 0 ? 0.8 : 0.45
        context.moveTo(toCanvas(cm), 0)
        context.lineTo(toCanvas(cm), toCanvas(room.depth))
        context.stroke()
      }
      for (let cm = 0; cm <= room.depth; cm += 10) {
        context.beginPath()
        context.strokeStyle = cm % 100 === 0 ? majorGrid : minorGrid
        context.lineWidth = cm % 100 === 0 ? 0.8 : 0.45
        context.moveTo(0, toCanvas(cm))
        context.lineTo(toCanvas(room.width), toCanvas(cm))
        context.stroke()
      }

      for (const item of items) {
        const dimensions = getItemDimensions(item)
        const catalogItem = CATALOG.find((entry) => entry.type === item.type) ?? CATALOG[0]
        const x = toCanvas(item.x)
        const y = toCanvas(item.y)
        const width = toCanvas(dimensions.width)
        const depth = toCanvas(dimensions.depth)
        const isSelected = item.id === selectedId
        const fills = { furniture, machine, storage, fixture }
        context.fillStyle = fills[catalogItem.category]
        context.strokeStyle = isSelected ? selected : outline
        context.lineWidth = isSelected ? 1.6 : 0.9
        context.fillRect(x, y, width, depth)
        context.strokeRect(x, y, width, depth)

        context.beginPath()
        context.strokeStyle = catalogItem.category === 'fixture' ? selected : outline
        context.lineWidth = 3
        if (item.rotation === 0) {
          context.moveTo(x, y + depth)
          context.lineTo(x + width, y + depth)
        } else if (item.rotation === 90) {
          context.moveTo(x, y)
          context.lineTo(x, y + depth)
        } else if (item.rotation === 180) {
          context.moveTo(x, y)
          context.lineTo(x + width, y)
        } else {
          context.moveTo(x + width, y)
          context.lineTo(x + width, y + depth)
        }
        context.stroke()

        context.fillStyle = label
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.font = '10px system-ui, sans-serif'
        if (width > 35 && depth > 20) context.fillText(catalogItem.name, x + width / 2, y + depth / 2, Math.max(0, width - 8))
        if (isSelected) {
          context.save()
          context.setLineDash([4, 3])
          context.strokeStyle = selected
          context.lineWidth = 1
          context.strokeRect(x - 2, y - 2, width + 4, depth + 4)
          context.restore()
          context.font = '10px ui-monospace, monospace'
          context.textBaseline = 'bottom'
          context.fillStyle = selected
          context.fillText(`${dimensions.width} × ${dimensions.depth} cm`, x + width / 2, y - 5)
        }
      }

      context.strokeStyle = outline
      context.lineWidth = 2.2
      context.strokeRect(0, 0, toCanvas(room.width), toCanvas(room.depth))
      context.restore()
    }
    drawRef.current()
  }, [room, items, analysis, selectedId, showUnreachable, showTight])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => drawRef.current())
    observer.observe(canvas)
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    colorScheme.addEventListener('change', drawRef.current)
    return () => {
      observer.disconnect()
      colorScheme.removeEventListener('change', drawRef.current)
    }
  }, [])

  const getRoomPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    const transform = getRoomTransform(room, bounds.width, bounds.height)
    return {
      x: transform.toCm(event.clientX - bounds.left - transform.originX),
      y: transform.toCm(event.clientY - bounds.top - transform.originY),
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getRoomPoint(event)
    if (!point) return
    const hit = [...items].reverse().find((item) => {
      const dimensions = getItemDimensions(item)
      return point.x >= item.x && point.x <= item.x + dimensions.width && point.y >= item.y && point.y <= item.y + dimensions.depth
    })
    if (!hit) {
      onSelect(null)
      return
    }
    event.preventDefault()
    onSelect(hit.id)
    dragRef.current = { pointerId: event.pointerId, itemId: hit.id, offsetX: point.x - hit.x, offsetY: point.y - hit.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = getRoomPoint(event)
    const item = items.find((entry) => entry.id === drag.itemId)
    if (!point || !item) return
    const dimensions = getItemDimensions(item)
    const maxX = Math.max(0, room.width - dimensions.width)
    const maxY = Math.max(0, room.depth - dimensions.depth)
    const x = Math.min(maxX, Math.max(0, Math.round((point.x - drag.offsetX) / 5) * 5))
    const y = Math.min(maxY, Math.max(0, Math.round((point.y - drag.offsetY) / 5) * 5))
    onMove(item.id, x, y)
  }

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className="drawing-canvas"
      aria-label="Room plan. Drag items to move them."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}

export default Canvas