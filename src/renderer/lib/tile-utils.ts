// Tile tree types and pure manipulation functions

export type TileId = string

let _tileCounter = 0
export function generateTileId(): TileId {
  return `tile_${++_tileCounter}_${Date.now().toString(36)}`
}

export type TileLeaf = { type: 'leaf'; id: TileId; sessionId: string }
export type TileSplit = {
  type: 'split'
  id: TileId
  direction: 'horizontal' | 'vertical'
  ratio: number
  first: TileNode
  second: TileNode
}
export type TileNode = TileLeaf | TileSplit

export function createLeaf(sessionId: string): TileLeaf {
  return { type: 'leaf', id: generateTileId(), sessionId }
}

export function findNode(tree: TileNode, tileId: TileId): TileNode | null {
  if (tree.id === tileId) return tree
  if (tree.type === 'split') {
    return findNode(tree.first, tileId) || findNode(tree.second, tileId)
  }
  return null
}

export function findLeaves(tree: TileNode): TileLeaf[] {
  if (tree.type === 'leaf') return [tree]
  return [...findLeaves(tree.first), ...findLeaves(tree.second)]
}

export function findLeafBySessionId(tree: TileNode, sessionId: string): TileLeaf | null {
  if (tree.type === 'leaf') return tree.sessionId === sessionId ? tree : null
  return findLeafBySessionId(tree.first, sessionId) || findLeafBySessionId(tree.second, sessionId)
}

/**
 * Replace a leaf with a split node containing the original leaf + a new leaf.
 * Returns a new tree (immutable).
 */
export function splitNode(
  tree: TileNode,
  tileId: TileId,
  direction: 'horizontal' | 'vertical',
  newSessionId: string
): TileNode {
  if (tree.type === 'leaf') {
    if (tree.id === tileId) {
      return {
        type: 'split',
        id: generateTileId(),
        direction,
        ratio: 0.5,
        first: tree,
        second: createLeaf(newSessionId)
      }
    }
    return tree
  }

  const newFirst = splitNode(tree.first, tileId, direction, newSessionId)
  const newSecond = splitNode(tree.second, tileId, direction, newSessionId)
  if (newFirst === tree.first && newSecond === tree.second) return tree
  return { ...tree, first: newFirst, second: newSecond }
}

/**
 * Remove a leaf and promote its sibling.
 * Returns the new tree, or null if the tree is now empty.
 */
export function removeNode(tree: TileNode, tileId: TileId): TileNode | null {
  if (tree.type === 'leaf') {
    return tree.id === tileId ? null : tree
  }

  // If one of the direct children is the target, promote the sibling
  if (tree.first.id === tileId) return tree.second
  if (tree.second.id === tileId) return tree.first

  // Recurse
  const newFirst = removeNode(tree.first, tileId)
  const newSecond = removeNode(tree.second, tileId)

  // If a child was removed, its subtree returned the promoted sibling
  if (newFirst === null) return tree.second
  if (newSecond === null) return tree.first
  if (newFirst === tree.first && newSecond === tree.second) return tree
  return { ...tree, first: newFirst, second: newSecond }
}

/**
 * Update the ratio of a split node.
 */
export function resizeNode(tree: TileNode, tileId: TileId, newRatio: number): TileNode {
  if (tree.type === 'leaf') return tree
  if (tree.id === tileId) {
    return { ...tree, ratio: Math.max(0.15, Math.min(0.85, newRatio)) }
  }
  const newFirst = resizeNode(tree.first, tileId, newRatio)
  const newSecond = resizeNode(tree.second, tileId, newRatio)
  if (newFirst === tree.first && newSecond === tree.second) return tree
  return { ...tree, first: newFirst, second: newSecond }
}

/**
 * Replace the sessionId of a leaf node, returning a new tree.
 */
export function replaceLeafSession(tree: TileNode, tileId: TileId, newSessionId: string): TileNode {
  if (tree.type === 'leaf') {
    if (tree.id === tileId) {
      return { ...tree, sessionId: newSessionId }
    }
    return tree
  }
  const newFirst = replaceLeafSession(tree.first, tileId, newSessionId)
  const newSecond = replaceLeafSession(tree.second, tileId, newSessionId)
  if (newFirst === tree.first && newSecond === tree.second) return tree
  return { ...tree, first: newFirst, second: newSecond }
}

/**
 * Find the parent split node of a given tile.
 */
export function findParent(tree: TileNode, tileId: TileId): TileSplit | null {
  if (tree.type === 'leaf') return null
  if (tree.first.id === tileId || tree.second.id === tileId) return tree
  return findParent(tree.first, tileId) || findParent(tree.second, tileId)
}

/**
 * Get adjacent leaf in a given direction for focus navigation.
 */
export function getAdjacentLeaf(
  tree: TileNode,
  tileId: TileId,
  direction: 'left' | 'right' | 'up' | 'down'
): TileLeaf | null {
  const leaves = findLeaves(tree)
  const idx = leaves.findIndex((l) => l.id === tileId)
  if (idx === -1) return null

  // Simple linear navigation: left/up = previous, right/down = next
  if (direction === 'left' || direction === 'up') {
    return idx > 0 ? leaves[idx - 1] : null
  }
  return idx < leaves.length - 1 ? leaves[idx + 1] : null
}
