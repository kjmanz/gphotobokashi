class ImageProcessor {
    static applyMosaic(ctx, x, y, size, brushSize) {
        // Determine the grid alignment
        // We want the mosaic blocks to be aligned to a grid based on brushSize (the block size)
        // so that overlapping strokes don't create "mini" pixels.
        const blockSize = Math.max(1, Math.round(brushSize));
        const radius = size / 2;

        // Calculate the bounding box of the brush area (circle-ish, but for mosaic we'll do squares)
        // For simplicity in this version, we'll mosaic-ify the square area surrounding the point.
        // Or better: iterate pixels in the brush radius? 
        // Optimization: Calculate the grid cells that the brush touches.

        const startX = Math.max(0, Math.floor((x - radius) / blockSize) * blockSize);
        const startY = Math.max(0, Math.floor((y - radius) / blockSize) * blockSize);
        const endX = Math.min(ctx.canvas.width, Math.ceil((x + radius) / blockSize) * blockSize);
        const endY = Math.min(ctx.canvas.height, Math.ceil((y + radius) / blockSize) * blockSize);

        for (let bx = startX; bx < endX; bx += blockSize) {
            for (let by = startY; by < endY; by += blockSize) {
                // Check if this block is within the brush circle (optional, but makes it round)
                const centerX = bx + blockSize / 2;
                const centerY = by + blockSize / 2;
                const dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);

                if (dist < radius + blockSize / 2) {
                    const width = Math.min(blockSize, ctx.canvas.width - bx);
                    const height = Math.min(blockSize, ctx.canvas.height - by);
                    ImageProcessor.pixelateBlock(ctx, bx, by, width, height);
                }
            }
        }
    }

    static pixelateBlock(ctx, x, y, width, height) {
        try {
            // Create a temporary 1x1 canvas to downscale/upscale or just average the pixels.
            // Simpler: get data, avg, put data.
            const startX = Math.max(0, Math.floor(x));
            const startY = Math.max(0, Math.floor(y));
            const w = Math.min(Math.max(0, Math.floor(width)), ctx.canvas.width - startX);
            const h = Math.min(Math.max(0, Math.floor(height)), ctx.canvas.height - startY);

            if (w <= 0 || h <= 0) return;

            const imageData = ctx.getImageData(startX, startY, w, h);
            const data = imageData.data;

            let r = 0, g = 0, b = 0, a = 0;

            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                a += data[i + 3]; // handling transparency? usually photos are opaque.
            }

            const count = data.length / 4;
            r = Math.round(r / count);
            g = Math.round(g / count);
            b = Math.round(b / count);
            a = Math.round(a / count); // Keep alpha

            ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
            ctx.fillRect(startX, startY, w, h);
        } catch (e) {
            // CORS might block this if image is not tainted correctly.
            // Google Photos images might be CORS protected.
            // We might need to proxy or use `crossOrigin = "anonymous"` if possible.
            console.error('Pixel manipulation error:', e);
        }
    }

    static applyBlur(ctx, x, y, size, intensity) {
        // Use a local bounding-box OffscreenCanvas so brush strokes stay fast on large photos.
        const radius = size / 2;
        const margin = Math.ceil(intensity * 2.5);
        const sx = Math.max(0, Math.floor(x - radius - margin));
        const sy = Math.max(0, Math.floor(y - radius - margin));
        const ex = Math.min(ctx.canvas.width, Math.ceil(x + radius + margin));
        const ey = Math.min(ctx.canvas.height, Math.ceil(y + radius + margin));
        const sw = ex - sx;
        const sh = ey - sy;
        if (sw <= 0 || sh <= 0) return;

        const offCanvas = new OffscreenCanvas(sw, sh);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();

        ctx.filter = `blur(${intensity}px)`;
        ctx.drawImage(offCanvas, sx, sy);

        ctx.restore();
        ctx.filter = 'none';
    }

    static applyMosaicToRect(ctx, rect, brushSize) {
        const { x, y, width, height } = rect;
        const blockSize = Math.max(1, Math.round(brushSize));
        // Align to grid
        const startX = Math.max(0, Math.floor(x));
        const startY = Math.max(0, Math.floor(y));
        const endX = Math.min(ctx.canvas.width, Math.ceil(x + width));
        const endY = Math.min(ctx.canvas.height, Math.ceil(y + height));

        for (let bx = startX; bx < endX; bx += blockSize) {
            for (let by = startY; by < endY; by += blockSize) {
                // Calculate actual block width/height (clip at edges of selection)
                const w = Math.min(blockSize, endX - bx);
                const h = Math.min(blockSize, endY - by);
                ImageProcessor.pixelateBlock(ctx, bx, by, w, h);
            }
        }
    }

    static applyMosaicToRectInverse(ctx, rect, brushSize) {
        const { x, y, width, height } = rect;
        const endX = x + width;
        const endY = y + height;

        // Top
        ImageProcessor.applyMosaicToRect(ctx, {
            x: 0,
            y: 0,
            width: ctx.canvas.width,
            height: Math.max(0, y)
        }, brushSize);

        // Bottom
        ImageProcessor.applyMosaicToRect(ctx, {
            x: 0,
            y: Math.max(0, endY),
            width: ctx.canvas.width,
            height: Math.max(0, ctx.canvas.height - endY)
        }, brushSize);

        // Left
        ImageProcessor.applyMosaicToRect(ctx, {
            x: 0,
            y: Math.max(0, y),
            width: Math.max(0, x),
            height: Math.max(0, height)
        }, brushSize);

        // Right
        ImageProcessor.applyMosaicToRect(ctx, {
            x: Math.max(0, endX),
            y: Math.max(0, y),
            width: Math.max(0, ctx.canvas.width - endX),
            height: Math.max(0, height)
        }, brushSize);
    }

    static applyMosaicToPolygon(ctx, points, brushSize) {
        if (!points || points.length < 3) return;
        const blockSize = Math.max(1, Math.round(brushSize));

        let minX = points[0].x;
        let maxX = points[0].x;
        let minY = points[0].y;
        let maxY = points[0].y;

        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }

        const startX = Math.max(0, Math.floor(minX / blockSize) * blockSize);
        const startY = Math.max(0, Math.floor(minY / blockSize) * blockSize);
        const endX = Math.min(ctx.canvas.width, Math.ceil(maxX / blockSize) * blockSize);
        const endY = Math.min(ctx.canvas.height, Math.ceil(maxY / blockSize) * blockSize);

        for (let bx = startX; bx < endX; bx += blockSize) {
            for (let by = startY; by < endY; by += blockSize) {
                const centerX = bx + blockSize / 2;
                const centerY = by + blockSize / 2;
                if (ImageProcessor.isPointInPolygon(centerX, centerY, points)) {
                    const w = Math.min(blockSize, ctx.canvas.width - bx);
                    const h = Math.min(blockSize, ctx.canvas.height - by);
                    ImageProcessor.pixelateBlock(ctx, bx, by, w, h);
                }
            }
        }
    }

    static applyMosaicToPolygonInverse(ctx, points, brushSize) {
        if (!points || points.length < 3) return;
        const blockSize = Math.max(1, Math.round(brushSize));
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;

        for (let bx = 0; bx < canvasWidth; bx += blockSize) {
            for (let by = 0; by < canvasHeight; by += blockSize) {
                const centerX = bx + blockSize / 2;
                const centerY = by + blockSize / 2;
                if (!ImageProcessor.isPointInPolygon(centerX, centerY, points)) {
                    const w = Math.min(blockSize, canvasWidth - bx);
                    const h = Math.min(blockSize, canvasHeight - by);
                    ImageProcessor.pixelateBlock(ctx, bx, by, w, h);
                }
            }
        }
    }

    static isPointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    static applyBlurToRect(ctx, rect, intensity) {
        const offCanvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, 0, 0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
        ctx.clip();

        ctx.filter = `blur(${intensity}px)`;
        ctx.drawImage(offCanvas, 0, 0);

        ctx.restore();
        ctx.filter = 'none';
    }

    static applyBlurToRectInverse(ctx, rect, intensity) {
        const offCanvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, 0, 0);

        ctx.save();
        ctx.beginPath();
        // Create a path that includes the whole canvas MINUS the rect
        // Winding rule 'evenodd' allows us to cut holes easily, 
        // or we can just draw 4 rectangles around the selection.
        // Drawing 4 rectangles is simpler and robust.
        
        // Top
        ctx.rect(0, 0, ctx.canvas.width, rect.y);
        // Bottom
        ctx.rect(0, rect.y + rect.height, ctx.canvas.width, ctx.canvas.height - (rect.y + rect.height));
        // Left
        ctx.rect(0, rect.y, rect.x, rect.height);
        // Right
        ctx.rect(rect.x + rect.width, rect.y, ctx.canvas.width - (rect.x + rect.width), rect.height);
        
        ctx.clip();

        ctx.filter = `blur(${intensity}px)`;
        ctx.drawImage(offCanvas, 0, 0);

        ctx.restore();
        ctx.filter = 'none';
    }

    static applyBlurToPolygon(ctx, points, intensity) {
        if (!points || points.length < 3) return;
        const offCanvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, 0, 0);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.clip();

        ctx.filter = `blur(${intensity}px)`;
        ctx.drawImage(offCanvas, 0, 0);

        ctx.restore();
        ctx.filter = 'none';
    }

    static applyBlurToPolygonInverse(ctx, points, intensity) {
        if (!points || points.length < 3) return;
        const offCanvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, 0, 0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.clip('evenodd');

        ctx.filter = `blur(${intensity}px)`;
        ctx.drawImage(offCanvas, 0, 0);

        ctx.restore();
        ctx.filter = 'none';
    }

    static applyEffectByMask(ctx, maskData, options = {}) {
        if (!maskData || !maskData.mask) return;
        const {
            effectType = 'mosaic',
            isInverse = true,
            blockSize = 20,
            blurAmount = 10
        } = options;

        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;
        const { mask, width: mw, height: mh } = maskData;

        const effectCanvas = new OffscreenCanvas(cw, ch);
        const effectCtx = effectCanvas.getContext('2d', { willReadFrequently: true });

        if (effectType === 'blur') {
            effectCtx.filter = `blur(${blurAmount}px)`;
            effectCtx.drawImage(ctx.canvas, 0, 0);
            effectCtx.filter = 'none';
        } else {
            effectCtx.drawImage(ctx.canvas, 0, 0);
            const bs = Math.max(2, Math.round(blockSize));
            const imgData = effectCtx.getImageData(0, 0, cw, ch);
            const data = imgData.data;

            for (let by = 0; by < ch; by += bs) {
                const bh = Math.min(bs, ch - by);
                for (let bx = 0; bx < cw; bx += bs) {
                    const bw = Math.min(bs, cw - bx);
                    let r = 0, g = 0, b = 0, a = 0;
                    const count = bw * bh;

                    for (let y = 0; y < bh; y++) {
                        let rowOffset = ((by + y) * cw + bx) * 4;
                        for (let x = 0; x < bw; x++) {
                            r += data[rowOffset];
                            g += data[rowOffset + 1];
                            b += data[rowOffset + 2];
                            a += data[rowOffset + 3];
                            rowOffset += 4;
                        }
                    }

                    const ar = Math.round(r / count);
                    const ag = Math.round(g / count);
                    const ab = Math.round(b / count);
                    const aa = Math.round(a / count);

                    for (let y = 0; y < bh; y++) {
                        let rowOffset = ((by + y) * cw + bx) * 4;
                        for (let x = 0; x < bw; x++) {
                            data[rowOffset] = ar;
                            data[rowOffset + 1] = ag;
                            data[rowOffset + 2] = ab;
                            data[rowOffset + 3] = aa;
                            rowOffset += 4;
                        }
                    }
                }
            }
            effectCtx.putImageData(imgData, 0, 0);
        }

        // Build small mask canvas and upscale with slight feathering
        const smallMaskCanvas = new OffscreenCanvas(mw, mh);
        const smallCtx = smallMaskCanvas.getContext('2d');
        const maskImg = smallCtx.createImageData(mw, mh);
        const mData = maskImg.data;
        const invert = Boolean(isInverse);

        for (let i = 0; i < mask.length; i++) {
            const isTarget = (mask[i] === 1) !== invert;
            const p = i * 4;
            mData[p] = 255;
            mData[p + 1] = 255;
            mData[p + 2] = 255;
            mData[p + 3] = isTarget ? 255 : 0;
        }
        smallCtx.putImageData(maskImg, 0, 0);

        const fullMaskCanvas = new OffscreenCanvas(cw, ch);
        const fullMaskCtx = fullMaskCanvas.getContext('2d');
        fullMaskCtx.imageSmoothingEnabled = true;
        fullMaskCtx.filter = 'blur(2px)';
        fullMaskCtx.drawImage(smallMaskCanvas, 0, 0, cw, ch);
        fullMaskCtx.filter = 'none';

        effectCtx.globalCompositeOperation = 'destination-in';
        effectCtx.drawImage(fullMaskCanvas, 0, 0);
        effectCtx.globalCompositeOperation = 'source-over';

        ctx.save();
        ctx.drawImage(effectCanvas, 0, 0);
        ctx.restore();
    }
}
