class Editor {
    constructor(targetImage) {
        this.targetImage = targetImage;
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
        this.history = [];
        this.historyIndex = -1;
        this.isDrawing = false;
        this.lastDrawPoint = null;
        this.lastClientPos = { x: 0, y: 0 };

        this.effectType = 'mosaic'; // 'mosaic' | 'blur'
        this.tool = 'brush';        // 'brush' | 'rect-in' | 'rect-out' | 'poly-in' | 'poly-out'

        this.brushSize = 50;
        this.brushSizePresets = { small: 20, medium: 50, large: 100, xlarge: 160 };
        this.mosaicIntensity = 50; // 10-100
        this.blurIntensity = 50;   // 10-100

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

        this.container = null;
        this.toolbar = null;
        this.actionsBar = null;
        this.brushCursor = null;
        this.compareImgEl = null;
        this.compareBadgeEl = null;
        this.isComparing = false;
        this.toastEl = null;
        this.toastTimer = null;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleWindowBlur = this.handleWindowBlur.bind(this);
        this.updateLayoutMetrics = this.updateLayoutMetrics.bind(this);
    }

    async init() {
        this.createOverlay();
        await this.setupCanvas();
        if (!this.overlay) return;
        this.createToolbar();
        this.attachEvents();
        this.setEffectType('mosaic');
        this.setTool('brush');
        this.updateBrushUI();
        this.updateIntensityUI();
        this.updateHistoryButtons();
        if (typeof window.gphotoUpdateQuickLaunch === 'function') {
            window.gphotoUpdateQuickLaunch();
        }
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'gphoto-editor-overlay';

        const container = document.createElement('div');
        container.id = 'gphoto-editor-canvas-container';
        this.container = container;

        this.canvas = document.createElement('canvas');
        container.appendChild(this.canvas);

        this.compareImgEl = document.createElement('img');
        this.compareImgEl.className = 'compare-original-img';
        this.compareImgEl.alt = 'Original';
        container.appendChild(this.compareImgEl);

        this.compareBadgeEl = document.createElement('div');
        this.compareBadgeEl.className = 'compare-badge';
        this.compareBadgeEl.textContent = '元画像を表示中';
        container.appendChild(this.compareBadgeEl);

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

        this.selectionCloseHint = document.createElement('div');
        this.selectionCloseHint.className = 'selection-close-hint';
        this.selectionCloseHint.textContent = 'クリックで確定';
        container.appendChild(this.selectionCloseHint);

        this.overlay.appendChild(container);

        this.toastEl = document.createElement('div');
        this.toastEl.id = 'gphoto-editor-toast';
        this.overlay.appendChild(this.toastEl);

        document.body.appendChild(this.overlay);

        this.brushCursor = document.createElement('div');
        this.brushCursor.className = 'brush-preview';
        document.body.appendChild(this.brushCursor);
    }

    async setupCanvas() {
        const src = this.targetImage.src;
        if (!src) {
            alert('画像のURLが取得できませんでした。');
            this.close();
            return;
        }

        try {
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
      <div class="toolbar-row toolbar-tools">
        <div class="gphoto-editor-group tool-group">
          <span class="group-label">加工タイプ</span>
          <button id="btn-effect-mosaic" class="gphoto-editor-btn tool-btn" type="button" title="モザイク加工に切替 (M)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <rect x="3" y="3" width="5" height="5" rx="1"></rect>
              <rect x="9.5" y="3" width="5" height="5" rx="1" opacity="0.55"></rect>
              <rect x="16" y="3" width="5" height="5" rx="1"></rect>
              <rect x="3" y="9.5" width="5" height="5" rx="1" opacity="0.55"></rect>
              <rect x="9.5" y="9.5" width="5" height="5" rx="1"></rect>
              <rect x="16" y="9.5" width="5" height="5" rx="1" opacity="0.55"></rect>
              <rect x="3" y="16" width="5" height="5" rx="1"></rect>
              <rect x="9.5" y="16" width="5" height="5" rx="1" opacity="0.55"></rect>
              <rect x="16" y="16" width="5" height="5" rx="1"></rect>
            </svg>
            <span>モザイク <kbd>M</kbd></span>
          </button>
          <button id="btn-effect-blur" class="gphoto-editor-btn tool-btn" type="button" title="ぼかし加工に切替 (B)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 3.5C12 3.5 6 10.2 6 14.5a6 6 0 0 0 12 0c0-4.3-6-11-6-11z" fill="currentColor" fill-opacity="0.28"></path>
              <circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"></circle>
            </svg>
            <span>ぼかし <kbd>B</kbd></span>
          </button>
        </div>

        <div class="gphoto-editor-group tool-group">
          <span class="group-label">ツール（塗る・囲む）</span>
          <button id="btn-tool-brush" class="gphoto-editor-btn tool-btn" type="button" title="なぞって加工 (D) / ホイールでサイズ変更">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"></path>
              <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"></path>
            </svg>
            <span>ブラシ <kbd>D</kbd></span>
          </button>
          <button id="btn-select-mosaic" class="gphoto-editor-btn tool-btn" type="button" title="ドラッグで囲んだ内側を即加工 (I)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"></rect>
              <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" fill-opacity="0.7" stroke="none"></rect>
            </svg>
            <span>四角・内側 <kbd>I</kbd></span>
          </button>
          <button id="btn-select-mosaic-inv" class="gphoto-editor-btn tool-btn" type="button" title="ドラッグで囲んだ外側（背景）を即加工 (O)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path fill="currentColor" fill-opacity="0.45" fill-rule="evenodd" d="M3 3h18v18H3V3zm5 5v8h8V8H8z"></path>
              <rect x="8" y="8" width="8" height="8" rx="1"></rect>
            </svg>
            <span>四角・外側 <kbd>O</kbd></span>
          </button>
          <button id="btn-poly-mosaic" class="gphoto-editor-btn tool-btn" type="button" title="クリックで囲んだ多角形の内側を即加工 (P)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
              <polygon points="12,3 21,9 18,20 6,20 3,9" fill="currentColor" fill-opacity="0.55"></polygon>
            </svg>
            <span>多角形・内側 <kbd>P</kbd></span>
          </button>
          <button id="btn-poly-mosaic-inv" class="gphoto-editor-btn tool-btn" type="button" title="クリックで囲んだ多角形の外側（背景）を即加工 (Shift+P)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
              <path fill="currentColor" fill-opacity="0.45" fill-rule="evenodd" d="M2 2h20v20H2V2zm10 3.5L5.5 10l2.5 8.5h8L18.5 10 12 5.5z"></path>
              <polygon points="12,5.5 18.5,10 16,18.5 8,18.5 5.5,10"></polygon>
            </svg>
            <span>多角形・外側 <kbd>⇧P</kbd></span>
          </button>
        </div>

        <div class="gphoto-editor-group tool-group">
          <span class="group-label">履歴・比較</span>
          <button id="btn-undo" class="gphoto-editor-btn tool-btn" type="button" title="元に戻す (Ctrl+Z)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 14 4 9l5-5"></path>
              <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"></path>
            </svg>
            <span>戻す</span>
          </button>
          <button id="btn-redo" class="gphoto-editor-btn tool-btn" type="button" title="やり直し (Ctrl+Y)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m15 14 5-5-5-5"></path>
              <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13"></path>
            </svg>
            <span>やり直す</span>
          </button>
          <button id="btn-reset" class="gphoto-editor-btn tool-btn" type="button" title="最初の状態に戻す">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            <span>リセット</span>
          </button>
          <button id="btn-compare" class="gphoto-editor-btn tool-btn" type="button" title="押している間だけ元画像を表示 (Space長押し)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <span>元画像と比較</span>
          </button>
        </div>
      </div>

      <div class="toolbar-row toolbar-settings">
        <div id="setting-brush" class="setting-item">
          <label for="brush-slider">ブラシサイズ</label>
          <input type="range" id="brush-slider" min="10" max="200" value="50">
          <span id="brush-size-val" class="setting-value">50px</span>
          <div class="preset-btns">
            <button type="button" class="preset-btn" data-size="20" title="ブラシ 小 (1)">小</button>
            <button type="button" class="preset-btn" data-size="50" title="ブラシ 中 (2)">中</button>
            <button type="button" class="preset-btn" data-size="100" title="ブラシ 大 (3)">大</button>
            <button type="button" class="preset-btn" data-size="160" title="ブラシ 特大 (4)">特大</button>
          </div>
        </div>
        <div id="setting-mosaic" class="setting-item">
          <label for="mosaic-intensity-slider">モザイク強さ</label>
          <input type="range" id="mosaic-intensity-slider" min="10" max="100" value="50">
          <span id="mosaic-intensity-val" class="setting-value">50%</span>
        </div>
        <div id="setting-blur" class="setting-item">
          <label for="blur-intensity-slider">ぼかし強さ</label>
          <input type="range" id="blur-intensity-slider" min="10" max="100" value="50">
          <span id="blur-intensity-val" class="setting-value">50%</span>
        </div>
      </div>
    `;

        this.overlay.appendChild(toolbar);

        const actions = document.createElement('div');
        actions.id = 'gphoto-editor-actions';
        this.actionsBar = actions;
        actions.innerHTML = `
      <div class="gphoto-editor-group">
        <button id="btn-cancel" class="gphoto-editor-btn action-btn" type="button" title="閉じる (Esc)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"></path>
          </svg>
          <span>閉じる <kbd>Esc</kbd></span>
        </button>
        <span id="editor-status-hint" class="editor-status-hint"></span>
      </div>
      <div class="gphoto-editor-group">
        <label class="download-format" title="ダウンロード形式">
          <span>保存形式:</span>
          <select id="download-format">
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
        <button id="btn-copy" class="gphoto-editor-btn action-btn secondary-accent" type="button" title="画像をクリップボードにコピー (Ctrl+C)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>コピー <kbd>Ctrl+C</kbd></span>
        </button>
        <button id="btn-download" class="gphoto-editor-btn action-btn primary" type="button" title="画像をダウンロード保存 (Ctrl+S)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>保存・ダウンロード <kbd>Ctrl+S</kbd></span>
        </button>
      </div>
    `;

        this.overlay.appendChild(actions);
        this.updateLayoutMetrics();

        // Effect & Tool events
        document.getElementById('btn-effect-mosaic').onclick = () => this.setEffectType('mosaic');
        document.getElementById('btn-effect-blur').onclick = () => this.setEffectType('blur');

        document.getElementById('btn-tool-brush').onclick = () => this.setTool('brush');
        document.getElementById('btn-select-mosaic').onclick = () => this.setTool('rect-in');
        document.getElementById('btn-select-mosaic-inv').onclick = () => this.setTool('rect-out');
        document.getElementById('btn-poly-mosaic').onclick = () => this.setTool('poly-in');
        document.getElementById('btn-poly-mosaic-inv').onclick = () => this.setTool('poly-out');

        // Sliders & presets
        const slider = document.getElementById('brush-slider');
        slider.oninput = (e) => {
            this.setBrushSize(parseInt(e.target.value, 10));
        };

        toolbar.querySelectorAll('.preset-btn').forEach((btn) => {
            btn.onclick = () => {
                const size = parseInt(btn.dataset.size, 10);
                this.setBrushSize(size);
                if (this.tool !== 'brush') {
                    this.setTool('brush');
                }
            };
        });

        const mosaicSlider = document.getElementById('mosaic-intensity-slider');
        mosaicSlider.oninput = (e) => {
            this.setMosaicIntensity(parseInt(e.target.value, 10));
        };

        const blurSlider = document.getElementById('blur-intensity-slider');
        blurSlider.oninput = (e) => {
            this.setBlurIntensity(parseInt(e.target.value, 10));
        };

        // History, Reset & Compare
        document.getElementById('btn-undo').onclick = () => this.undo();
        document.getElementById('btn-redo').onclick = () => this.redo();
        document.getElementById('btn-reset').onclick = () => this.resetToOriginal();

        const compareBtn = document.getElementById('btn-compare');
        compareBtn.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.startCompare();
        });
        compareBtn.addEventListener('mouseup', () => this.stopCompare());
        compareBtn.addEventListener('mouseleave', () => this.stopCompare());
        compareBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startCompare();
        }, { passive: false });
        compareBtn.addEventListener('touchend', () => this.stopCompare());

        // Actions
        document.getElementById('btn-cancel').onclick = () => this.requestClose();
        document.getElementById('btn-copy').onclick = () => this.copyToClipboard();
        document.getElementById('btn-download').onclick = () => this.download();
    }

    setEffectType(effectType) {
        this.effectType = effectType === 'blur' ? 'blur' : 'mosaic';
        const btnMosaic = document.getElementById('btn-effect-mosaic');
        const btnBlur = document.getElementById('btn-effect-blur');
        if (btnMosaic) btnMosaic.classList.toggle('active', this.effectType === 'mosaic');
        if (btnBlur) btnBlur.classList.toggle('active', this.effectType === 'blur');

        this.updateSettingsVisibility();
        this.updateStatusHint();
    }

    setTool(tool) {
        this.tool = tool;
        const isPoly = tool.startsWith('poly');
        const isRect = tool.startsWith('rect');
        const isBrush = tool === 'brush';

        document.getElementById('btn-tool-brush')?.classList.toggle('active', isBrush);
        document.getElementById('btn-select-mosaic')?.classList.toggle('active', tool === 'rect-in');
        document.getElementById('btn-select-mosaic-inv')?.classList.toggle('active', tool === 'rect-out');
        document.getElementById('btn-poly-mosaic')?.classList.toggle('active', tool === 'poly-in');
        document.getElementById('btn-poly-mosaic-inv')?.classList.toggle('active', tool === 'poly-out');

        this.canvas.style.cursor = isBrush ? 'none' : 'crosshair';
        if (!isBrush && this.brushCursor) {
            this.brushCursor.style.display = 'none';
        }

        if (isBrush) {
            this.clearSelectionUI();
            this.clearPolygonUI();
            this.hidePolyHelpTooltip();
        } else if (isPoly) {
            this.clearSelectionUI();
            this.showPolyHelpTooltip();
        } else if (isRect) {
            this.clearPolygonUI();
            this.hidePolyHelpTooltip();
        }

        this.updateCursorSize();
        this.updateSettingsVisibility();
        this.updateStatusHint();
    }

    updateSettingsVisibility() {
        const brushSetting = document.getElementById('setting-brush');
        const mosaicSetting = document.getElementById('setting-mosaic');
        const blurSetting = document.getElementById('setting-blur');

        if (brushSetting) {
            brushSetting.classList.toggle('inactive-setting', this.tool !== 'brush');
            brushSetting.classList.toggle('active-setting', this.tool === 'brush');
        }
        if (mosaicSetting) {
            mosaicSetting.classList.toggle('active-setting', this.effectType === 'mosaic');
            mosaicSetting.classList.toggle('inactive-setting', this.effectType !== 'mosaic');
        }
        if (blurSetting) {
            blurSetting.classList.toggle('active-setting', this.effectType === 'blur');
            blurSetting.classList.toggle('inactive-setting', this.effectType !== 'blur');
        }
    }

    updateStatusHint() {
        const hintEl = document.getElementById('editor-status-hint');
        if (!hintEl) return;
        const effectLabel = this.effectType === 'blur' ? 'ぼかし' : 'モザイク';
        const hints = {
            brush: `ドラッグでなぞって${effectLabel}（ホイールでサイズ変更 / Space長押しで元画像比較）`,
            'rect-in': `ドラッグで囲んだ内側を即${effectLabel}（離すとすぐ適用）`,
            'rect-out': `ドラッグで囲んだ外側（背景）を即${effectLabel}（離すとすぐ適用）`,
            'poly-in': `クリックで囲んだ内側を即${effectLabel}（Backspaceで1点戻す / Enterで確定）`,
            'poly-out': `クリックで囲んだ外側（背景）を即${effectLabel}（Backspaceで1点戻す / Enterで確定）`
        };
        hintEl.textContent = hints[this.tool] || '';
    }

    updateLayoutMetrics() {
        if (!this.container || !this.toolbar || !this.actionsBar) return;
        const top = this.toolbar.getBoundingClientRect().height || 80;
        const bottom = this.actionsBar.getBoundingClientRect().height || 60;
        this.container.style.marginTop = `${top}px`;
        this.container.style.marginBottom = `${bottom}px`;
        this.container.style.maxHeight = `calc(100vh - ${top + bottom + 16}px)`;

        if (this.polyHelpTooltip) {
            this.polyHelpTooltip.style.top = `${top + 12}px`;
        }
    }

    attachEvents() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('dblclick', this.handleDoubleClick);
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        window.addEventListener('resize', this.updateLayoutMetrics);
        window.addEventListener('blur', this.handleWindowBlur);
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
    }

    detachEvents() {
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this.handleMouseDown);
            this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
            this.canvas.removeEventListener('wheel', this.handleWheel);
        }
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        window.removeEventListener('resize', this.updateLayoutMetrics);
        window.removeEventListener('blur', this.handleWindowBlur);
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }

    updateCursorSize() {
        if (!this.canvas || !this.brushCursor) return;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
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
        if (this.toolbar) {
            this.toolbar.querySelectorAll('.preset-btn').forEach((btn) => {
                const size = parseInt(btn.dataset.size, 10);
                btn.classList.toggle('active', size === this.brushSize);
            });
        }
        this.updateCursorSize();
    }

    setMosaicIntensity(value) {
        this.mosaicIntensity = Math.min(100, Math.max(10, value));
        this.updateIntensityUI();
    }

    setBlurIntensity(value) {
        this.blurIntensity = Math.min(100, Math.max(10, value));
        this.updateIntensityUI();
    }

    updateIntensityUI() {
        const mosaicSlider = document.getElementById('mosaic-intensity-slider');
        const mosaicLabel = document.getElementById('mosaic-intensity-val');
        if (mosaicSlider) mosaicSlider.value = String(this.mosaicIntensity);
        if (mosaicLabel) mosaicLabel.textContent = `${this.mosaicIntensity}%`;

        const blurSlider = document.getElementById('blur-intensity-slider');
        const blurLabel = document.getElementById('blur-intensity-val');
        if (blurSlider) blurSlider.value = String(this.blurIntensity);
        if (blurLabel) blurLabel.textContent = `${this.blurIntensity}%`;
    }

    getMosaicBlockSize() {
        // mosaicIntensity 10-100 -> blockSize 5-50
        return Math.round(5 + (this.mosaicIntensity - 10) * (45 / 90));
    }

    getBlurAmount() {
        // blurIntensity 10-100 -> blur 2-25px
        return Math.round(2 + (this.blurIntensity - 10) * (23 / 90));
    }

    handleWheel(e) {
        if (this.tool !== 'brush') return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 10 : -10;
        this.setBrushSize(this.brushSize + delta);
        this.brushCursor.style.display = 'block';
        this.brushCursor.style.left = e.clientX + 'px';
        this.brushCursor.style.top = e.clientY + 'px';
    }

    handleMouseMove(e) {
        this.lastClientPos = { x: e.clientX, y: e.clientY };
        if (this.tool.startsWith('poly')) {
            this.handlePolygonMove(e);
        } else if (this.tool.startsWith('rect')) {
            this.handleSelectionMove(e);
        } else {
            this.handleBrushMove(e);
        }
    }

    handleMouseDown(e) {
        if (e.target !== this.canvas) return;
        if (e.button !== 0) return;

        if (this.tool.startsWith('poly')) {
            this.handlePolygonClick(e);
        } else if (this.tool.startsWith('rect')) {
            this.handleSelectionDown(e);
        } else {
            this.isDrawing = true;
            const pt = this.getCanvasCoordinates(e);
            this.lastDrawPoint = pt;
            this.applyBrushAt(pt.x, pt.y);
        }
    }

    handleMouseUp(e) {
        if (this.tool.startsWith('poly')) {
            return;
        }

        if (this.tool.startsWith('rect')) {
            this.handleSelectionUp(e);
        } else {
            if (this.isDrawing) {
                this.saveState();
            }
            this.isDrawing = false;
            this.lastDrawPoint = null;
        }
    }

    handleWindowBlur() {
        this.stopCompare();
    }

    // --- Brush Logic ---

    handleBrushMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const inCanvas =
            e.clientX >= rect.left &&
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

        const pt = this.getCanvasCoordinates(e);
        if (!this.lastDrawPoint) {
            this.lastDrawPoint = pt;
            this.applyBrushAt(pt.x, pt.y);
            return;
        }

        const dx = pt.x - this.lastDrawPoint.x;
        const dy = pt.y - this.lastDrawPoint.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(3, this.brushSize / 4);

        if (dist <= step) {
            this.applyBrushAt(pt.x, pt.y);
        } else {
            const steps = Math.ceil(dist / step);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                this.applyBrushAt(
                    this.lastDrawPoint.x + dx * t,
                    this.lastDrawPoint.y + dy * t
                );
            }
        }
        this.lastDrawPoint = pt;
    }

    applyBrushAt(x, y) {
        if (this.effectType === 'mosaic') {
            ImageProcessor.applyMosaic(this.ctx, x, y, this.brushSize, this.getMosaicBlockSize());
        } else {
            ImageProcessor.applyBlur(this.ctx, x, y, this.brushSize, this.getBlurAmount());
        }
    }

    // --- Rectangle Selection Logic ---

    handleSelectionDown(e) {
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

    handleSelectionUp() {
        if (!this.isSelecting) return;
        this.isSelecting = false;

        if (this.selectionRect && this.selectionRect.width > 5 && this.selectionRect.height > 5) {
            const rect = { ...this.selectionRect };
            this.clearSelectionUI();
            this.applySelection('rect', { rect });
        } else {
            this.clearSelectionUI();
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

    // --- Polygon Selection Logic ---

    handlePolygonMove(e) {
        if (!this.isPolySelecting) return;
        const coords = this.getCanvasCoordinates(e);
        this.polyHoverPoint = coords;

        const nearFirst = this.isNearFirstPoint(coords) && this.polyPoints.length >= 3;
        this.updateStartPointHover(nearFirst);
        this.updateCloseHint(nearFirst);
        this.updateSnapLine(nearFirst);

        this.updatePolygonUI();
        this.updatePolyHelpTooltip();
    }

    handlePolygonClick(e) {
        const coords = this.getCanvasCoordinates(e);
        if (!this.isPolySelecting) {
            this.clearSelectionUI();
            this.isPolySelecting = true;
            this.polyPoints = [coords];
            this.polyHoverPoint = null;
            this.updatePolygonUI();
            this.updatePolyHelpTooltip();
            return;
        }

        if (this.isNearFirstPoint(coords) && this.polyPoints.length >= 3) {
            this.finalizePolygonSelection();
            return;
        }

        this.polyPoints.push(coords);
        this.updatePolygonUI();
        this.updatePolyHelpTooltip();
    }

    handleDoubleClick() {
        if (!this.tool.startsWith('poly')) return;
        if (this.polyPoints.length >= 3) {
            this.finalizePolygonSelection();
        }
    }

    undoLastPolygonPoint() {
        if (!this.isPolySelecting || this.polyPoints.length === 0) return;
        this.polyPoints.pop();
        if (this.polyPoints.length === 0) {
            this.clearPolygonUI();
            this.showPolyHelpTooltip();
        } else {
            this.updatePolygonUI();
            this.updatePolyHelpTooltip();
        }
    }

    isNearFirstPoint(coords) {
        if (this.polyPoints.length === 0) return false;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0) return false;
        const threshold = 10 * (this.canvas.width / rect.width);
        const dx = coords.x - this.polyPoints[0].x;
        const dy = coords.y - this.polyPoints[0].y;
        return Math.hypot(dx, dy) <= threshold;
    }

    updateStartPointHover(isHovering) {
        const startPoint = this.selectionPointsGroup?.querySelector('.selection-point-start');
        if (startPoint) {
            startPoint.classList.toggle('hovering', isHovering);
            this.canvas.style.cursor = isHovering ? 'pointer' : 'crosshair';
        }
    }

    updateCloseHint(show) {
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

    updateSnapLine(show) {
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
        if (!this.polyHelpTooltip) {
            this.polyHelpTooltip = document.createElement('div');
            this.polyHelpTooltip.className = 'poly-help-tooltip';
            this.overlay.appendChild(this.polyHelpTooltip);
        }
        const top = this.toolbar ? this.toolbar.getBoundingClientRect().height : 80;
        this.polyHelpTooltip.style.top = `${top + 12}px`;
        this.updatePolyHelpTooltip();
    }

    updatePolyHelpTooltip() {
        if (!this.polyHelpTooltip) return;
        const count = this.polyPoints.length;
        const areaText = this.tool === 'poly-out' ? '外側' : '内側';
        const effectText = this.effectType === 'blur' ? 'ぼかし' : 'モザイク';
        if (count === 0) {
            this.polyHelpTooltip.innerHTML = `<span class="highlight">クリック</span>で頂点を追加（確定で${areaText}に${effectText}）`;
        } else if (count < 3) {
            const remaining = 3 - count;
            this.polyHelpTooltip.innerHTML = `あと<span class="highlight">${remaining}点</span>追加で確定できます（Backspaceで1点戻す）`;
        } else {
            this.polyHelpTooltip.innerHTML = '<span class="close-ready">始点をクリック</span> / <span class="highlight">ダブルクリック</span> / <span class="highlight">Enter</span> で即適用';
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
        const points = [...this.polyPoints];
        this.clearPolygonUI();
        this.applySelection('poly', { points });
        if (this.tool.startsWith('poly')) {
            this.showPolyHelpTooltip();
        }
    }

    applySelection(kind, data) {
        const isInverse = this.tool.endsWith('-out');
        const isBlur = this.effectType === 'blur';

        if (kind === 'rect') {
            const rect = data.rect;
            if (isBlur) {
                const amount = this.getBlurAmount();
                if (isInverse) {
                    ImageProcessor.applyBlurToRectInverse(this.ctx, rect, amount);
                } else {
                    ImageProcessor.applyBlurToRect(this.ctx, rect, amount);
                }
            } else {
                const blockSize = this.getMosaicBlockSize();
                if (isInverse) {
                    ImageProcessor.applyMosaicToRectInverse(this.ctx, rect, blockSize);
                } else {
                    ImageProcessor.applyMosaicToRect(this.ctx, rect, blockSize);
                }
            }
        } else if (kind === 'poly') {
            const points = data.points;
            if (isBlur) {
                const amount = this.getBlurAmount();
                if (isInverse) {
                    ImageProcessor.applyBlurToPolygonInverse(this.ctx, points, amount);
                } else {
                    ImageProcessor.applyBlurToPolygon(this.ctx, points, amount);
                }
            } else {
                const blockSize = this.getMosaicBlockSize();
                if (isInverse) {
                    ImageProcessor.applyMosaicToPolygonInverse(this.ctx, points, blockSize);
                } else {
                    ImageProcessor.applyMosaicToPolygon(this.ctx, points, blockSize);
                }
            }
        }

        this.saveState();
        const areaLabel = isInverse ? '外側（背景）' : '選択範囲';
        const effectLabel = isBlur ? 'ぼかし' : 'モザイク';
        this.showToast(`${areaLabel}に${effectLabel}を適用しました`);
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
                const radius = idx === 0 ? (canClose ? 9 : 7) : 5;
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
        this.canvas && (this.canvas.style.cursor = this.tool === 'brush' ? 'none' : 'crosshair');
    }

    // --- Keyboard Shortcuts ---

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        const isCmd = e.ctrlKey || e.metaKey;

        if (isCmd && key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                this.redo();
            } else {
                this.undo();
            }
            return;
        }
        if (isCmd && key === 'y') {
            e.preventDefault();
            this.redo();
            return;
        }
        if (isCmd && key === 's') {
            e.preventDefault();
            this.download();
            return;
        }
        if (isCmd && key === 'c') {
            const selectedText = window.getSelection ? window.getSelection().toString() : '';
            if (!selectedText) {
                e.preventDefault();
                this.copyToClipboard();
                return;
            }
        }

        const tagName = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
        const isFormField = ['input', 'select', 'textarea'].includes(tagName);

        if (key === 'escape') {
            e.preventDefault();
            if (this.isPolySelecting || this.isSelecting) {
                this.clearSelectionUI();
                this.clearPolygonUI();
                if (this.tool.startsWith('poly')) {
                    this.showPolyHelpTooltip();
                }
            } else {
                this.requestClose();
            }
            return;
        }

        if (isFormField) return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (!e.repeat) {
                this.startCompare();
            }
            return;
        }

        if ((key === 'backspace' || key === 'delete') && this.tool.startsWith('poly') && this.isPolySelecting) {
            e.preventDefault();
            this.undoLastPolygonPoint();
            return;
        }

        if (key === 'enter' && this.tool.startsWith('poly') && this.isPolySelecting && this.polyPoints.length >= 3) {
            e.preventDefault();
            this.finalizePolygonSelection();
            return;
        }

        if (key === 'm') {
            this.setEffectType('mosaic');
        } else if (key === 'b') {
            this.setEffectType('blur');
        } else if (key === 'd') {
            this.setTool('brush');
        } else if (key === 'i') {
            this.setTool('rect-in');
        } else if (key === 'o') {
            this.setTool('rect-out');
        } else if (key === 'p' && e.shiftKey) {
            this.setTool('poly-out');
        } else if (key === 'p') {
            this.setTool('poly-in');
        } else if (key === '1') {
            this.setBrushSize(this.brushSizePresets.small);
        } else if (key === '2') {
            this.setBrushSize(this.brushSizePresets.medium);
        } else if (key === '3') {
            this.setBrushSize(this.brushSizePresets.large);
        } else if (key === '4') {
            this.setBrushSize(this.brushSizePresets.xlarge);
        }
    }

    handleKeyUp(e) {
        if (e.code === 'Space') {
            this.stopCompare();
        }
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return { x: 0, y: 0 };
        }
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const rawX = (e.clientX - rect.left) * scaleX;
        const rawY = (e.clientY - rect.top) * scaleY;

        return {
            x: Math.min(Math.max(rawX, 0), this.canvas.width),
            y: Math.min(Math.max(rawY, 0), this.canvas.height)
        };
    }

    // --- History, Reset & Compare ---

    saveState() {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Preserve index 0 (original image) even if history exceeds cap
        if (this.history.length >= 25) {
            this.history.splice(1, 1);
            this.historyIndex--;
        }

        this.history.push(this.canvas.toDataURL());
        this.historyIndex++;
        this.updateHistoryButtons();
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
        }
    }

    restoreState(dataUrl, onDone) {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
            if (typeof onDone === 'function') onDone();
        };
    }

    resetToOriginal() {
        if (this.history.length === 0 || this.historyIndex === 0) return;
        this.restoreState(this.history[0], () => {
            this.saveState();
            this.showToast('最初の状態にリセットしました（Ctrl+Zで戻せます）');
        });
    }

    updateHistoryButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        const resetBtn = document.getElementById('btn-reset');
        const compareBtn = document.getElementById('btn-compare');

        const canUndo = this.historyIndex > 0;
        const canRedo = this.historyIndex < this.history.length - 1;

        if (undoBtn) undoBtn.disabled = !canUndo;
        if (redoBtn) redoBtn.disabled = !canRedo;
        if (resetBtn) resetBtn.disabled = !canUndo;
        if (compareBtn) compareBtn.disabled = this.history.length === 0;
    }

    startCompare() {
        if (this.isComparing || this.history.length === 0) return;
        this.isComparing = true;
        if (this.compareImgEl) {
            this.compareImgEl.src = this.history[0];
            this.compareImgEl.style.display = 'block';
        }
        if (this.compareBadgeEl) {
            this.compareBadgeEl.style.display = 'block';
        }
        document.getElementById('btn-compare')?.classList.add('active');
    }

    stopCompare() {
        if (!this.isComparing) return;
        this.isComparing = false;
        if (this.compareImgEl) {
            this.compareImgEl.style.display = 'none';
        }
        if (this.compareBadgeEl) {
            this.compareBadgeEl.style.display = 'none';
        }
        document.getElementById('btn-compare')?.classList.remove('active');
    }

    // --- Export / Clipboard / Toast ---

    showToast(message) {
        if (!this.toastEl) return;
        this.toastEl.textContent = message;
        this.toastEl.classList.add('visible');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            if (this.toastEl) this.toastEl.classList.remove('visible');
        }, 2400);
    }

    copyToClipboard() {
        if (!this.canvas || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
            alert('この環境ではクリップボードへの画像コピーに対応していません。');
            return;
        }
        this.canvas.toBlob(async (blob) => {
            if (!blob) {
                alert('クリップボードへのコピーに失敗しました。');
                return;
            }
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                this.showToast('✅ クリップボードにコピーしました！そのまま貼り付けできます');
            } catch (err) {
                console.error('Clipboard copy failed:', err);
                alert('クリップボードへのコピーに失敗しました。ページをクリックしてから再試行してください。');
            }
        }, 'image/png');
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
            } else {
                this.showToast('💾 ダウンロードを開始しました');
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
        this.stopCompare();
        this.detachEvents();
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        if (this.brushCursor) {
            this.brushCursor.remove();
            this.brushCursor = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        window.GPhotoEditor = null;
        if (typeof window.gphotoUpdateQuickLaunch === 'function') {
            window.gphotoUpdateQuickLaunch();
        }
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
