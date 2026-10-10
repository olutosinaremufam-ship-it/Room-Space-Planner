import { useEffect, useState } from 'react'
import Canvas from './Canvas'
import { analyse } from './lib/analysis'
import { CATALOG, getItemDimensions, type Category, type ItemType, type PlacedItem, type Room } from './lib/catalog'

const STORAGE_KEY = 'gridcraft-layouts'
const CATEGORY_ORDER: Category[] = ['furniture', 'machine', 'storage', 'fixture']
const CATEGORY_LABELS: Record<Category, string> = {
  furniture: 'Furniture',
  machine: 'Machines',
  storage: 'Storage',
  fixture: 'Fixtures',
}

interface SavedLayout {
  name: string
  room: Room
  items: PlacedItem[]
}

const initialRoom: Room = { width: 520, depth: 400 }
const initialItems: PlacedItem[] = [
  { id: 'sample-door', type: 'door', x: 220, y: 0, rotation: 0 },
  { id: 'sample-workbench', type: 'workbench', x: 40, y: 58, rotation: 0 },
  { id: 'sample-laser', type: 'laser', x: 330, y: 54, rotation: 0 },
  { id: 'sample-cnc', type: 'cnc', x: 350, y: 238, rotation: 90 },
  { id: 'sample-printer', type: 'printer3d', x: 64, y: 265, rotation: 0 },
  { id: 'sample-shelving', type: 'shelving', x: 424, y: 44, rotation: 0 },
  { id: 'sample-toolchest', type: 'toolchest', x: 360, y: 138, rotation: 0 },
  { id: 'sample-bin', type: 'bin', x: 466, y: 340, rotation: 0 },
]

function readLayouts(): SavedLayout[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((layout): layout is SavedLayout =>
      typeof layout?.name === 'string' &&
      typeof layout?.room?.width === 'number' &&
      typeof layout?.room?.depth === 'number' &&
      Array.isArray(layout?.items),
    )
  } catch {
    return []
  }
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

function clampItem(item: PlacedItem, room: Room): PlacedItem {
  const { width, depth } = getItemDimensions(item)
  return {
    ...item,
    x: Math.min(Math.max(0, item.x), Math.max(0, room.width - width)),
    y: Math.min(Math.max(0, item.y), Math.max(0, room.depth - depth)),
  }
}

function App() {
  const [room, setRoom] = useState<Room>(initialRoom)
  const [roomFields, setRoomFields] = useState({ width: String(initialRoom.width), depth: String(initialRoom.depth) })
  const [items, setItems] = useState<PlacedItem[]>(initialItems)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layoutName, setLayoutName] = useState('Workshop layout')
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(readLayouts)
  const [showUnreachable, setShowUnreachable] = useState(true)
  const [showTight, setShowTight] = useState(true)
  const [accessibilityMode, setAccessibilityMode] = useState(false)

  const analysis = analyse(room, items, accessibilityMode)
  const selectedItem = items.find((item) => item.id === selectedId)
  const roomArea = (room.width * room.depth) / 10_000
  const money = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  })

  const resizeRoom = (dimension: keyof Room, value: number) => {
    if (!Number.isFinite(value) || value < 100) return
    const nextRoom = { ...room, [dimension]: Math.min(value, 3000) }
    setRoom(nextRoom)
    setItems((current) => current.map((item) => clampItem(item, nextRoom)))
  }

  const updateRoomField = (dimension: keyof Room, value: string) => {
    setRoomFields((current) => ({ ...current, [dimension]: value }))
    const parsed = Number(value)
    if (value && parsed >= 100) resizeRoom(dimension, parsed)
  }

  const commitRoomField = (dimension: keyof Room) => {
    const parsed = Number(roomFields[dimension])
    if (!Number.isFinite(parsed) || parsed < 100) {
      setRoomFields((current) => ({ ...current, [dimension]: String(room[dimension]) }))
      return
    }
    const value = Math.min(parsed, 3000)
    setRoomFields((current) => ({ ...current, [dimension]: String(value) }))
    resizeRoom(dimension, value)
  }

  const addItem = (type: ItemType) => {
    const catalogItem = CATALOG.find((item) => item.type === type)
    if (!catalogItem) return
    const item: PlacedItem = clampItem({
      id: createId(),
      type,
      x: (room.width - catalogItem.width) / 2,
      y: (room.depth - catalogItem.depth) / 2,
      rotation: 0,
    }, room)
    setItems((current) => [...current, item])
    setSelectedId(item.id)
  }

  const rotateSelected = () => {
    if (!selectedId) return
    setItems((current) => current.map((item) => item.id === selectedId
      ? clampItem({ ...item, rotation: ((item.rotation + 90) % 360) as PlacedItem['rotation'] }, room)
      : item,
    ))
  }

  const removeSelected = () => {
    if (!selectedId) return
    setItems((current) => current.filter((item) => item.id !== selectedId))
    setSelectedId(null)
  }

  const moveItem = (id: string, x: number, y: number) => {
    setItems((current) => current.map((item) => item.id === id
      ? clampItem({ ...item, x, y }, room)
      : item,
    ))
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key.toLowerCase() === 'r' && selectedId) {
        event.preventDefault()
        setItems((current) => current.map((item) => item.id === selectedId
          ? clampItem({ ...item, rotation: ((item.rotation + 90) % 360) as PlacedItem['rotation'] }, room)
          : item,
        ))
      } else if (event.key === 'Delete' && selectedId) {
        event.preventDefault()
        setItems((current) => current.filter((item) => item.id !== selectedId))
        setSelectedId(null)
      } else if (event.key.startsWith('Arrow') && selectedId) {
        const distance = event.shiftKey ? 20 : 5
        const delta: Record<string, [number, number]> = {
          ArrowLeft: [-distance, 0],
          ArrowRight: [distance, 0],
          ArrowUp: [0, -distance],
          ArrowDown: [0, distance],
        }
        const [x, y] = delta[event.key] ?? [0, 0]
        if (x === 0 && y === 0) return
        event.preventDefault()
        setItems((current) => current.map((item) => item.id === selectedId
          ? clampItem({ ...item, x: item.x + x, y: item.y + y }, room)
          : item,
        ))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [room, selectedId])

  const saveLayout = () => {
    const name = layoutName.trim() || 'Untitled layout'
    const next: SavedLayout[] = [
      { name, room, items },
      ...savedLayouts.filter((layout) => layout.name !== name),
    ]
    setSavedLayouts(next)
    setLayoutName(name)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // The current layout remains usable when browser storage is unavailable.
    }
  }

  const loadLayout = (name: string) => {
    const layout = savedLayouts.find((saved) => saved.name === name)
    if (!layout) return
    setLayoutName(layout.name)
    setRoom(layout.room)
    setRoomFields({ width: String(layout.room.width), depth: String(layout.room.depth) })
    setItems(layout.items)
    setSelectedId(null)
  }

  const exportLayout = () => {
    const payload = JSON.stringify({ room, items, metrics: analysis }, null, 2)
    const downloadUrl = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `${layoutName.trim().replace(/[^a-z0-9-_]+/gi, '-') || 'gridcraft-layout'}.json`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const warnings: { message: string; tone: 'amber' | 'red' }[] = []
  if (!items.some((item) => item.type === 'door')) {
    warnings.push({ message: 'No door placed — add one to define the room entrance.', tone: 'amber' })
  }
  if (analysis.unreachable_m2 > 0) {
    warnings.push({ message: `${analysis.unreachable_m2.toFixed(2)} m² of floor is cut off from the entrance.`, tone: 'red' })
  }
  if (analysis.tight_m2 > 0) {
    warnings.push({ message: `${analysis.tight_m2.toFixed(2)} m² of walkway is under the ${analysis.walkwayMin} cm minimum.`, tone: 'amber' })
  }
  for (const blocked of analysis.blocked) {
    warnings.push({
      message: `${blocked.name} has no working room — needs ${blocked.requiredCm}cm clear in front of it, try rotating it.`,
      tone: 'red',
    })
  }
  if (accessibilityMode && !analysis.hasTurningCircle) {
    warnings.push({ message: 'No 150cm turning circle is available in accessibility mode.', tone: 'amber' })
  }

  const grouped = CATALOG.map((catalogItem) => ({
    ...catalogItem,
    quantity: items.filter((item) => item.type === catalogItem.type).length,
  })).filter((item) => item.quantity > 0)
  const occupiedPercent = roomArea ? (analysis.occupied_m2 / roomArea) * 100 : 0
  const circulationPercent = roomArea ? (analysis.circulation_m2 / roomArea) * 100 : 0
  const deadSpace = analysis.tight_m2 + analysis.unreachable_m2
  const deadPercent = roomArea ? (deadSpace / roomArea) * 100 : 0

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <div>
            <h1>GridCraft</h1>
            <p>Room &amp; workshop planner</p>
          </div>
        </div>
        <div className="header-room-size mono">{room.width} × {room.depth} cm</div>
      </header>

      <div className="planner-layout">
        <aside className="panel left-panel" aria-label="Room and catalogue">
          <section className="panel-section room-section">
            <div className="section-heading"><span className="section-index">01</span><h2>Room</h2></div>
            <div className="dimension-fields">
              <label>
                <span>Width</span>
                <span className="number-field"><input type="number" min="100" max="3000" step="10" value={roomFields.width} onChange={(event) => updateRoomField('width', event.target.value)} onBlur={() => commitRoomField('width')} /><b>cm</b></span>
              </label>
              <label>
                <span>Depth</span>
                <span className="number-field"><input type="number" min="100" max="3000" step="10" value={roomFields.depth} onChange={(event) => updateRoomField('depth', event.target.value)} onBlur={() => commitRoomField('depth')} /><b>cm</b></span>
              </label>
            </div>
            <div className="option-list">
              <label className="check-row"><input type="checkbox" checked={showUnreachable} onChange={(event) => setShowUnreachable(event.target.checked)} /><span className="swatch swatch-unreachable" /><span>Show unreachable floor</span></label>
              <label className="check-row"><input type="checkbox" checked={showTight} onChange={(event) => setShowTight(event.target.checked)} /><span className="swatch swatch-tight" /><span>Show tight walkways</span></label>
              <label className="check-row"><input type="checkbox" checked={accessibilityMode} onChange={(event) => setAccessibilityMode(event.target.checked)} /><span>Accessibility mode</span></label>
            </div>
          </section>

          <section className="panel-section catalogue-section">
            <div className="section-heading"><span className="section-index">02</span><h2>Catalogue</h2></div>
            {CATEGORY_ORDER.map((category) => (
              <div className="catalogue-group" key={category}>
                <h3>{CATEGORY_LABELS[category]}</h3>
                <div className="catalogue-list">
                  {CATALOG.filter((item) => item.category === category).map((item) => (
                    <button className="catalogue-item" type="button" key={item.type} onClick={() => addItem(item.type)}>
                      <span>{item.name}</span>
                      <span className="catalogue-dimensions mono">{item.width} × {item.depth}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </aside>

        <main className="workspace">
          <div className="workspace-toolbar">
            <div className="selection-tools">
              <button type="button" onClick={rotateSelected} disabled={!selectedItem}>Rotate</button>
              <button type="button" onClick={removeSelected} disabled={!selectedItem}>Remove</button>
              <span className="selection-label">{selectedItem ? CATALOG.find((item) => item.type === selectedItem.type)?.name : 'No selection'}</span>
            </div>
            <div className="layout-tools">
              <label className="visually-hidden" htmlFor="layout-name">Layout name</label>
              <input id="layout-name" className="layout-name" value={layoutName} onChange={(event) => setLayoutName(event.target.value)} />
              <button className="primary-button" type="button" onClick={saveLayout}>Save</button>
              <label className="visually-hidden" htmlFor="saved-layouts">Saved layouts</label>
              <select id="saved-layouts" value="" onChange={(event) => loadLayout(event.target.value)}>
                <option value="" disabled>Load layout</option>
                {savedLayouts.map((layout) => <option key={layout.name} value={layout.name}>{layout.name}</option>)}
              </select>
              <button type="button" onClick={exportLayout}>Export</button>
            </div>
          </div>
          <div className="canvas-stage">
            <Canvas
              room={room}
              items={items}
              analysis={analysis}
              selectedId={selectedId}
              showUnreachable={showUnreachable}
              showTight={showTight}
              onSelect={setSelectedId}
              onMove={moveItem}
            />
          </div>
          <footer className="canvas-footer">
            <span><i className="legend-dot legend-door" /> Door</span>
            <span><i className="legend-line" /> Front edge</span>
            <span className="mono">Grid 10 cm · Snap 5 cm</span>
          </footer>
        </main>

        <aside className="panel right-panel" aria-label="Layout analysis">
          <section className="panel-section budget-section">
            <div className="section-heading"><span className="section-index">03</span><h2>Floor budget</h2></div>
            <div className="room-area-line"><span>Room area</span><strong className="mono">{roomArea.toFixed(2)} m² · 100%</strong></div>
            <div className="budget-bar" role="img" aria-label={`Floor budget: ${occupiedPercent.toFixed(0)} percent occupied, ${circulationPercent.toFixed(0)} percent circulation, ${deadPercent.toFixed(0)} percent dead space`}>
              <span className="budget-occupied" style={{ width: `${occupiedPercent}%` }} />
              <span className="budget-circulation" style={{ width: `${circulationPercent}%` }} />
              <span className="budget-dead" style={{ width: `${deadPercent}%` }} />
            </div>
            <div className="budget-rows">
              <MetricRow label="Occupied" value={analysis.occupied_m2} percent={occupiedPercent} tone="occupied" />
              <MetricRow label="Circulation" value={analysis.circulation_m2} percent={circulationPercent} tone="circulation" />
              <MetricRow label="Dead space" value={deadSpace} percent={deadPercent} tone="dead" />
            </div>
          </section>

          <section className="panel-section clearance-section">
            <div className="section-heading"><span className="section-index">04</span><h2>Clearance check</h2></div>
            {warnings.length === 0 ? (
              <p className="pass-message"><i className="status-dot status-pass" />Layout passes all checks.</p>
            ) : (
              <ul className="warning-list">
                {warnings.map((warning, index) => <li key={`${warning.message}-${index}`}><i className={`status-dot status-${warning.tone}`} /><span>{warning.message}</span></li>)}
              </ul>
            )}
          </section>

          <section className="panel-section bom-section">
            <div className="section-heading"><span className="section-index">05</span><h2>Bill of materials</h2></div>
            {grouped.length === 0 ? (
              <p className="empty-prompt">Add equipment to build your bill of materials.</p>
            ) : (
              <>
                <div className="bom-table" role="table" aria-label="Bill of materials">
                  <div className="bom-row bom-head" role="row"><span>Item</span><span>Qty</span><span>Unit</span><span>Total</span></div>
                  {grouped.map((item) => (
                    <div className="bom-row" role="row" key={item.type}>
                      <span>{item.name}</span><span className="mono">{item.quantity}</span><span className="mono">{money.format(item.price)}</span><span className="mono">{money.format(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="bom-grand-total"><span>Grand total</span><strong className="mono">{money.format(grouped.reduce((sum, item) => sum + item.price * item.quantity, 0))}</strong></div>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function MetricRow({ label, value, percent, tone }: { label: string; value: number; percent: number; tone: string }) {
  return (
    <div className="metric-row">
      <span className={`metric-swatch metric-${tone}`} />
      <span>{label}</span>
      <strong className="mono">{value.toFixed(2)} m²</strong>
      <span className="metric-percent mono">{percent.toFixed(0)}%</span>
    </div>
  )
}

export default App
