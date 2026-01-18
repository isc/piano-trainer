// ZIP file magic bytes (PK..)
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04]

function isZipFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer, 0, 4)
  return ZIP_MAGIC_BYTES.every((byte, i) => bytes[i] === byte)
}

function isMusicXml(content) {
  return content.includes('score-partwise') || content.includes('score-timewise')
}

async function extractXmlFromMxl(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)

  // Read META-INF/container.xml to find the main XML file
  const containerFile = zip.file('META-INF/container.xml')
  if (containerFile) {
    const containerXml = await containerFile.async('text')
    const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml')
    const fullPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path')
    const mainFile = fullPath && zip.file(fullPath)
    if (mainFile) {
      return mainFile.async('text')
    }
  }

  // Fallback: look for any root-level .xml file that looks like MusicXML
  for (const [filename, file] of Object.entries(zip.files)) {
    if (filename.endsWith('.xml') && !filename.includes('/')) {
      const content = await file.async('text')
      if (isMusicXml(content)) {
        return content
      }
    }
  }

  throw new Error('No valid MusicXML file found in archive')
}

export async function loadMxlAsXml(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()

  if (isZipFile(arrayBuffer)) {
    return extractXmlFromMxl(arrayBuffer)
  }

  // Not a ZIP, treat as plain XML text
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(arrayBuffer)
}
