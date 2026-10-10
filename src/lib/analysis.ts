import { CATALOG, type PlacedItem, type Room } from './catalog'

export interface GridAnalysis {
  grid: { cols: number; rows: number; cellCm: number }
  occupied: boolean[][]
  reachable: boolean[][]
  radius: number[][]
  circulation: boolean[][]
  tight: boolean[][]
  unreachable: boolean[][]
  walkwayMin: number
  occupied_m2: number
  circulation_m2: number
  tight_m2: number
  unreachable_m2: number
  hasTurningCircle: boolean
  blocked: { id: string; name: string; requiredCm: number }[]
}

export function analyse(room: Room, items: PlacedItem[], accessibilityMode: boolean): GridAnalysis {
  const cellCm = 10
  const cols = Math.ceil(room.width / cellCm)
  const rows = Math.ceil(room.depth / cellCm)
  const count = cols * rows
  const index = (x: number, y: number) => y * cols + x
  const occupiedFlat = Array<boolean>(count).fill(false)
  const doorItems = items.filter((item) => item.type === 'door')
  const itemDimensions = (item: PlacedItem) => {
    const catalogItem = CATALOG.find((entry) => entry.type === item.type) ?? CATALOG[0]
    return item.rotation % 180 === 0
      ? { width: catalogItem.width, depth: catalogItem.depth }
      : { width: catalogItem.depth, depth: catalogItem.width }
  }

  for (const item of items) {
    if (item.type === 'door') continue
    const dimensions = itemDimensions(item)
    const right = item.x + dimensions.width
    const bottom = item.y + dimensions.depth
    const startX = Math.max(0, Math.floor(item.x / cellCm))
    const endX = Math.min(cols - 1, Math.ceil(right / cellCm) - 1)
    const startY = Math.max(0, Math.floor(item.y / cellCm))
    const endY = Math.min(rows - 1, Math.ceil(bottom / cellCm) - 1)
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const cellLeft = x * cellCm
        const cellTop = y * cellCm
        if (cellLeft < right && cellLeft + cellCm > item.x && cellTop < bottom && cellTop + cellCm > item.y) {
          occupiedFlat[index(x, y)] = true
        }
      }
    }
  }

  const distance = occupiedFlat.map((isOccupied) => isOccupied ? 0 : Number.POSITIVE_INFINITY)
  const forward = [[-1, -1, 4], [0, -1, 3], [1, -1, 4], [-1, 0, 3]]
  const backward = [[1, 0, 3], [-1, 1, 4], [0, 1, 3], [1, 1, 4]]
  const relax = (x: number, y: number, neighbors: number[][]) => {
    const cellIndex = index(x, y)
    if (occupiedFlat[cellIndex]) return
    for (const [dx, dy, weight] of neighbors) {
      const nx = x + dx
      const ny = y + dy
      const neighborDistance = nx < 0 || nx >= cols || ny < 0 || ny >= rows
        ? 0
        : distance[index(nx, ny)]
      distance[cellIndex] = Math.min(distance[cellIndex], neighborDistance + weight)
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) relax(x, y, forward)
  }
  for (let y = rows - 1; y >= 0; y -= 1) {
    for (let x = cols - 1; x >= 0; x -= 1) relax(x, y, backward)
  }

  const radiusFlat = distance.map((value, cellIndex) => occupiedFlat[cellIndex] ? 0 : (value / 3) * cellCm)
  const walkwayMin = accessibilityMode ? 90 : 75
  const passRadius = walkwayMin / 2
  const coreReachable = Array<boolean>(count).fill(false)
  const queue: number[] = []
  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return
    const cellIndex = index(x, y)
    if (occupiedFlat[cellIndex] || radiusFlat[cellIndex] < passRadius || coreReachable[cellIndex]) return
    coreReachable[cellIndex] = true
    queue.push(cellIndex)
  }

  for (const door of doorItems) {
    const dimensions = itemDimensions(door)
    const centerX = Math.min(cols - 1, Math.max(0, Math.floor((door.x + dimensions.width / 2) / cellCm)))
    const centerY = Math.min(rows - 1, Math.max(0, Math.floor((door.y + dimensions.depth / 2) / cellCm)))
    const directions = {
      0: [0, 1],
      90: [-1, 0],
      180: [0, -1],
      270: [1, 0],
    } as const
    const [directionX, directionY] = directions[door.rotation]
    const crossX = directionY
    const crossY = -directionX
    const openingSpan = directionY !== 0 ? dimensions.width : dimensions.depth
    const halfOpeningCells = Math.ceil(openingSpan / (2 * cellCm))
    const maxSteps = directionX === 0 ? rows : cols

    for (let across = -halfOpeningCells; across <= halfOpeningCells; across += 1) {
      for (let inward = 0; inward < maxSteps; inward += 1) {
        const x = centerX + crossX * across + directionX * inward
        const y = centerY + crossY * across + directionY * inward
        if (x < 0 || x >= cols || y < 0 || y >= rows) break
        const cellIndex = index(x, y)
        if (occupiedFlat[cellIndex]) break
        if (radiusFlat[cellIndex] >= passRadius) {
          enqueue(x, y)
          break
        }
      }
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cellIndex = queue[cursor]
    const x = cellIndex % cols
    const y = Math.floor(cellIndex / cols)
    enqueue(x - 1, y)
    enqueue(x + 1, y)
    enqueue(x, y - 1)
    enqueue(x, y + 1)
  }

  const reachableFlat = [...coreReachable]
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const cellIndex = index(x, y)
      if (!coreReachable[cellIndex]) continue
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
        const neighborIndex = index(nx, ny)
        if (!occupiedFlat[neighborIndex]) reachableFlat[neighborIndex] = true
      }
    }
  }

  const circulationFlat = Array<boolean>(count).fill(false)
  const tightFlat = Array<boolean>(count).fill(false)
  const unreachableFlat = Array<boolean>(count).fill(false)
  let occupied_m2 = 0
  let circulation_m2 = 0
  let tight_m2 = 0
  let unreachable_m2 = 0
  let hasTurningCircle = false

  for (let y = 0; y < rows; y += 1) {
    const cellDepth = Math.max(0, Math.min(cellCm, room.depth - y * cellCm))
    for (let x = 0; x < cols; x += 1) {
      const cellIndex = index(x, y)
      const cellWidth = Math.max(0, Math.min(cellCm, room.width - x * cellCm))
      const areaM2 = (cellWidth * cellDepth) / 10_000
      if (occupiedFlat[cellIndex]) {
        occupied_m2 += areaM2
        continue
      }
      if (radiusFlat[cellIndex] >= 75) hasTurningCircle = true
      if (!reachableFlat[cellIndex]) {
        unreachableFlat[cellIndex] = true
        unreachable_m2 += areaM2
      } else if (radiusFlat[cellIndex] >= passRadius) {
        circulationFlat[cellIndex] = true
        circulation_m2 += areaM2
      } else {
        tightFlat[cellIndex] = true
        tight_m2 += areaM2
      }
    }
  }

  const blocked: GridAnalysis['blocked'] = []
  for (const item of items) {
    const catalogItem = CATALOG.find((entry) => entry.type === item.type) ?? CATALOG[0]
    if (catalogItem.clearance <= 0) continue
    const dimensions = itemDimensions(item)
    let left = item.x
    let top = item.y
    let width = dimensions.width
    let depth = dimensions.depth
    if (item.rotation === 0) top += dimensions.depth
    if (item.rotation === 90) {
      left -= catalogItem.clearance
      width = catalogItem.clearance
    } else if (item.rotation === 180) {
      top -= catalogItem.clearance
      depth = catalogItem.clearance
    } else if (item.rotation === 270) {
      left += dimensions.width
      width = catalogItem.clearance
    } else {
      depth = catalogItem.clearance
    }

    const samplesAcross = Math.max(1, Math.ceil(width / cellCm))
    const samplesAlong = Math.max(1, Math.ceil(depth / cellCm))
    let freeSamples = 0
    const totalSamples = samplesAcross * samplesAlong
    for (let y = 0; y < samplesAlong; y += 1) {
      for (let x = 0; x < samplesAcross; x += 1) {
        const sampleX = left + ((x + 0.5) / samplesAcross) * width
        const sampleY = top + ((y + 0.5) / samplesAlong) * depth
        if (sampleX < 0 || sampleX >= room.width || sampleY < 0 || sampleY >= room.depth) continue
        const cellX = Math.floor(sampleX / cellCm)
        const cellY = Math.floor(sampleY / cellCm)
        if (!occupiedFlat[index(cellX, cellY)]) freeSamples += 1
      }
    }
    if (freeSamples / totalSamples < 0.8) {
      blocked.push({ id: item.id, name: catalogItem.name, requiredCm: catalogItem.clearance })
    }
  }

  const asRows = (flat: boolean[]) => Array.from({ length: rows }, (_, y) => flat.slice(y * cols, (y + 1) * cols))
  const radius = Array.from({ length: rows }, (_, y) => radiusFlat.slice(y * cols, (y + 1) * cols))
  return {
    grid: { cols, rows, cellCm },
    occupied: asRows(occupiedFlat),
    reachable: asRows(reachableFlat),
    radius,
    circulation: asRows(circulationFlat),
    tight: asRows(tightFlat),
    unreachable: asRows(unreachableFlat),
    walkwayMin,
    occupied_m2,
    circulation_m2,
    tight_m2,
    unreachable_m2,
    hasTurningCircle,
    blocked,
  }
}