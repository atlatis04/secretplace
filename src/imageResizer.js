/**
 * Image Resizer and WebP Converter
 * Resizes images to max 1200px and converts to WebP format
 */

/**
 * Resize image and convert to WebP
 * @param {File} file - Original image file
 * @param {number} maxSize - Maximum width/height (default: 1200)
 * @param {number} quality - WebP quality 0-1 (default: 0.85)
 * @returns {Promise<Blob>} - Resized WebP blob
 */
export async function resizeImage(file, maxSize = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }

                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                // Draw resized image
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to WebP blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to convert image to WebP'));
                        }
                    },
                    'image/webp',
                    quality
                );
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Generate optimized filename with WebP extension
 * @param {string} originalName - Original filename
 * @returns {string} - New filename with .webp extension
 */
export function getOptimizedFileName(originalName) {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const baseName = originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    return `${baseName}_${timestamp}_${randomStr}.webp`;
}
