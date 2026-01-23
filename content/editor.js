class Editor {
    constructor(targetImage) {
        this.targetImage = targetImage;
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
        this.history = [];
        this.historyIndex = -1;
        this.isDrawing = false;
        this.mode = 'mosaic';
        this.brushSize = 50;
        this.brushSizePresets = { small: 20, medium: 50, large: 100 };
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionRect = null;
        this.selectionBoxEl = null;
        this.isPolySelecting = false;
        this.polyPoints = [];
        this.polyHoverPoint = null;
        this.selectionSvg = null;
        this.selectionPolyline = null;
        this.selectionPolygon = null;
        this.selectionPointsGroup = null;
        this.selectionSnapLine = null;
        this.selectionCloseHint = null;
        this.polyHelpTooltip = null;
        this.selectionActionsEl = null;
        this.pendingSelection = null;
        this.container = null;
        this.toolbar = null;
        this.actionsBar = null;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.updateLayoutMetrics = this.updateLayoutMetrics.bind(this);
    }

    async init() {
        this.createOverlay();
        await this.setupCanvas();
        this.createToolbar();
        this.attachEvents();
        this.setMode('mosaic'); // Default mode
        this.updateBrushUI();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'gphoto-editor-overlay';

        const container = document.createElement('div');
        container.id = 'gphoto-editor-canvas-container';
        this.container = container;

        this.canvas = document.createElement('canvas');
        container.appendChild(this.canvas);

        this.selectionBoxEl = document.createElement('div');
        this.selectionBoxEl.className = 'selection-box';
        container.appendChild(this.selectionBoxEl);

        this.selectionSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.selectionSvg.classList.add('selection-svg');
        this.selectionPolyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        this.selectionPolyline.classList.add('selection-polyline');
        this.selectionPolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        this.selectionPolygon.classList.add('selection-polygon');
        this.selectionPointsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.selectionPointsGroup.classList.add('selection-points');
        this.selectionSnapLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.selectionSnapLine.classList.add('selection-snap-line');
        this.selectionSnapLine.style.display = 'none';
        this.selectionSvg.appendChild(this.selectionPolygon);
        this.selectionSvg.appendChild(this.selectionPolyline);
        this.selectionSvg.appendChild(this.selectionSnapLine);
        this.selectionSvg.appendChild(this.selectionPointsGroup);
        container.appendChild(this.selectionSvg);

        // 閉じるヒント要素
        this.selectionCloseHint = document.createElement('div');
        this.selectionCloseHint.className = 'selection-close-hint';
        this.selectionCloseHint.textContent = 'クリックで閉じる';
        container.appendChild(this.selectionCloseHint);

        this.overlay.appendChild(container);
        document.body.appendChild(this.overlay);

        // Brush cursor
        this.brushCursor = document.createElement('div');
        this.brushCursor.className = 'brush-preview';
        document.body.appendChild(this.brushCursor);
    }

    async setupCanvas() {
        const src = this.targetImage.src;
        // Basic check for data URL or valid URL
        if (!src) {
            alert('画像のURLが取得できませんでした。');
            this.close();
            return;
        }

        try {
            // Attempt to fetch with CORS mode 'cors' first if possible, 
            // but for Google Photos we often need to rely on 'no-cors' -> opaque -> tainted canvas.
            // Wait, tainted canvas cannot be read (getImageData fails). 
            // Extension host permissions should allow us to fetch via XHR/fetch and get a clean blob.
            
            const response = await fetch(src, { credentials: 'include' });
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);

            this.canvas.width = bitmap.width;
            this.canvas.height = bitmap.height;

            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            this.ctx.drawImage(bitmap, 0, 0);

            this.saveState(); 
        } catch (e) {
            console.error('Failed to load image:', e);
            alert('画像の読み込みに失敗しました。');
            this.close();
        }
    }

    createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.id = 'gphoto-editor-toolbar';
        this.toolbar = toolbar;

        toolbar.innerHTML = `
      <div class="gphoto-editor-group">
        <button id="btn-mosaic" class="gphoto-editor-btn" title="モザイク (M)">モザイク</button>
        <button id="btn-blur" class="gphoto-editor-btn" title="ぼかし (B)">ぼかし</button>
        <button id="btn-select-mosaic" class="gphoto-editor-btn" title="矩形・範囲内モザイク (I)">矩形内モザイク</button>
        <button id="btn-select-mosaic-inv" class="gphoto-editor-btn" title="矩形・範囲外モザイク (O)">矩形外モザイク</button>
        <button id="btn-poly-mosaic" class="gphoto-editor-btn" title="多角形・範囲内モザイク (P)">多角形内モザイク</button>
        <button id="btn-poly-mosaic-inv" class="gphoto-editor-btn" title="多角形・範囲外モザイク (Shift+P)">多角形外モザイク</button>
        
        <span class="brush-settings">
            <span class="divider"></span>
            <span>ブラシサイズ:</span>
            <input type="range" id="brush-slider" min="10" max="200" value="50" title="ブラシサイズ (1/2/3)">
            <span id="brush-size-val">50px</span>
        </span>
      </div>
      
      <div class="gphoto-editor-group">
        <button id="btn-undo" class="gphoto-editor-btn" title="元に戻す (Ctrl+Z)">元に戻す</button>
        <button id="btn-redo" class="gphoto-editor-btn" title="やり直し (Ctrl+Y)">やり直し</button>
      </div>
    `;

        this.overlay.appendChild(toolbar);

        const actions = document.createElement('div');
        actions.id = 'gphoto-editor-actions';
        this.actionsBar = actions;
        actions.innerHTML = `
      <div class="gphoto-editor-group">
        <button id="btn-cancel" class="gphoto-editor-btn" title="キャンセル (Esc)">キャンセル</button>
      </div>
      <div class="gphoto-editor-group">
        <label class="download-format" title="ダウンロード形式">
          <span>形式:</span>
          <select id="download-format">
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
        <button id="btn-download" class="gphoto-editor-btn primary" title="ダウンロード (Ctrl+S)">ダウンロード</button>
      </div>
    `;

        this.overlay.appendChild(actions);
        this.updateLayoutMetrics();

        // Events
        document.getElementById('btn-mosaic').onclick = () => this.setMode('mosaic');
        document.getElementById('btn-blur').onclick = () => this.setMode('blur');
        document.getElementById('btn-select-mosaic').onclick = () => this.setMode('select-mosaic');
        document.getElementById('btn-select-mosaic-inv').onclick = () => this.setMode('select-mosaic-inv');
        document.getElementById('btn-poly-mosaic').onclick = () => this.setMode('select-poly-mosaic');
        document.getElementById('btn-poly-mosaic-inv').onclick = () => this.setMode('select-poly-mosaic-inv');

        const slider = document.getElementById('brush-slider');
        slider.oninput = (e) => {
            this.setBrushSize(parseInt(e.target.value));
        };

        document.getElementById('btn-undo').onclick = () => this.undo();
        document.getElementById('btn-redo').onclick = () => this.redo();
        document.getElementById('btn-cancel').onclick = () => this.requestClose();
        document.getElementById('btn-download').onclick = () => this.download();
    }

    setMode(mode) {
        this.mode = mode;
        const isSelect = mode.startsWith('select');
        const isPoly = mode.startsWith('select-poly');

        if (this.pendingSelection) {
            this.clearPendingSelection();
        }
        
        // Update UI buttons
        document.getElementById('btn-mosaic').classList.toggle('active', mode === 'mosaic');
        document.getElementById('btn-blur').classList.toggle('active', mode === 'blur');
        document.getElementById('btn-select-mosaic').classList.toggle('active', mode === 'select-mosaic');
        document.getElementById('btn-select-mosaic-inv').classList.toggle('active', mode === 'select-mosaic-inv');
        document.getElementById('btn-poly-mosaic').classList.toggle('active', mode === 'select-poly-mosaic');
        document.getElementById('btn-poly-mosaic-inv').classList.toggle('active', mode === 'select-poly-mosaic-inv');

        // Cursor style
        this.canvas.style.cursor = isSelect ? 'crosshair' : 'none';
        this.brushCursor.style.display = 'none';
        if (!isSelect) {
            this.clearSelectionUI();
            this.clearPolygonUI();
            this.hidePolyHelpTooltip();
        } else if (isPoly) {
            this.showPolyHelpTooltip();
            this.clearSelectionUI();
        } else {
            this.clearPolygonUI();
            this.hidePolyHelpTooltip();
        }
        this.updateCursorSize();
    }

    updateLayoutMetrics() {
        if (!this.container || !this.toolbar || !this.actionsBar) return;
        const top = this.toolbar.getBoundingClientRect().height || 60;
        const bottom = this.actionsBar.getBoundingClientRect().height || 60;
        this.container.style.marginTop = `${top}px`;
        this.container.style.marginBottom = `${bottom}px`;
        this.container.style.maxHeight = `calc(100vh - ${top + bottom}px)`;
    }

    attachEvents() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('dblclick', this.handleDoubleClick);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        window.addEventListener('resize', this.updateLayoutMetrics);
        document.addEventListener('keydown', this.handleKeyDown);
    }

    detachEvents() {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        window.removeEventListener('resize', this.updateLayoutMetrics);
        document.removeEventListener('keydown', this.handleKeyDown);
    }

    updateCursorSize() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        // Visual size depends on zoom level
        const scale = rect.width / this.canvas.width;
        const visualSize = this.brushSize * scale;

        this.brushCursor.style.width = visualSize + 'px';
        this.brushCursor.style.height = visualSize + 'px';
    }

    setBrushSize(size) {
        const clamped = Math.min(200, Math.max(10, Math.round(size)));
        this.brushSize = clamped;
        this.updateBrushUI();
    }

    updateBrushUI() {
        const slider = document.getElementById('brush-slider');
        const label = document.getElementById('brush-size-val');
        if (slider) slider.value = String(this.brushSize);
        if (label) label.textContent = `${this.brushSize}px`;
        this.updateCursorSize();
    }

    getBlurIntensity() {
        const intensity = Math.round(this.brushSize / 15);
        return Math.min(20, Math.max(2, intensity));
    }

    handleMouseMove(e) {
        if (this.mode.startsWith('select-poly')) {
            this.handlePolygonMove(e);
        } else if (this.mode.startsWith('select')) {
            this.handleSelectionMove(e);
        } else {
            this.handleBrushMove(e);
        }
    }

    handleMouseDown(e) {
        if (e.target !== this.canvas) return;
        if (e.button !== 0) return;

        if (this.mode.startsWith('select-poly')) {
            this.handlePolygonClick(e);
        } else if (this.mode.startsWith('select')) {
            this.handleSelectionDown(e);
        } else {
            this.isDrawing = true;
            this.processEffect(e);
        }
    }

    handleMouseUp(e) {
        if (this.mode.startsWith('select-poly')) {
            return;
        }

        if (this.mode.startsWith('select')) {
            this.handleSelectionUp(e);
        } else {
            if (this.isDrawing) {
                this.saveState();
            }
            this.isDrawing = false;
        }
    }

    // --- Brush Logic ---

    handleBrushMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const inCanvas = e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;

        if (!inCanvas && !this.isDrawing) {
            this.brushCursor.style.display = 'none';
            return;
        }

        this.brushCursor.style.display = 'block';
        this.brushCursor.style.left = e.clientX + 'px';
        this.brushCursor.style.top = e.clientY + 'px';
        this.updateCursorSize();

        if (!this.isDrawing) return;
        this.processEffect(e);
    }

    processEffect(e) {
        const { x, y } = this.getCanvasCoordinates(e);

        if (this.mode === 'mosaic') {
            const blockSize = Math.max(10, Math.round(this.brushSize / 2));
            ImageProcessor.applyMosaic(this.ctx, x, y, this.brushSize, blockSize);
        } else if (this.mode === 'blur') {
            ImageProcessor.applyBlur(this.ctx, x, y, this.brushSize, this.getBlurIntensity());
        }
    }

    // --- Selection Logic ---

    handleSelectionDown(e) {
        if (this.pendingSelection) {
            this.clearPendingSelection();
        }
        this.clearPolygonUI();
        this.clearSelectionUI();
        this.isSelecting = true;
        const coords = this.getCanvasCoordinates(e);
        this.selectionStart = coords;
        this.updateSelectionBox(coords.x, coords.y, 0, 0);
        this.selectionBoxEl.style.display = 'block';
    }

    handleSelectionMove(e) {
        if (!this.isSelecting) return;

        const current = this.getCanvasCoordinates(e);
        const x = Math.min(this.selectionStart.x, current.x);
        const y = Math.min(this.selectionStart.y, current.y);
        const width = Math.abs(current.x - this.selectionStart.x);
        const height = Math.abs(current.y - this.selectionStart.y);

        this.updateSelectionBox(x, y, width, height);
    }

    handleSelectionUp(e) {
        if (!this.isSelecting) return;
        this.isSelecting = false;

        if (this.selectionRect && this.selectionRect.width > 5 && this.selectionRect.height > 5) {
            this.setPendingSelection('rect', { rect: { ...this.selectionRect } });
        } else {
            this.selectionBoxEl.style.display = 'none';
        }
    }

    updateSelectionBox(x, y, w, h) {
        this.selectionRect = { x, y, width: w, height: h };

        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;

        this.selectionBoxEl.style.left = (x * scaleX) + 'px';
        this.selectionBoxEl.style.top = (y * scaleY) + 'px';
        this.selectionBoxEl.style.width = (w * scaleX) + 'px';
        this.selectionBoxEl.style.height = (h * scaleY) + 'px';
    }

    clearSelectionUI() {
        if (this.selectionBoxEl) {
            this.selectionBoxEl.style.display = 'none';
            this.selectionBoxEl.style.width = '0px';
            this.selectionBoxEl.style.height = '0px';
        }
        this.isSelecting = false;
        this.selectionRect = null;
    }

    handlePolygonMove(e) {
        if (!this.isPolySelecting) return;
        const coords = this.getCanvasCoordinates(e);
        this.polyHoverPoint = coords;
        
        // 始点へのホバー検出
        const nearFirst = this.isNearFirstPoint(coords) && this.polyPoints.length >= 3;
        this.updateStartPointHover(nearFirst);
        this.updateCloseHint(nearFirst, e);
        this.updateSnapLine(nearFirst, coords);
        
        this.updatePolygonUI();
        this.updatePolyHelpTooltip();
    }

    handlePolygonClick(e) {
        if (this.pendingSelection) {
            this.clearPendingSelection();
        }
        const coords = this.getCanvasCoordinates(e);
        if (!this.isPolySelecting) {
            this.clearSelectionUI();
            this.isPolySelecting = true;
            this.polyPoints = [coords];
            this.polyHoverPoint = null;
            this.updatePolygonUI();
            return;
        }

        if (this.isNearFirstPoint(coords) && this.polyPoints.length >= 3) {
            this.finalizePolygonSelection();
            return;
        }

        this.polyPoints.push(coords);
        this.updatePolygonUI();
    }

    handleDoubleClick(e) {
        if (!this.mode.startsWith('select-poly')) return;
        if (this.polyPoints.length >= 3) {
            this.finalizePolygonSelection();
        }
    }

    isNearFirstPoint(coords) {
        if (this.polyPoints.length === 0) return false;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0) return false;
        const threshold = 8 * (this.canvas.width / rect.width);
        const dx = coords.x - this.polyPoints[0].x;
        const dy = coords.y - this.polyPoints[0].y;
        return Math.sqrt(dx * dx + dy * dy) <= threshold;
    }

    updateStartPointHover(isHovering) {
        const startPoint = this.selectionPointsGroup?.querySelector('.selection-point-start');
        if (startPoint) {
            startPoint.classList.toggle('hovering', isHovering);
            this.canvas.style.cursor = isHovering ? 'pointer' : 'crosshair';
        }
    }

    updateCloseHint(show, e) {
        if (!this.selectionCloseHint) return;
        if (show) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = rect.width / this.canvas.width;
            const scaleY = rect.height / this.canvas.height;
            const x = this.polyPoints[0].x * scaleX;
            const y = this.polyPoints[0].y * scaleY;
            this.selectionCloseHint.style.left = x + 'px';
            this.selectionCloseHint.style.top = y + 'px';
            this.selectionCloseHint.classList.add('visible');
        } else {
            this.selectionCloseHint.classList.remove('visible');
        }
    }

    updateSnapLine(show, coords) {
        if (!this.selectionSnapLine) return;
        if (show && this.polyPoints.length >= 3) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = rect.width / this.canvas.width;
            const scaleY = rect.height / this.canvas.height;
            const lastPoint = this.polyPoints[this.polyPoints.length - 1];
            const firstPoint = this.polyPoints[0];
            
            this.selectionSnapLine.setAttribute('x1', String(lastPoint.x * scaleX));
            this.selectionSnapLine.setAttribute('y1', String(lastPoint.y * scaleY));
            this.selectionSnapLine.setAttribute('x2', String(firstPoint.x * scaleX));
            this.selectionSnapLine.setAttribute('y2', String(firstPoint.y * scaleY));
            this.selectionSnapLine.style.display = 'block';
        } else {
            this.selectionSnapLine.style.display = 'none';
        }
    }

    showPolyHelpTooltip() {
        if (this.polyHelpTooltip) return;
        this.polyHelpTooltip = document.createElement('div');
        this.polyHelpTooltip.className = 'poly-help-tooltip';
        this.updatePolyHelpTooltip();
        this.overlay.appendChild(this.polyHelpTooltip);
    }

    updatePolyHelpTooltip() {
        if (!this.polyHelpTooltip) return;
        const count = this.polyPoints.length;
        if (count === 0) {
            this.polyHelpTooltip.innerHTML = '<span class="highlight">クリック</span>で頂点を追加';
        } else if (count < 3) {
            const remaining = 3 - count;
            this.polyHelpTooltip.innerHTML = `あと<span class="highlight">${remaining}点</span>追加で閉じられます`;
        } else {
            this.polyHelpTooltip.innerHTML = '<span class="close-ready">始点をクリック</span>または<span class="highlight">ダブルクリック</span>で確定';
        }
    }

    hidePolyHelpTooltip() {
        if (this.polyHelpTooltip) {
            this.polyHelpTooltip.remove();
            this.polyHelpTooltip = null;
        }
    }

    finalizePolygonSelection() {
        if (this.polyPoints.length < 3) return;
        this.isPolySelecting = false;
        this.polyHoverPoint = null;
        this.hidePolyHelpTooltip();
        this.updateStartPointHover(false);
        if (this.selectionCloseHint) this.selectionCloseHint.classList.remove('visible');
        if (this.selectionSnapLine) this.selectionSnapLine.style.display = 'none';
        this.setPendingSelection('poly', { points: [...this.polyPoints] });
        this.updatePolygonUI();
    }

    setPendingSelection(kind, data) {
        this.pendingSelection = { kind, ...data };
        this.showSelectionActions();
    }

    clearPendingSelection() {
        this.pendingSelection = null;
        this.clearSelectionActions();
        this.clearSelectionUI();
        this.clearPolygonUI();
    }

    showSelectionActions() {
        if (this.selectionActionsEl) return;
        this.selectionActionsEl = document.createElement('div');
        this.selectionActionsEl.className = 'selection-actions';
        this.selectionActionsEl.innerHTML = `
      <button id="sel-apply-in" class="gphoto-editor-btn">範囲内モザイク</button>
      <button id="sel-apply-out" class="gphoto-editor-btn">範囲外モザイク</button>
      <button id="sel-apply-cancel" class="gphoto-editor-btn">キャンセル</button>
    `;
        this.overlay.appendChild(this.selectionActionsEl);

        document.getElementById('sel-apply-in').onclick = () => this.applyPendingSelection(false);
        document.getElementById('sel-apply-out').onclick = () => this.applyPendingSelection(true);
        document.getElementById('sel-apply-cancel').onclick = () => this.clearPendingSelection();
    }

    clearSelectionActions() {
        if (this.selectionActionsEl) {
            this.selectionActionsEl.remove();
            this.selectionActionsEl = null;
        }
    }

    applyPendingSelection(isInverse) {
        if (!this.pendingSelection) return;
        const blockSize = Math.max(10, Math.round(this.brushSize / 2));

        if (this.pendingSelection.kind === 'rect') {
            const rect = this.pendingSelection.rect;
            if (isInverse) {
                ImageProcessor.applyMosaicToRectInverse(this.ctx, rect, blockSize);
            } else {
                ImageProcessor.applyMosaicToRect(this.ctx, rect, blockSize);
            }
        } else if (this.pendingSelection.kind === 'poly') {
            const points = this.pendingSelection.points;
            if (isInverse) {
                ImageProcessor.applyMosaicToPolygonInverse(this.ctx, points, blockSize);
            } else {
                ImageProcessor.applyMosaicToPolygon(this.ctx, points, blockSize);
            }
        }

        this.saveState();
        this.clearPendingSelection();
    }

    updatePolygonUI() {
        if (!this.selectionSvg) return;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;
        const points = this.polyPoints.map((p) => `${p.x * scaleX},${p.y * scaleY}`);
        const polylinePoints = [...points];

        if (this.polyHoverPoint) {
            polylinePoints.push(`${this.polyHoverPoint.x * scaleX},${this.polyHoverPoint.y * scaleY}`);
        }

        this.selectionPolyline.setAttribute('points', polylinePoints.join(' '));
        this.selectionPolygon.setAttribute('points', points.join(' '));
        if (this.selectionPointsGroup) {
            while (this.selectionPointsGroup.firstChild) {
                this.selectionPointsGroup.removeChild(this.selectionPointsGroup.firstChild);
            }
            const canClose = this.polyPoints.length >= 3;
            this.polyPoints.forEach((p, idx) => {
                const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                c.setAttribute('cx', String(p.x * scaleX));
                c.setAttribute('cy', String(p.y * scaleY));
                // 始点は大きく、閉じられる状態ならさらに強調
                const radius = idx === 0 ? (canClose ? 8 : 6) : 4;
                c.setAttribute('r', String(radius));
                c.classList.add('selection-point');
                if (idx === 0) {
                    c.classList.add('selection-point-start');
                    if (canClose) c.classList.add('can-close');
                }
                this.selectionPointsGroup.appendChild(c);
            });
        }
        this.selectionSvg.style.display = this.polyPoints.length > 0 ? 'block' : 'none';
    }

    clearPolygonUI() {
        this.isPolySelecting = false;
        this.polyPoints = [];
        this.polyHoverPoint = null;
        if (this.selectionPolyline) this.selectionPolyline.setAttribute('points', '');
        if (this.selectionPolygon) this.selectionPolygon.setAttribute('points', '');
        if (this.selectionPointsGroup) {
            while (this.selectionPointsGroup.firstChild) {
                this.selectionPointsGroup.removeChild(this.selectionPointsGroup.firstChild);
            }
        }
        if (this.selectionSvg) this.selectionSvg.style.display = 'none';
        if (this.selectionSnapLine) this.selectionSnapLine.style.display = 'none';
        if (this.selectionCloseHint) this.selectionCloseHint.classList.remove('visible');
        this.hidePolyHelpTooltip();
    }

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        const isCmd = e.ctrlKey || e.metaKey;

        if (isCmd && key === 'z') {
            e.preventDefault();
            this.undo();
            return;
        }
        if (isCmd && (key === 'y' || (e.shiftKey && key === 'z'))) {
            e.preventDefault();
            this.redo();
            return;
        }
        if (isCmd && key === 's') {
            e.preventDefault();
            this.download();
            return;
        }

        const tagName = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        const isFormField = ['input', 'select', 'textarea'].includes(tagName);

        if (key === 'escape') {
            e.preventDefault();
            if (this.pendingSelection || this.isPolySelecting || this.isSelecting) {
                this.clearPendingSelection();
            } else {
                this.requestClose();
            }
            return;
        }

        if (isFormField) return;

        if (key === 'm') {
            this.setMode('mosaic');
        } else if (key === 'b') {
            this.setMode('blur');
        } else if (key === 'i') {
            this.setMode('select-mosaic');
        } else if (key === 'o') {
            this.setMode('select-mosaic-inv');
        } else if (key === 'p' && e.shiftKey) {
            this.setMode('select-poly-mosaic-inv');
        } else if (key === 'p') {
            this.setMode('select-poly-mosaic');
        } else if (key === '1') {
            this.setBrushSize(this.brushSizePresets.small);
        } else if (key === '2') {
            this.setBrushSize(this.brushSizePresets.medium);
        } else if (key === '3') {
            this.setBrushSize(this.brushSizePresets.large);
        }
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return { x: 0, y: 0 };
        }
        // Scale handles the difference between CSS pixels and Canvas Intrinsic pixels
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const rawX = (e.clientX - rect.left) * scaleX;
        const rawY = (e.clientY - rect.top) * scaleY;

        return {
            x: Math.min(Math.max(rawX, 0), this.canvas.width),
            y: Math.min(Math.max(rawY, 0), this.canvas.height)
        };
    }

    saveState() {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Limit history size
        if (this.history.length > 20) {
            this.history.shift();
            this.historyIndex--;
        }

        this.history.push(this.canvas.toDataURL());
        this.historyIndex++;
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }

    restoreState(dataUrl) {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
    }

    getBaseFilename() {
        let base = '';
        const alt = this.targetImage ? this.targetImage.getAttribute('alt') : '';
        if (alt && alt.trim() && alt.trim().toLowerCase() !== 'photo') {
            base = alt.trim();
        }

        if (!base && this.targetImage && this.targetImage.src) {
            try {
                const url = new URL(this.targetImage.src);
                const parts = url.pathname.split('/').filter(Boolean);
                const last = parts.length > 0 ? parts[parts.length - 1] : '';
                base = last.replace(/\.[^/.]+$/, '');
            } catch {
                base = '';
            }
        }

        if (!base) base = 'photo';

        const cleaned = base
            .replace(/[\\/:*?"<>|]+/g, '')
            .replace(/\s+/g, '_')
            .trim();

        return cleaned.length > 0 ? cleaned.slice(0, 80) : 'photo';
    }

    buildTimestamp() {
        const date = new Date();
        return date.getFullYear() +
            ('0' + (date.getMonth() + 1)).slice(-2) +
            ('0' + date.getDate()).slice(-2) + '_' +
            ('0' + date.getHours()).slice(-2) +
            ('0' + date.getMinutes()).slice(-2) +
            ('0' + date.getSeconds()).slice(-2);
    }

    download() {
        const formatEl = document.getElementById('download-format');
        const format = formatEl && formatEl.value === 'jpeg' ? 'jpeg' : 'png';
        const isJpeg = format === 'jpeg';
        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        let dataUrl = '';
        try {
            dataUrl = isJpeg ? this.canvas.toDataURL(mime, 0.9) : this.canvas.toDataURL(mime);
        } catch (e) {
            console.error('Download failed:', e);
            alert('ダウンロードに失敗しました。');
            return;
        }

        const base = this.getBaseFilename();
        const timestamp = this.buildTimestamp();
        const ext = isJpeg ? 'jpg' : 'png';
        const filename = `${base}_mosaic_${timestamp}.${ext}`;

        chrome.runtime.sendMessage({ action: 'DOWNLOAD_IMAGE', dataUrl, filename }, (response) => {
            if (chrome.runtime.lastError || (response && response.ok === false)) {
                alert('ダウンロードに失敗しました。');
            }
        });
    }

    hasEdits() {
        return this.historyIndex > 0;
    }

    requestClose() {
        if (this.hasEdits()) {
            const ok = confirm('編集内容を破棄して終了しますか？');
            if (!ok) return;
        }
        this.close();
    }

    close() {
        this.detachEvents();
        if (this.brushCursor) this.brushCursor.remove();
        if (this.overlay) this.overlay.remove();
        this.overlay = null;
        window.GPhotoEditor = null;
    }

    toggle(targetImage) {
        if (this.overlay) {
            this.requestClose();
        } else {
            this.targetImage = targetImage;
            this.init();
        }
    }
}
