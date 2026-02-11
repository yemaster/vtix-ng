import { randomBytes } from 'crypto'
import { writeFile } from 'fs/promises'
import { resolve } from 'path'

const buildId = randomBytes(4).toString('hex')
const buildTime = new Date().toISOString()
const content = `export const BUILD_ID = '${buildId}';\nexport const BUILD_TIME = '${buildTime}';\n`

await writeFile(resolve('src/build-info.ts'), content, 'utf8')
