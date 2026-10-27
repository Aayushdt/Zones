import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const DIST_DIR = path.resolve('apps/web/dist')
const ASSETS_DIR = path.join(DIST_DIR, 'assets')

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`Error: Assets directory not found at ${ASSETS_DIR}. Run 'pnpm --filter @xzones/web build' first.`)
  process.exit(1)
}

const files = fs.readdirSync(ASSETS_DIR)

const BUDGETS = {
  maxEntryJsGzipKb: 130,
  maxIndexCssGzipKb: 30,
  maxMapLibreGzipKb: 320,
}

let failed = false

console.log('=== Checking Web Asset Bundle Budgets ===')

// 1. Check for unbudgeted/leaked non-Latin font subsets
const nonLatinFonts = files.filter(f => /inter-(cyrillic|greek|vietnamese)/i.test(f))
if (nonLatinFonts.length > 0) {
  console.error(`❌ Budget violation: Found ${nonLatinFonts.length} non-Latin font subsets emitted to dist:`, nonLatinFonts)
  failed = true
} else {
  console.log('✓ Font subsetting check passed: zero unused non-Latin font files emitted.')
}

// 2. Measure chunk sizes
for (const file of files) {
  const filePath = path.join(ASSETS_DIR, file)
  const stat = fs.statSync(filePath)
  const content = fs.readFileSync(filePath)
  const gzipSize = zlib.gzipSync(content).length
  const gzipKb = (gzipSize / 1024).toFixed(2)
  const rawKb = (stat.size / 1024).toFixed(2)

  if (file.startsWith('index-') && file.endsWith('.js')) {
    console.log(`Entry JS (${file}): ${rawKb} kB (raw) / ${gzipKb} kB (gzip) [Budget: <= ${BUDGETS.maxEntryJsGzipKb} kB]`)
    if (gzipSize > BUDGETS.maxEntryJsGzipKb * 1024) {
      console.error(`❌ Budget violation: Entry JS exceeds ${BUDGETS.maxEntryJsGzipKb} kB gzip limit (${gzipKb} kB)!`)
      failed = true
    }
  }

  if (file.startsWith('index-') && file.endsWith('.css')) {
    console.log(`Global CSS (${file}): ${rawKb} kB (raw) / ${gzipKb} kB (gzip) [Budget: <= ${BUDGETS.maxIndexCssGzipKb} kB]`)
    if (gzipSize > BUDGETS.maxIndexCssGzipKb * 1024) {
      console.error(`❌ Budget violation: Global CSS exceeds ${BUDGETS.maxIndexCssGzipKb} kB gzip limit (${gzipKb} kB)!`)
      failed = true
    }
  }

  if (file.startsWith('maplibre-gl-') && file.endsWith('.js') && !file.includes('worker')) {
    console.log(`MapLibre Chunk (${file}): ${rawKb} kB (raw) / ${gzipKb} kB (gzip) [Budget: <= ${BUDGETS.maxMapLibreGzipKb} kB]`)
    if (gzipSize > BUDGETS.maxMapLibreGzipKb * 1024) {
      console.error(`❌ Budget violation: MapLibre chunk exceeds ${BUDGETS.maxMapLibreGzipKb} kB gzip limit (${gzipKb} kB)!`)
      failed = true
    }
  }
}

if (failed) {
  console.error('❌ Bundle budget checks FAILED.')
  process.exit(1)
} else {
  console.log('✓ All asset bundle budget checks PASSED.')
}
