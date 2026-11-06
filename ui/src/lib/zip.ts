/**
 * Reads files out of a ZIP archive held in memory, as an EPUB is: the central directory once,
 * then each entry on demand, inflated by the browser's own DecompressionStream.
 */

export interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  /** Where the entry's local header starts. */
  offset: number
}

export class ZipFile {
  readonly entries: Map<string, ZipEntry>
  private readonly view: DataView

  constructor(private readonly data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    this.entries = this.readDirectory()
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  async bytes(name: string): Promise<Uint8Array> {
    const entry = this.entries.get(name)
    if (!entry) throw new Error(`${name} isn't in the book`)
    const nameLen = this.view.getUint16(entry.offset + 26, true)
    const extraLen = this.view.getUint16(entry.offset + 28, true)
    const start = entry.offset + 30 + nameLen + extraLen
    const raw = this.data.subarray(start, start + entry.compressedSize)
    if (entry.method === 0) return raw
    if (entry.method !== 8) {
      throw new Error(`${name} uses a compression this app can't read`)
    }
    const stream = new Response(raw as BodyInit).body!.pipeThrough(
      new DecompressionStream('deflate-raw'),
    )
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  async text(name: string): Promise<string> {
    return new TextDecoder().decode(await this.bytes(name))
  }

  private readDirectory(): Map<string, ZipEntry> {
    const { view } = this
    // The end of central directory record: in the last 22 bytes, or before a comment
    let end = -1
    for (
      let at = view.byteLength - 22;
      at >= Math.max(0, view.byteLength - 65_557);
      at--
    ) {
      if (view.getUint32(at, true) === 0x06054b50) {
        end = at
        break
      }
    }
    if (end < 0)
      throw new Error('This file isn’t a ZIP archive, or it’s cut short')

    const count = view.getUint16(end + 10, true)
    let at = view.getUint32(end + 16, true)
    const decoder = new TextDecoder()
    const entries = new Map<string, ZipEntry>()
    for (let i = 0; i < count; i++) {
      if (view.getUint32(at, true) !== 0x02014b50) break
      const nameLen = view.getUint16(at + 28, true)
      const extraLen = view.getUint16(at + 30, true)
      const commentLen = view.getUint16(at + 32, true)
      const name = decoder.decode(
        this.data.subarray(at + 46, at + 46 + nameLen),
      )
      entries.set(name, {
        name,
        method: view.getUint16(at + 10, true),
        compressedSize: view.getUint32(at + 20, true),
        size: view.getUint32(at + 24, true),
        offset: view.getUint32(at + 42, true),
      })
      at += 46 + nameLen + extraLen + commentLen
    }
    return entries
  }
}
