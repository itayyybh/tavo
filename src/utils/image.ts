/**
 * Read an image file and return a square, downscaled data URL suitable for
 * storing inline (e.g. a restaurant logo). The source is center-cropped to a
 * square and drawn onto a `size`×`size` canvas, so the result stays small
 * (a few KB) regardless of the original resolution.
 */
export async function fileToSquareDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await loadBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)

  // PNG keeps transparency (logos often have it); size is already bounded.
  return canvas.toDataURL('image/png')
}

/** Decode a File into something drawable, preferring the faster createImageBitmap. */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image decode failed'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
