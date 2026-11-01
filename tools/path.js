import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = fileURLToPath(new URL('../', import.meta.url))
const yunzaiRoot = path.resolve(pluginRoot, '../..')

export { pluginRoot, yunzaiRoot }
