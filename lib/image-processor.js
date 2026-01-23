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
        // Use an offscreen canvas to ensure the blur filter is applied correctly
        // independently of the current context state.
        const offCanvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, 0, 0);

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.clip();

        ctx.filter = `blur(${intensity}px)`;
        ctx.drawImage(offCanvas, 0, 0);

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
        const offCanvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(ctx.canvas, 0, 0);

        ImageProcessor.applyMosaicToRect(ctx, {
            x: 0,
            y: 0,
            width: ctx.canvas.width,
            height: ctx.canvas.height
        }, brushSize);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(offCanvas, 0, 0);
        ctx.restore();
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
}
