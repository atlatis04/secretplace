/**
 * Reads the location and capture time a camera writes into a photo.
 *
 * Photos are resized through a canvas before upload, which drops every EXIF
 * block, so this has to run on the original File before resizeImage() touches
 * it. Returns null for anything the photo does not carry - screenshots, images
 * stripped by a messenger app, or files saved without location access.
 */
export async function readPhotoContext(file) {
    try {
        // Loaded on demand: most sessions never open the photo picker, and the
        // parser is larger than the rest of the app's own code.
        const { default: exifr } = await import('exifr')
        // latitude/longitude are derived from the GPS block rather than raw
        // tags, so they have to be requested by enabling the block - a global
        // `pick` list filters them straight back out.
        const exif = await exifr.parse(file, {
            ifd0: false,
            exif: ['DateTimeOriginal', 'CreateDate'],
            gps: true,
            interop: false,
            thumbnail: false,
            iptc: false,
            xmp: false
        })
        if (!exif) return null

        const latitude = Number(exif.latitude)
        const longitude = Number(exif.longitude)
        const hasCoords =
            Number.isFinite(latitude) && Number.isFinite(longitude) &&
            Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
            // Cameras that record "no fix" write a literal 0,0.
            !(latitude === 0 && longitude === 0)

        const taken = exif.DateTimeOriginal || exif.CreateDate
        const takenAt = taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken : null

        if (!hasCoords && !takenAt) return null

        return {
            latitude: hasCoords ? latitude : null,
            longitude: hasCoords ? longitude : null,
            visitDate: takenAt ? toDateInputValue(takenAt) : null
        }
    } catch {
        // A photo with malformed or absent EXIF is normal, not an error worth
        // interrupting the upload for.
        return null
    }
}

/** Date in the photo's own local time, formatted for <input type="date">. */
function toDateInputValue(date) {
    const pad = n => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
