export type ItemType =
  | 'desk'
  | 'chair'
  | 'workbench'
  | 'printer3d'
  | 'laser'
  | 'cnc'
  | 'shelving'
  | 'toolchest'
  | 'table'
  | 'sofa'
  | 'bin'
  | 'door'

export type Category = 'furniture' | 'machine' | 'storage' | 'fixture'

export interface CatalogItem {
  type: ItemType
  name: string
  width: number
  depth: number
  clearance: number
  price: number
  category: Category
}

export interface PlacedItem {
  id: string
  type: ItemType
  x: number
  y: number
  rotation: 0 | 90 | 180 | 270
}

export interface Room {
  width: number
  depth: number
}

export const CATALOG: CatalogItem[] = [
  { type: 'desk', name: 'Desk', width: 140, depth: 70, clearance: 75, price: 180, category: 'furniture' },
  { type: 'chair', name: 'Chair', width: 50, depth: 50, clearance: 0, price: 60, category: 'furniture' },
  { type: 'workbench', name: 'Workbench', width: 180, depth: 80, clearance: 90, price: 420, category: 'furniture' },
  { type: 'printer3d', name: '3D printer', width: 60, depth: 60, clearance: 60, price: 350, category: 'machine' },
  { type: 'laser', name: 'Laser cutter', width: 110, depth: 70, clearance: 90, price: 2400, category: 'machine' },
  { type: 'cnc', name: 'CNC router', width: 120, depth: 90, clearance: 90, price: 3100, category: 'machine' },
  { type: 'shelving', name: 'Shelving', width: 90, depth: 40, clearance: 60, price: 120, category: 'storage' },
  { type: 'toolchest', name: 'Tool chest', width: 70, depth: 50, clearance: 60, price: 260, category: 'storage' },
  { type: 'table', name: 'Meeting table', width: 160, depth: 90, clearance: 90, price: 300, category: 'furniture' },
  { type: 'sofa', name: 'Sofa', width: 200, depth: 90, clearance: 75, price: 650, category: 'furniture' },
  { type: 'bin', name: 'Waste bin', width: 40, depth: 40, clearance: 0, price: 25, category: 'storage' },
  { type: 'door', name: 'Door', width: 80, depth: 12, clearance: 0, price: 0, category: 'fixture' },
]

export function getItemDimensions(item: Pick<PlacedItem, 'type' | 'rotation'>): { width: number; depth: number } {
  const catalogItem = CATALOG.find((entry) => entry.type === item.type) ?? CATALOG[0]
  return item.rotation % 180 === 0
    ? { width: catalogItem.width, depth: catalogItem.depth }
    : { width: catalogItem.depth, depth: catalogItem.width }
}