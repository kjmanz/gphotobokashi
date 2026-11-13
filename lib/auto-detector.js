class AutoDetector {
    static rgbToLab(r, g, b) {
        let sr = r / 255;
        let sg = g / 255;
        let sb = b / 255;

        sr = sr > 0.04045 ? Math.pow((sr + 0.055) / 1.055, 2.4) : sr / 12.92;
        sg = sg > 0.04045 ? Math.pow((sg + 0.055) / 1.055, 2.4) : sg / 12.92;
        sb = sb > 0.04045 ? Math.pow((sb + 0.055) / 1.055, 2.4) : sb / 12.92;

        // D65 reference white
        let x = (sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375) / 0.95047;
        let y = (sr * 0.2126729 + sg * 0.7151522 + sb * 0.0721750) / 1.00000;
        let z = (sr * 0.0193339 + sg * 0.1191920 + sb * 0.9503041) / 1.08883;

        const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
        const fx = f(x);
        const fy = f(y);
        const fz = f(z);

        const L = 116 * fy - 16;
        const a = 500 * (fx - fy);
        const lb = 200 * (fy - fz);
        return [L, a, lb];
    }

    static downsampleCanvas(canvas, maxDim) {
        const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
        const w = Math.max(16, Math.round(canvas.width * scale));
        const h = Math.max(16, Math.round(canvas.height * scale));

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        return { width: w, height: h, data, scaleX: canvas.width / w, scaleY: canvas.height / h };
    }

    static computeLabAndEdges(data, w, h) {
        const total = w * h;
        const lab = new Float32Array(total * 3);
        const lum = new Float32Array(total);
        for (let i = 0; i < total; i++) {
            const p = i * 4;
            const [L, a, b] = AutoDetector.rgbToLab(data[p], data[p + 1], data[p + 2]);
            lab[i * 3] = L;
            lab[i * 3 + 1] = a;
            lab[i * 3 + 2] = b;
            lum[i] = L;
        }

        const edges = new Float32Array(total);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const gx =
                    -lum[idx - w - 1] + lum[idx - w + 1] +
                    -2 * lum[idx - 1] + 2 * lum[idx + 1] +
                    -lum[idx + w - 1] + lum[idx + w + 1];
                const gy =
                    -lum[idx - w - 1] - 2 * lum[idx - w] - lum[idx - w + 1] +
                    lum[idx + w - 1] + 2 * lum[idx + w] + lum[idx + w + 1];
                edges[idx] = Math.hypot(gx, gy) * 0.25;
            }
        }
        return { lab, edges };
    }

    static labDist(lab, i1, i2) {
        const o1 = i1 * 3;
        const o2 = i2 * 3;
        const dL = lab[o1] - lab[o2];
        const da = lab[o1 + 1] - lab[o2 + 1];
        const db = lab[o1 + 2] - lab[o2 + 2];
        return Math.sqrt(dL * dL + da * da + db * db);
    }

    static labDistToColor(lab, idx, c) {
        const o = idx * 3;
        const dL = lab[o] - c[0];
        const da = lab[o + 1] - c[1];
        const db = lab[o + 2] - c[2];
        return Math.sqrt(dL * dL + da * da + db * db);
    }

    static fillInternalHoles(mask, w, h) {
        const total = w * h;
        const outside = new Uint8Array(total);
        const queue = new Int32Array(total);
        let head = 0;
        let tail = 0;

        const tryPush = (idx) => {
            if (mask[idx] === 0 && outside[idx] === 0) {
                outside[idx] = 1;
                queue[tail++] = idx;
            }
        };

        for (let x = 0; x < w; x++) {
            tryPush(x);
            tryPush((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
            tryPush(y * w);
            tryPush(y * w + (w - 1));
        }

        while (head < tail) {
            const cur = queue[head++];
            const x = cur % w;
            const y = (cur - x) / w;
            if (x > 0) tryPush(cur - 1);
            if (x < w - 1) tryPush(cur + 1);
            if (y > 0) tryPush(cur - w);
            if (y < h - 1) tryPush(cur + w);
        }

        for (let i = 0; i < total; i++) {
            if (mask[i] === 0 && outside[i] === 0) {
                mask[i] = 1;
            }
        }
    }

    static majorityFilter3x3(mask, w, h) {
        const out = new Uint8Array(mask);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        sum += mask[(y + dy) * w + (x + dx)];
                    }
                }
                out[y * w + x] = sum >= 5 ? 1 : 0;
            }
        }
        return out;
    }

    static computeBorderClusters(lab, w, h) {
        const borderThickness = Math.max(2, Math.round(Math.min(w, h) * 0.05));
        const samples = [];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (
                    x < borderThickness ||
                    x >= w - borderThickness ||
                    y < borderThickness ||
                    y >= h - borderThickness
                ) {
                    if ((x + y) % 2 === 0) {
                        const o = (y * w + x) * 3;
                        samples.push([lab[o], lab[o + 1], lab[o + 2]]);
                    }
                }
            }
        }
        if (samples.length === 0) return [[50, 0, 0]];

        const k = Math.min(4, samples.length);
        const centroids = [];
        for (let i = 0; i < k; i++) {
            const idx = Math.floor((i * samples.length) / k);
            centroids.push([...samples[idx]]);
        }

        for (let iter = 0; iter < 6; iter++) {
            const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
            for (const s of samples) {
                let bestIdx = 0;
                let bestDist = Infinity;
                for (let c = 0; c < k; c++) {
                    const d =
                        (s[0] - centroids[c][0]) ** 2 +
                        (s[1] - centroids[c][1]) ** 2 +
                        (s[2] - centroids[c][2]) ** 2;
                    if (d < bestDist) {
                        bestDist = d;
                        bestIdx = c;
                    }
                }
                sums[bestIdx][0] += s[0];
                sums[bestIdx][1] += s[1];
                sums[bestIdx][2] += s[2];
                sums[bestIdx][3] += 1;
            }
            for (let c = 0; c < k; c++) {
                if (sums[c][3] > 0) {
                    centroids[c][0] = sums[c][0] / sums[c][3];
                    centroids[c][1] = sums[c][1] / sums[c][3];
                    centroids[c][2] = sums[c][2] / sums[c][3];
                }
            }
        }
        return centroids;
    }

    static minClusterDist(lab, idx, clusters) {
        let best = Infinity;
        for (let c = 0; c < clusters.length; c++) {
            const d = AutoDetector.labDistToColor(lab, idx, clusters[c]);
            if (d < best) best = d;
        }
        return best;
    }

    static filterMainForegroundComponents(mask, w, h) {
        const total = w * h;
        const labels = new Int32Array(total);
        const queue = new Int32Array(total);
        const components = [];
        const cx = w / 2;
        const cy = h / 2;
        const maxDist = Math.hypot(cx, cy) || 1;
        let currentLabel = 0;

        for (let i = 0; i < total; i++) {
            if (mask[i] !== 1 || labels[i] !== 0) continue;
            currentLabel++;
            let head = 0;
            let tail = 0;
            labels[i] = currentLabel;
            queue[tail++] = i;

            let area = 0;
            let sumX = 0;
            let sumY = 0;
            while (head < tail) {
                const cur = queue[head++];
                const x = cur % w;
                const y = (cur - x) / w;
                area++;
                sumX += x;
                sumY += y;

                const neighbors = [];
                if (x > 0) neighbors.push(cur - 1);
                if (x < w - 1) neighbors.push(cur + 1);
                if (y > 0) neighbors.push(cur - w);
                if (y < h - 1) neighbors.push(cur + w);

                for (const nb of neighbors) {
                    if (mask[nb] === 1 && labels[nb] === 0) {
                        labels[nb] = currentLabel;
                        queue[tail++] = nb;
                    }
                }
            }

            const meanX = sumX / area;
            const meanY = sumY / area;
            const centerProximity = 1 - Math.min(1, Math.hypot(meanX - cx, meanY - cy) / maxDist);
            const score = area * (0.3 + 0.7 * centerProximity);
            components.push({ label: currentLabel, area, score, centerProximity });
        }

        if (components.length === 0) return mask;
        components.sort((a, b) => b.score - a.score);

        const best = components[0];
        const keep = new Set([best.label]);
        for (let i = 1; i < components.length; i++) {
            const comp = components[i];
            if (comp.area >= total * 0.015 && comp.score >= best.score * 0.25) {
                keep.add(comp.label);
            }
        }

        const out = new Uint8Array(total);
        for (let i = 0; i < total; i++) {
            if (keep.has(labels[i])) out[i] = 1;
        }
        return out;
    }

    static segmentBySeeds(lab, edges, w, h, seedPoints, excludePoints, sensitivity, scaleX, scaleY) {
        const total = w * h;
        const mask = new Uint8Array(total);
        const visited = new Uint8Array(total);
        const seedSource = new Int16Array(total).fill(-1);

        const sampleColor = (px, py) => {
            const gx = Math.min(w - 1, Math.max(0, Math.round(px / scaleX)));
            const gy = Math.min(h - 1, Math.max(0, Math.round(py / scaleY)));
            let sL = 0, sa = 0, sb = 0, cnt = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = Math.min(w - 1, Math.max(0, gx + dx));
                    const ny = Math.min(h - 1, Math.max(0, gy + dy));
                    const o = (ny * w + nx) * 3;
                    sL += lab[o];
                    sa += lab[o + 1];
                    sb += lab[o + 2];
                    cnt++;
                }
            }
            return { gx, gy, color: [sL / cnt, sa / cnt, sb / cnt] };
        };

        const seeds = seedPoints.map((p) => sampleColor(p.x, p.y));
        const excludes = (excludePoints || []).map((p) => sampleColor(p.x, p.y));

        const distThreshold = 12 + sensitivity * 0.55;
        const stepThreshold = 10 + sensitivity * 0.35;
        const queue = new Int32Array(total);
        let head = 0;
        let tail = 0;

        seeds.forEach((s, sIdx) => {
            const idx = s.gy * w + s.gx;
            if (!visited[idx]) {
                visited[idx] = 1;
                mask[idx] = 1;
                seedSource[idx] = sIdx;
                queue[tail++] = idx;
            }
        });

        while (head < tail) {
            const cur = queue[head++];
            const sIdx = seedSource[cur];
            const seedCol = seeds[sIdx].color;
            const x = cur % w;
            const y = (cur - x) / w;

            const neighbors = [];
            if (x > 0) neighbors.push(cur - 1);
            if (x < w - 1) neighbors.push(cur + 1);
            if (y > 0) neighbors.push(cur - w);
            if (y < h - 1) neighbors.push(cur + w);

            for (const nb of neighbors) {
                if (visited[nb]) continue;

                const dSeed = AutoDetector.labDistToColor(lab, nb, seedCol);
                if (dSeed > distThreshold) continue;

                const stepDist = AutoDetector.labDist(lab, cur, nb);
                if (stepDist + edges[nb] * 0.45 > stepThreshold) continue;

                let blockedByExclude = false;
                for (let eIdx = 0; eIdx < excludes.length; eIdx++) {
                    const dExcl = AutoDetector.labDistToColor(lab, nb, excludes[eIdx].color);
                    if (dExcl + 4 < dSeed) {
                        blockedByExclude = true;
                        break;
                    }
                }
                if (blockedByExclude) continue;

                visited[nb] = 1;
                mask[nb] = 1;
                seedSource[nb] = sIdx;
                queue[tail++] = nb;
            }
        }

        AutoDetector.fillInternalHoles(mask, w, h);
        return AutoDetector.majorityFilter3x3(mask, w, h);
    }

    static segmentAuto(lab, edges, w, h, sensitivity) {
        const total = w * h;
        const clusters = AutoDetector.computeBorderClusters(lab, w, h);
        const bgVisited = new Uint8Array(total);
        const queue = new Int32Array(total);
        let head = 0;
        let tail = 0;

        const bgClusterThresh = 10 + sensitivity * 0.48;
        const edgeBarrier = 18 + (100 - sensitivity) * 0.35;

        const pushEdge = (idx) => {
            if (bgVisited[idx]) return;
            const dCluster = AutoDetector.minClusterDist(lab, idx, clusters);
            if (dCluster <= bgClusterThresh * 1.15) {
                bgVisited[idx] = 1;
                queue[tail++] = idx;
            }
        };

        for (let x = 0; x < w; x++) {
            pushEdge(x);
            pushEdge((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
            pushEdge(y * w);
            pushEdge(y * w + (w - 1));
        }

        while (head < tail) {
            const cur = queue[head++];
            const x = cur % w;
            const y = (cur - x) / w;

            const neighbors = [];
            if (x > 0) neighbors.push(cur - 1);
            if (x < w - 1) neighbors.push(cur + 1);
            if (y > 0) neighbors.push(cur - w);
            if (y < h - 1) neighbors.push(cur + w);

            for (const nb of neighbors) {
                if (bgVisited[nb]) continue;
                const dCluster = AutoDetector.minClusterDist(lab, nb, clusters);
                if (dCluster > bgClusterThresh) continue;

                const stepDist = AutoDetector.labDist(lab, cur, nb);
                if (stepDist + edges[nb] * 0.5 > edgeBarrier) continue;

                bgVisited[nb] = 1;
                queue[tail++] = nb;
            }
        }

        let fgMask = new Uint8Array(total);
        let fgCount = 0;
        for (let i = 0; i < total; i++) {
            if (!bgVisited[i]) {
                fgMask[i] = 1;
                fgCount++;
            }
        }

        fgMask = AutoDetector.filterMainForegroundComponents(fgMask, w, h);
        AutoDetector.fillInternalHoles(fgMask, w, h);
        fgMask = AutoDetector.majorityFilter3x3(fgMask, w, h);

        fgCount = 0;
        for (let i = 0; i < total; i++) fgCount += fgMask[i];
        const ratio = fgCount / total;

        // Fallback: Center-Surround Saliency if border flood-fill under/over-segmented
        if (ratio < 0.03 || ratio > 0.88) {
            const salMask = new Uint8Array(total);
            const cx = w / 2;
            const cy = h / 2;
            const salThreshold = 0.45 - (sensitivity - 50) * 0.003;

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    const dCluster = AutoDetector.minClusterDist(lab, idx, clusters);
                    const colorSal = Math.min(1, dCluster / 45);
                    const nx = (x - cx) / (w * 0.45);
                    const ny = (y - cy) / (h * 0.45);
                    const centerPrior = Math.exp(-0.5 * (nx * nx + ny * ny));
                    const score = colorSal * 0.65 + centerPrior * 0.35;
                    if (score >= salThreshold) {
                        salMask[idx] = 1;
                    }
                }
            }
            let cleaned = AutoDetector.filterMainForegroundComponents(salMask, w, h);
            AutoDetector.fillInternalHoles(cleaned, w, h);
            return AutoDetector.majorityFilter3x3(cleaned, w, h);
        }

        return fgMask;
    }

    static segmentSubject(canvas, options = {}) {
        const { seedPoints = null, excludePoints = null, sensitivity = 50 } = options;
        const { width: w, height: h, data, scaleX, scaleY } = AutoDetector.downsampleCanvas(canvas, 240);
        const { lab, edges } = AutoDetector.computeLabAndEdges(data, w, h);

        let mask;
        if (seedPoints && seedPoints.length > 0) {
            mask = AutoDetector.segmentBySeeds(lab, edges, w, h, seedPoints, excludePoints, sensitivity, scaleX, scaleY);
        } else {
            mask = AutoDetector.segmentAuto(lab, edges, w, h, sensitivity);
        }

        return { mask, width: w, height: h };
    }

    static computeIoU(a, b) {
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const x2 = Math.min(a.x + a.width, b.x + b.width);
        const y2 = Math.min(a.y + a.height, b.y + b.height);
        const interW = Math.max(0, x2 - x1);
        const interH = Math.max(0, y2 - y1);
        const inter = interW * interH;
        if (inter === 0) return 0;
        const union = a.width * a.height + b.width * b.height - inter;
        return union > 0 ? inter / union : 0;
    }

    static async detectCandidates(canvas) {
        const rawBoxes = [];

        // 1. Native Browser Shape Detection APIs if available
        if (typeof window.FaceDetector === 'function') {
            try {
                const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
                const faces = await detector.detect(canvas);
                for (const f of faces) {
                    const b = f.boundingBox;
                    if (b && b.width > 12 && b.height > 12) {
                        rawBoxes.push({
                            x: b.x,
                            y: b.y,
                            width: b.width,
                            height: b.height,
                            type: 'face',
                            label: '👤 顔',
                            priority: 3
                        });
                    }
                }
            } catch {
                // Ignore unsupported runtime errors
            }
        }

        if (typeof window.BarcodeDetector === 'function') {
            try {
                const detector = new window.BarcodeDetector();
                const codes = await detector.detect(canvas);
                for (const c of codes) {
                    const b = c.boundingBox;
                    if (b && b.width > 10 && b.height > 10) {
                        rawBoxes.push({
                            x: b.x,
                            y: b.y,
                            width: b.width,
                            height: b.height,
                            type: 'barcode',
                            label: '📊 バーコード',
                            priority: 3
                        });
                    }
                }
            } catch {
                // Ignore unsupported runtime errors
            }
        }

        if (typeof window.TextDetector === 'function') {
            try {
                const detector = new window.TextDetector();
                const texts = await detector.detect(canvas);
                for (const t of texts) {
                    const b = t.boundingBox;
                    if (b && b.width > 16 && b.height > 8) {
                        rawBoxes.push({
                            x: b.x,
                            y: b.y,
                            width: b.width,
                            height: b.height,
                            type: 'text',
                            label: '🏷️ 文字',
                            priority: 3
                        });
                    }
                }
            } catch {
                // Ignore unsupported runtime errors
            }
        }

        // 2. Built-in Canvas CV fallback / supplement
        const { width: w, height: h, data, scaleX, scaleY } = AutoDetector.downsampleCanvas(canvas, 320);
        const lum = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) {
            const p = i * 4;
            lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }

        const cellSize = 8;
        const gw = Math.ceil(w / cellSize);
        const gh = Math.ceil(h / cellSize);
        const textGrid = new Uint8Array(gw * gh);
        const barcodeScoreGrid = new Float32Array(gw * gh);
        const skinGrid = new Uint8Array(gw * gh);

        for (let cy = 0; cy < gh; cy++) {
            for (let cx = 0; cx < gw; cx++) {
                const xStart = cx * cellSize;
                const yStart = cy * cellSize;
                const xEnd = Math.min(w - 1, xStart + cellSize);
                const yEnd = Math.min(h - 1, yStart + cellSize);

                let strongHx = 0;
                let strongVy = 0;
                let skinCount = 0;
                let pxCount = 0;

                for (let y = Math.max(1, yStart); y < yEnd; y++) {
                    for (let x = Math.max(1, xStart); x < xEnd; x++) {
                        const idx = y * w + x;
                        const hx = Math.abs(lum[idx + 1] - lum[idx - 1]);
                        const vy = Math.abs(lum[idx + w] - lum[idx - w]);
                        if (hx > 36) strongHx++;
                        if (vy > 36) strongVy++;

                        const p = idx * 4;
                        const r = data[p], g = data[p + 1], b = data[p + 2];
                        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
                        if (
                            r > 95 && g > 40 && b > 20 &&
                            r > g && r > b && Math.abs(r - g) > 15 &&
                            cr >= 135 && cr <= 180 && cb >= 85 && cb <= 135
                        ) {
                            skinCount++;
                        }
                        pxCount++;
                    }
                }

                if (pxCount > 0) {
                    const edgeRatio = strongHx / pxCount;
                    const gIdx = cy * gw + cx;
                    if (edgeRatio >= 0.24) {
                        textGrid[gIdx] = 1;
                        barcodeScoreGrid[gIdx] = strongHx / (strongVy + 1);
                    }
                    if (skinCount / pxCount >= 0.4) {
                        skinGrid[gIdx] = 1;
                    }
                }
            }
        }

        // Horizontal dilation (radius 1) on text cells to merge characters/bars into lines
        const dilatedText = new Uint8Array(textGrid);
        for (let cy = 0; cy < gh; cy++) {
            for (let cx = 0; cx < gw; cx++) {
                if (textGrid[cy * gw + cx]) {
                    if (cx > 0) dilatedText[cy * gw + cx - 1] = 1;
                    if (cx < gw - 1) dilatedText[cy * gw + cx + 1] = 1;
                }
            }
        }

        const extractGridBoxes = (grid, minCells, maxAreaRatio, minAspect, maxAspect, classifyFn) => {
            const visited = new Uint8Array(gw * gh);
            const q = new Int32Array(gw * gh);
            const results = [];

            for (let i = 0; i < gw * gh; i++) {
                if (!grid[i] || visited[i]) continue;
                let head = 0, tail = 0;
                visited[i] = 1;
                q[tail++] = i;

                let minX = gw, maxX = 0, minY = gh, maxY = 0;
                let count = 0;
                let scoreSum = 0;

                while (head < tail) {
                    const cur = q[head++];
                    const gx = cur % gw;
                    const gy = (cur - gx) / gw;
                    count++;
                    scoreSum += barcodeScoreGrid[cur];
                    if (gx < minX) minX = gx;
                    if (gx > maxX) maxX = gx;
                    if (gy < minY) minY = gy;
                    if (gy > maxY) maxY = gy;

                    const nbs = [];
                    if (gx > 0) nbs.push(cur - 1);
                    if (gx < gw - 1) nbs.push(cur + 1);
                    if (gy > 0) nbs.push(cur - gw);
                    if (gy < gh - 1) nbs.push(cur + gw);
                    for (const nb of nbs) {
                        if (grid[nb] && !visited[nb]) {
                            visited[nb] = 1;
                            q[tail++] = nb;
                        }
                    }
                }

                if (count < minCells) continue;
                const bw = (maxX - minX + 1) * cellSize * scaleX;
                const bh = (maxY - minY + 1) * cellSize * scaleY;
                const areaRatio = (bw * bh) / (canvas.width * canvas.height);
                const aspect = bw / (bh || 1);

                if (areaRatio > maxAreaRatio || aspect < minAspect || aspect > maxAspect) continue;

                const padX = Math.max(6, bw * 0.08);
                const padY = Math.max(4, bh * 0.12);
                const bx = Math.max(0, minX * cellSize * scaleX - padX);
                const by = Math.max(0, minY * cellSize * scaleY - padY);
                const clampedW = Math.min(canvas.width - bx, bw + padX * 2);
                const clampedH = Math.min(canvas.height - by, bh + padY * 2);

                const cls = classifyFn(scoreSum / count, aspect);
                results.push({
                    x: Math.round(bx),
                    y: Math.round(by),
                    width: Math.round(clampedW),
                    height: Math.round(clampedH),
                    type: cls.type,
                    label: cls.label,
                    priority: cls.priority
                });
            }
            return results;
        };

        const textBoxes = extractGridBoxes(
            dilatedText,
            3,
            0.35,
            0.4,
            18,
            (avgBarcodeRatio) =>
                avgBarcodeRatio > 2.4
                    ? { type: 'barcode', label: '📊 バーコード・番号', priority: 2 }
                    : { type: 'text', label: '🏷️ 文字・ラベル', priority: 1 }
        );

        const skinBoxes = extractGridBoxes(
            skinGrid,
            4,
            0.25,
            0.4,
            2.2,
            () => ({ type: 'face', label: '👤 顔・肌', priority: 1 })
        );

        rawBoxes.push(...textBoxes, ...skinBoxes);

        // Deduplicate by priority then area
        rawBoxes.sort((a, b) => (b.priority - a.priority) || (b.width * b.height - a.width * a.height));
        const finalBoxes = [];
        for (const box of rawBoxes) {
            if (box.width < 16 || box.height < 12) continue;
            const overlaps = finalBoxes.some((kept) => AutoDetector.computeIoU(box, kept) > 0.35);
            if (!overlaps) {
                finalBoxes.push({
                    id: finalBoxes.length + 1,
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                    type: box.type,
                    label: box.label
                });
            }
            if (finalBoxes.length >= 12) break;
        }

        return finalBoxes;
    }
}
