// ZIP file magic bytes (PK..)
const ZIP_MAGIC_BYTES = [0x50, 0x4b, 0x03, 0x04]

function isZipFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer, 0, 4)
  return ZIP_MAGIC_BYTES.every((byte, index) => bytes[index] === byte)
}

async function extractXmlFromMxl(arrayBuffer) {
  // JSZip is loaded globally via script tag
  const zip = await JSZip.loadAsync(arrayBuffer)

  // Read META-INF/container.xml to find the main XML file
  const containerFile = zip.file('META-INF/container.xml')
  if (containerFile) {
    const containerXml = await containerFile.async('text')
    const parser = new DOMParser()
    const containerDoc = parser.parseFromString(containerXml, 'text/xml')
    const rootfile = containerDoc.querySelector('rootfile')
    if (rootfile) {
      const fullPath = rootfile.getAttribute('full-path')
      const mainFile = zip.file(fullPath)
      if (mainFile) {
        return mainFile.async('text')
      }
    }
  }

  // Fallback: look for any .xml file at the root that looks like MusicXML
  for (const [filename, file] of Object.entries(zip.files)) {
    if (filename.endsWith('.xml') && !filename.includes('/')) {
      const content = await file.async('text')
      if (content.includes('score-partwise') || content.includes('score-timewise')) {
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
