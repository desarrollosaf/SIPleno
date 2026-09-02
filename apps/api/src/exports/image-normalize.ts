import { PNG } from 'pngjs';

const MAX_PIXELS = 4_000_000; // ~2000×2000: límite para decodificar en JS con seguridad

/**
 * Prepara una fotografía para incrustarla en el PDF de forma segura y rápida.
 *
 * - Los JPEG se devuelven tal cual: pdfkit los incrusta sin decodificarlos.
 * - Los PNG se decodifican, se aplanan sobre fondo blanco (se elimina el canal
 *   alfa) y se vuelven a codificar como PNG RGB sin transparencia. Esto es
 *   importante porque pdfkit procesa los PNG con canal alfa por una ruta
 *   asíncrona que puede quedarse bloqueada en servidores con poca CPU; sin alfa,
 *   usa su ruta rápida y síncrona.
 * - Cualquier imagen no reconocida o demasiado grande devuelve `null` y se omite.
 */
export function normalizePhotoForPdf(buffer: Buffer): Buffer | null {
  if (!buffer || buffer.length < 24) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return buffer;
  }

  // PNG: firma 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (!isPng) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width * height > MAX_PIXELS) return null;

  try {
    const decoded = PNG.sync.read(buffer);
    const data = decoded.data; // RGBA de 8 bits
    // Composición sobre blanco: quita la transparencia conservando el color.
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha !== 255) {
        const factor = alpha / 255;
        data[index] = Math.round(data[index] * factor + 255 * (1 - factor));
        data[index + 1] = Math.round(data[index + 1] * factor + 255 * (1 - factor));
        data[index + 2] = Math.round(data[index + 2] * factor + 255 * (1 - factor));
        data[index + 3] = 255;
      }
    }
    // Se reescribe como PNG RGB (tipo de color 2), sin canal alfa.
    return PNG.sync.write(decoded, { colorType: 2 });
  } catch {
    return null;
  }
}
