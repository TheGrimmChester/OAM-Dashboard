import React from 'react'
import {
  FiGrid, FiHome, FiFolder, FiUsers, FiCpu, FiServer, FiKey, FiList, FiUser, FiGitBranch,
} from 'react-icons/fi'

/**
 * One glyph per destination.
 *
 * The kit ships no product iconography — every component that shows a
 * subject-matter icon takes it as a node — so the mapping lives here, next to
 * the IA it serves. The collapsed rail is icon-only, which is why `nav.test.js`
 * asserts no two visible rail items resolve to the same glyph.
 */
const GLYPHS = {
  grid: FiGrid,
  building: FiHome,
  folder: FiFolder,
  users: FiUsers,
  cpu: FiCpu,
  server: FiServer,
  key: FiKey,
  git: FiGitBranch,
  list: FiList,
  user: FiUser,
}

export function navIcon(name) {
  const Icon = GLYPHS[name]
  return Icon ? <Icon /> : null
}

export default GLYPHS
