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

        this.effectType = 'mosaic';      // 'mosaic' | 'blur'
        this.tool = 'brush';             // 'brush' | 'rect' | 'poly' | 'magic-select'
        this.selectionAreaMode = 'in';   // 'in' | 'out'
        this.magicClickMode = 'add';     // 'add' | 'exclude'

        this.brushSize = 50;
        this.brushSizePresets = { small: 20, medium: 50, large: 100, xlarge: 160 };
        this.mosaicIntensity = 50; // 10-100
        this.blurIntensity = 50;   // 10-100
        this.autoSensitivity = 50; // 10-95

        this.autoBgBaseIndex = null;
        this.autoBgActive = false;
        this.autoBgSeq = 0;

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

        this.magicMaskCanvas = null;
        this.magicSeedPoints = [];
        this.magicExcludePoints = [];
        this.magicCurrentMask = null;

        this.candidatesContainer = null;
        this.candidatesList = [];
        this.isCandidatesVisible = false;

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
        this.setSelectionAreaMode('in');
        this.setMagicClickMode('add');
        this.setTool('brush');
        this.updateBrushUI();
        this.updateStrengthUI();
        this.updateHistoryButtons();
        this.updateLayoutMetrics();
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

        this.magicMaskCanvas = document.createElement('canvas');
        this.magicMaskCanvas.className = 'magic-mask-canvas';
        container.appendChild(this.magicMaskCanvas);

        this.candidatesContainer = document.createElement('div');
        this.candidatesContainer.className = 'candidates-layer';
        container.appendChild(this.candidatesContainer);

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
      <div class="toolbar-section toolbar-left">
        <button id="btn-cancel" class="gphoto-editor-btn subtle-btn" type="button" title="編集を終了して戻る (Esc)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"></path>
          </svg>
          <span>閉じる</span>
        </button>
        <span class="toolbar-divider"></span>
        <button id="btn-undo" class="gphoto-editor-btn" type="button" title="1つ前の操作に戻す (Ctrl+Z)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5"></path>
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"></path>
          </svg>
          <span>戻す</span>
        </button>
        <button id="btn-redo" class="gphoto-editor-btn" type="button" title="やり直す (Ctrl+Y)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5"></path>
            <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13"></path>
          </svg>
          <span>やり直し</span>
        </button>
        <button id="btn-reset" class="gphoto-editor-btn subtle-btn" type="button" title="最初の画像に戻す">
          <span>リセット</span>
        </button>
      </div>

      <div class="toolbar-section toolbar-center">
        <div class="segmented-control" role="group" aria-label="加工の種類">
          <button id="btn-effect-mosaic" class="seg-btn" type="button" title="モザイク加工に切替 (M)">モザイク</button>
          <button id="btn-effect-blur" class="seg-btn" type="button" title="ぼかし加工に切替 (B)">ぼかし</button>
        </div>

        <span class="toolbar-divider"></span>

        <button id="btn-tool-brush" class="gphoto-editor-btn" type="button" title="なぞって加工 (D) / ホイールで太さ調整">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"></path>
            <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"></path>
          </svg>
          <span>ブラシ</span>
        </button>
        <button id="btn-tool-rect" class="gphoto-editor-btn" type="button" title="ドラッグで四角く囲んで即加工 (I / O)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"></rect>
          </svg>
          <span>四角で囲む</span>
        </button>
        <button id="btn-tool-poly" class="gphoto-editor-btn" type="button" title="クリックで多角形に囲んで加工 (P)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
            <polygon points="12,3 21,9 18,20 6,20 3,9"></polygon>
          </svg>
          <span>多角形で囲む</span>
        </button>
        <button id="btn-auto-bg" class="gphoto-editor-btn ai-btn" type="button" title="商品以外（背景）をワンクリックで自動加工 (A)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path>
          </svg>
          <span>✨ 背景を自動加工</span>
        </button>
        <button id="btn-detect-candidates" class="gphoto-editor-btn ai-btn" type="button" title="文字・顔・バーコードなどのモザイク候補を自動検出 (F)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          <span>🔍 自動検出</span>
        </button>
      </div>

      <div class="toolbar-section toolbar-right">
        <button id="btn-compare" class="gphoto-editor-btn" type="button" title="押している間だけ元の画像を表示 (Space長押し)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>元画像</span>
        </button>
        <button id="btn-copy" class="gphoto-editor-btn secondary-accent" type="button" title="クリップボードにコピー (Ctrl+C)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>コピー</span>
        </button>
        <div class="save-group">
          <select id="download-format" title="保存形式">
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
          <button id="btn-download" class="gphoto-editor-btn primary" type="button" title="画像を保存・ダウンロード (Ctrl+S)">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>保存</span>
          </button>
        </div>
      </div>
    `;

        this.overlay.appendChild(toolbar);

        // Minimal Context-Aware Bottom Capsule
        const actions = document.createElement('div');
        actions.id = 'gphoto-editor-actions';
        this.actionsBar = actions;
        actions.innerHTML = `
      <div id="ctx-brush" class="ctx-group">
        <label class="ctx-label" for="brush-slider">太さ</label>
        <input type="range" id="brush-slider" min="10" max="200" value="50">
        <span id="brush-size-val" class="ctx-value">50px</span>
        <div class="preset-btns">
          <button type="button" class="preset-btn" data-size="20">小</button>
          <button type="button" class="preset-btn" data-size="50">中</button>
          <button type="button" class="preset-btn" data-size="100">大</button>
        </div>
      </div>

      <div id="ctx-area-mode" class="ctx-group">
        <div class="segmented-control compact" role="group" aria-label="加工する範囲">
          <button id="btn-area-in" class="seg-btn" type="button">内側を加工</button>
          <button id="btn-area-out" class="seg-btn" type="button">外側（背景）を加工</button>
        </div>
        <span id="ctx-rect-hint" class="ctx-hint">ドラッグで囲むと即適用</span>
      </div>

      <div id="ctx-poly-actions" class="ctx-group">
        <span id="ctx-poly-hint" class="ctx-hint">クリックで頂点を追加</span>
        <button id="btn-poly-undo" class="gphoto-editor-btn compact-btn" type="button">1点戻す</button>
        <button id="btn-poly-apply" class="gphoto-editor-btn compact-btn primary" type="button">確定する</button>
        <button id="btn-poly-clear" class="gphoto-editor-btn compact-btn subtle-btn" type="button">クリア</button>
      </div>

      <div id="ctx-magic-actions" class="ctx-group">
        <div class="segmented-control compact" role="group" aria-label="タッチ指定モード">
          <button id="btn-magic-add" class="seg-btn" type="button">＋ 商品を残す</button>
          <button id="btn-magic-exclude" class="seg-btn" type="button">－ 背景を消す</button>
        </div>
        <button id="magic-apply-out" class="gphoto-editor-btn compact-btn primary" type="button" disabled>✨ 外側（背景）を加工</button>
        <button id="magic-apply-in" class="gphoto-editor-btn compact-btn" type="button" disabled>内側を加工</button>
        <button id="magic-clear" class="gphoto-editor-btn compact-btn subtle-btn" type="button" disabled>クリア</button>
      </div>

      <div id="ctx-sensitivity" class="ctx-group">
        <label class="ctx-label" for="sensitivity-slider">境界の感度</label>
        <input type="range" id="sensitivity-slider" min="10" max="95" value="50">
        <span id="sensitivity-val" class="ctx-value">50%</span>
        <button id="btn-magic-finetune" class="gphoto-editor-btn compact-btn ai-btn" type="button">🪄 タッチで微調整</button>
      </div>

      <div id="ctx-candidates-actions" class="ctx-group">
        <span class="ctx-hint">枠をクリックで加工</span>
        <button id="candidates-apply-all" class="gphoto-editor-btn compact-btn primary" type="button">✨ すべて一括加工</button>
        <button id="candidates-hide" class="gphoto-editor-btn compact-btn subtle-btn" type="button">枠を隠す</button>
      </div>

      <div id="ctx-strength" class="ctx-group ctx-strength-group">
        <span class="toolbar-divider"></span>
        <label class="ctx-label" for="effect-strength-slider">強さ</label>
        <input type="range" id="effect-strength-slider" min="10" max="100" value="50">
        <span id="effect-strength-val" class="ctx-value">50%</span>
      </div>
    `;

        this.overlay.appendChild(actions);

        // Top Bar Events
        document.getElementById('btn-cancel').onclick = () => this.requestClose();
        document.getElementById('btn-undo').onclick = () => this.undo();
        document.getElementById('btn-redo').onclick = () => this.redo();
        document.getElementById('btn-reset').onclick = () => this.resetToOriginal();

        document.getElementById('btn-effect-mosaic').onclick = () => this.setEffectType('mosaic');
        document.getElementById('btn-effect-blur').onclick = () => this.setEffectType('blur');

        document.getElementById('btn-tool-brush').onclick = () => this.setTool('brush');
        document.getElementById('btn-tool-rect').onclick = () => this.setTool('rect');
        document.getElementById('btn-tool-poly').onclick = () => this.setTool('poly');
        document.getElementById('btn-auto-bg').onclick = () => this.runAutoBackgroundEffect();
        document.getElementById('btn-detect-candidates').onclick = () => this.toggleCandidateDetection();

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

        document.getElementById('btn-copy').onclick = () => this.copyToClipboard();
        document.getElementById('btn-download').onclick = () => this.download();

        // Bottom Context Capsule Events
        document.getElementById('brush-slider').oninput = (e) => {
            this.setBrushSize(parseInt(e.target.value, 10));
        };
        actions.querySelectorAll('.preset-btn').forEach((btn) => {
            btn.onclick = () => {
                this.setBrushSize(parseInt(btn.dataset.size, 10));
            };
        });

        document.getElementById('btn-area-in').onclick = () => this.setSelectionAreaMode('in');
        document.getElementById('btn-area-out').onclick = () => this.setSelectionAreaMode('out');

        document.getElementById('btn-poly-undo').onclick = () => this.undoLastPolygonPoint();
        document.getElementById('btn-poly-apply').onclick = () => this.finalizePolygonSelection();
        document.getElementById('btn-poly-clear').onclick = () => {
            this.clearPolygonUI();
            this.updateContextCapsule();
        };

        document.getElementById('btn-magic-add').onclick = () => this.setMagicClickMode('add');
        document.getElementById('btn-magic-exclude').onclick = () => this.setMagicClickMode('exclude');
        document.getElementById('magic-apply-out').onclick = () => this.applyMagicSelection(true);
        document.getElementById('magic-apply-in').onclick = () => this.applyMagicSelection(false);
        document.getElementById('magic-clear').onclick = () => {
            this.clearMagicSelection();
            this.updateContextCapsule();
        };

        document.getElementById('sensitivity-slider').oninput = (e) => {
            this.setAutoSensitivity(parseInt(e.target.value, 10));
        };
        document.getElementById('btn-magic-finetune').onclick = () => {
            this.autoBgActive = false;
            this.autoBgBaseIndex = null;
            this.setTool('magic-select');
            this.showToast('残したい商品の上をクリックしてください');
        };

        document.getElementById('candidates-apply-all').onclick = () => this.applyAllCandidates();
        document.getElementById('candidates-hide').onclick = () => this.clearCandidates();

        document.getElementById('effect-strength-slider').oninput = (e) => {
            const val = parseInt(e.target.value, 10);
            if (this.effectType === 'blur') {
                this.setBlurIntensity(val);
            } else {
                this.setMosaicIntensity(val);
            }
            if (
                this.autoBgActive &&
                this.autoBgBaseIndex !== null &&
                this.historyIndex === this.autoBgBaseIndex + 1
            ) {
                this.reapplyAutoBackgroundFromBase();
            }
        };
    }

    setEffectType(effectType) {
        this.effectType = effectType === 'blur' ? 'blur' : 'mosaic';
        document.getElementById('btn-effect-mosaic')?.classList.toggle('active', this.effectType === 'mosaic');
        document.getElementById('btn-effect-blur')?.classList.toggle('active', this.effectType === 'blur');
        this.updateStrengthUI();

        if (
            this.autoBgActive &&
            this.autoBgBaseIndex !== null &&
            this.historyIndex === this.autoBgBaseIndex + 1
        ) {
            this.reapplyAutoBackgroundFromBase();
        }
    }

    setSelectionAreaMode(mode) {
        this.selectionAreaMode = mode === 'out' ? 'out' : 'in';
        document.getElementById('btn-area-in')?.classList.toggle('active', this.selectionAreaMode === 'in');
        document.getElementById('btn-area-out')?.classList.toggle('active', this.selectionAreaMode === 'out');
    }

    setMagicClickMode(mode) {
        this.magicClickMode = mode === 'exclude' ? 'exclude' : 'add';
        document.getElementById('btn-magic-add')?.classList.toggle('active', this.magicClickMode === 'add');
        document.getElementById('btn-magic-exclude')?.classList.toggle('active', this.magicClickMode === 'exclude');
    }

    setTool(tool) {
        this.tool = tool;
        const isBrush = tool === 'brush';
        const isRect = tool === 'rect';
        const isPoly = tool === 'poly';
        const isMagic = tool === 'magic-select';

        document.getElementById('btn-tool-brush')?.classList.toggle('active', isBrush);
        document.getElementById('btn-tool-rect')?.classList.toggle('active', isRect);
        document.getElementById('btn-tool-poly')?.classList.toggle('active', isPoly);
        document.getElementById('btn-magic-finetune')?.classList.toggle('active', isMagic);

        if (this.canvas) {
            this.canvas.style.cursor = isBrush ? 'none' : 'crosshair';
        }
        if (!isBrush && this.brushCursor) {
            this.brushCursor.style.display = 'none';
        }

        if (!isMagic) {
            this.clearMagicSelection();
        }
        if (!isRect) {
            this.clearSelectionUI();
        }
        if (!isPoly) {
            this.clearPolygonUI();
        }

        this.updateCursorSize();
        this.updateContextCapsule();
        this.updateLayoutMetrics();
    }

    updateContextCapsule() {
        const brushCtx = document.getElementById('ctx-brush');
        const areaCtx = document.getElementById('ctx-area-mode');
        const rectHint = document.getElementById('ctx-rect-hint');
        const polyCtx = document.getElementById('ctx-poly-actions');
        const magicCtx = document.getElementById('ctx-magic-actions');
        const sensCtx = document.getElementById('ctx-sensitivity');
        const btnFinetune = document.getElementById('btn-magic-finetune');
        const candCtx = document.getElementById('ctx-candidates-actions');

        const isBrush = this.tool === 'brush';
        const isRect = this.tool === 'rect';
        const isPoly = this.tool === 'poly';
        const isMagic = this.tool === 'magic-select';

        if (brushCtx) {
            brushCtx.style.display =
                isBrush && !this.autoBgActive && !this.isCandidatesVisible ? 'flex' : 'none';
        }
        if (areaCtx) {
            areaCtx.style.display = isRect || isPoly ? 'flex' : 'none';
        }
        if (rectHint) {
            rectHint.style.display = isRect ? 'inline' : 'none';
        }
        if (polyCtx) {
            polyCtx.style.display = isPoly ? 'flex' : 'none';
            this.updatePolyContextButtons();
        }
        if (magicCtx) {
            magicCtx.style.display = isMagic ? 'flex' : 'none';
            this.updateMagicBarButtons();
        }
        if (sensCtx) {
            sensCtx.style.display = this.autoBgActive || isMagic ? 'flex' : 'none';
        }
        if (btnFinetune) {
            btnFinetune.style.display = this.autoBgActive && !isMagic ? 'inline-flex' : 'none';
        }
        if (candCtx) {
            candCtx.style.display = this.isCandidatesVisible ? 'flex' : 'none';
            this.updateCandidatesBar();
        }
    }

    updatePolyContextButtons() {
        const hint = document.getElementById('ctx-poly-hint');
        const btnUndo = document.getElementById('btn-poly-undo');
        const btnApply = document.getElementById('btn-poly-apply');
        const btnClear = document.getElementById('btn-poly-clear');
        const count = this.polyPoints.length;

        if (hint) {
            if (count === 0) {
                hint.textContent = 'クリックで頂点を追加';
                hint.style.display = 'inline';
            } else if (count < 3) {
                hint.textContent = `あと${3 - count}点追加`;
                hint.style.display = 'inline';
            } else {
                hint.textContent = '始点をクリック or 確定';
                hint.style.display = 'inline';
            }
        }
        if (btnUndo) {
            btnUndo.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        if (btnApply) {
            btnApply.style.display = count > 0 ? 'inline-flex' : 'none';
            btnApply.disabled = count < 3;
        }
        if (btnClear) {
            btnClear.style.display = count > 0 ? 'inline-flex' : 'none';
        }
    }

    updateLayoutMetrics() {
        if (!this.container || !this.toolbar || !this.actionsBar) return;
        const top = this.toolbar.getBoundingClientRect().height || 60;
        const bottom = (this.actionsBar.getBoundingClientRect().height || 52) + 28;
        this.container.style.marginTop = `${top + 8}px`;
        this.container.style.marginBottom = `${bottom}px`;
        this.container.style.maxHeight = `calc(100vh - ${top + bottom + 16}px)`;
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
        if (this.actionsBar) {
            this.actionsBar.querySelectorAll('.preset-btn').forEach((btn) => {
                const size = parseInt(btn.dataset.size, 10);
                btn.classList.toggle('active', size === this.brushSize);
            });
        }
        this.updateCursorSize();
    }

    setMosaicIntensity(value) {
        this.mosaicIntensity = Math.min(100, Math.max(10, value));
        this.updateStrengthUI();
    }

    setBlurIntensity(value) {
        this.blurIntensity = Math.min(100, Math.max(10, value));
        this.updateStrengthUI();
    }

    updateStrengthUI() {
        const val = this.effectType === 'blur' ? this.blurIntensity : this.mosaicIntensity;
        const slider = document.getElementById('effect-strength-slider');
        const label = document.getElementById('effect-strength-val');
        if (slider) slider.value = String(val);
        if (label) label.textContent = `${val}%`;
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
        if (this.tool === 'magic-select') {
            return;
        }
        if (this.tool === 'poly') {
            this.handlePolygonMove(e);
        } else if (this.tool === 'rect') {
            this.handleSelectionMove(e);
        } else {
            this.handleBrushMove(e);
        }
    }

    handleMouseDown(e) {
        if (e.target !== this.canvas) return;
        if (e.button !== 0) return;

        if (this.tool === 'magic-select') {
            this.handleMagicClick(e);
            return;
        }

        if (this.autoBgActive) {
            this.autoBgActive = false;
            this.autoBgBaseIndex = null;
            this.updateContextCapsule();
        }

        if (this.tool === 'poly') {
            this.handlePolygonClick(e);
        } else if (this.tool === 'rect') {
            this.handleSelectionDown(e);
        } else {
            this.isDrawing = true;
            const pt = this.getCanvasCoordinates(e);
            this.lastDrawPoint = pt;
            this.applyBrushAt(pt.x, pt.y);
        }
    }

    handleMouseUp(e) {
        if (this.tool === 'magic-select' || this.tool === 'poly') {
            return;
        }

        if (this.tool === 'rect') {
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
    }

    handlePolygonClick(e) {
        const coords = this.getCanvasCoordinates(e);
        if (!this.isPolySelecting) {
            this.clearSelectionUI();
            this.isPolySelecting = true;
            this.polyPoints = [coords];
            this.polyHoverPoint = null;
            this.updatePolygonUI();
            this.updatePolyContextButtons();
            return;
        }

        if (this.isNearFirstPoint(coords) && this.polyPoints.length >= 3) {
            this.finalizePolygonSelection();
            return;
        }

        this.polyPoints.push(coords);
        this.updatePolygonUI();
        this.updatePolyContextButtons();
    }

    handleDoubleClick() {
        if (this.tool !== 'poly') return;
        if (this.polyPoints.length >= 3) {
            this.finalizePolygonSelection();
        }
    }

    undoLastPolygonPoint() {
        if (!this.isPolySelecting || this.polyPoints.length === 0) return;
        this.polyPoints.pop();
        if (this.polyPoints.length === 0) {
            this.clearPolygonUI();
        } else {
            this.updatePolygonUI();
        }
        this.updatePolyContextButtons();
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

    finalizePolygonSelection() {
        if (this.polyPoints.length < 3) return;
        const points = [...this.polyPoints];
        this.clearPolygonUI();
        this.updatePolyContextButtons();
        this.applySelection('poly', { points });
    }

    applySelection(kind, data) {
        const isInverse = this.selectionAreaMode === 'out';
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
        if (this.canvas) {
            this.canvas.style.cursor = this.tool === 'brush' ? 'none' : 'crosshair';
        }
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
            if (this.isCandidatesVisible) {
                this.clearCandidates();
            } else if (this.tool === 'magic-select' && this.magicSeedPoints.length > 0) {
                this.clearMagicSelection();
                this.updateContextCapsule();
            } else if (this.isPolySelecting || this.isSelecting) {
                this.clearSelectionUI();
                this.clearPolygonUI();
                this.updatePolyContextButtons();
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

        if ((key === 'backspace' || key === 'delete') && this.tool === 'poly' && this.isPolySelecting) {
            e.preventDefault();
            this.undoLastPolygonPoint();
            return;
        }

        if (key === 'enter' && this.tool === 'poly' && this.isPolySelecting && this.polyPoints.length >= 3) {
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
            this.setSelectionAreaMode('in');
            this.setTool('rect');
        } else if (key === 'o') {
            this.setSelectionAreaMode('out');
            this.setTool('rect');
        } else if (key === 'p' && e.shiftKey) {
            this.setSelectionAreaMode('out');
            this.setTool('poly');
        } else if (key === 'p') {
            this.setSelectionAreaMode('in');
            this.setTool('poly');
        } else if (key === 'a') {
            this.runAutoBackgroundEffect();
        } else if (key === 'w') {
            this.setTool('magic-select');
        } else if (key === 'f') {
            this.toggleCandidateDetection();
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
            this.autoBgActive = false;
            this.autoBgBaseIndex = null;
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
            this.updateContextCapsule();
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.autoBgActive = false;
            this.autoBgBaseIndex = null;
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
            this.updateContextCapsule();
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
        this.autoBgActive = false;
        this.autoBgBaseIndex = null;
        this.restoreState(this.history[0], () => {
            this.saveState();
            this.updateContextCapsule();
            this.showToast('最初の状態にリセットしました');
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
                this.showToast('✅ クリップボードにコピーしました');
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
                this.showToast('💾 保存しました');
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
        this.clearMagicSelection();
        this.clearCandidates();
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

    // --- AI / Auto-Assist Features ---

    setAutoSensitivity(value) {
        this.autoSensitivity = Math.min(95, Math.max(10, value));
        const slider = document.getElementById('sensitivity-slider');
        const label = document.getElementById('sensitivity-val');
        if (slider) slider.value = String(this.autoSensitivity);
        if (label) label.textContent = `${this.autoSensitivity}%`;

        if (this.tool === 'magic-select' && this.magicSeedPoints.length > 0) {
            this.updateMagicPreview();
        } else if (
            this.autoBgActive &&
            this.autoBgBaseIndex !== null &&
            this.historyIndex === this.autoBgBaseIndex + 1
        ) {
            this.reapplyAutoBackgroundFromBase();
        }
    }

    runAutoBackgroundEffect() {
        if (!this.canvas || !this.ctx) return;
        this.clearCandidates();
        if (this.tool === 'magic-select') {
            this.setTool('brush');
        }

        if (this.autoBgActive && this.autoBgBaseIndex !== null && this.historyIndex === this.autoBgBaseIndex + 1) {
            this.reapplyAutoBackgroundFromBase();
            return;
        }

        this.autoBgBaseIndex = this.historyIndex;
        const maskData = AutoDetector.segmentSubject(this.canvas, {
            sensitivity: this.autoSensitivity
        });

        ImageProcessor.applyEffectByMask(this.ctx, maskData, {
            effectType: this.effectType,
            isInverse: true,
            blockSize: this.getMosaicBlockSize(),
            blurAmount: this.getBlurAmount()
        });

        this.saveState();
        this.autoBgActive = true;
        this.updateContextCapsule();
        this.updateLayoutMetrics();
        const effectLabel = this.effectType === 'blur' ? 'ぼかし' : 'モザイク';
        this.showToast(`✨ 背景に${effectLabel}を適用しました（下のスライダーで微調整できます）`);
    }

    reapplyAutoBackgroundFromBase() {
        if (this.autoBgBaseIndex === null || !this.history[this.autoBgBaseIndex]) return;
        const seq = ++this.autoBgSeq;
        this.restoreState(this.history[this.autoBgBaseIndex], () => {
            if (seq !== this.autoBgSeq || !this.canvas || !this.ctx) return;
            const maskData = AutoDetector.segmentSubject(this.canvas, {
                sensitivity: this.autoSensitivity
            });
            ImageProcessor.applyEffectByMask(this.ctx, maskData, {
                effectType: this.effectType,
                isInverse: true,
                blockSize: this.getMosaicBlockSize(),
                blurAmount: this.getBlurAmount()
            });
            if (this.historyIndex < this.history.length) {
                this.history[this.historyIndex] = this.canvas.toDataURL();
            }
        });
    }

    handleMagicClick(e) {
        const pt = this.getCanvasCoordinates(e);
        if (e.altKey || this.magicClickMode === 'exclude') {
            this.magicExcludePoints.push(pt);
        } else {
            this.magicSeedPoints.push(pt);
        }
        this.updateMagicPreview();
    }

    updateMagicPreview() {
        if (!this.magicMaskCanvas || !this.canvas) return;
        if (this.magicSeedPoints.length === 0) {
            this.magicCurrentMask = null;
            this.magicMaskCanvas.style.display = 'none';
            this.updateMagicBarButtons();
            return;
        }

        const maskData = AutoDetector.segmentSubject(this.canvas, {
            seedPoints: this.magicSeedPoints,
            excludePoints: this.magicExcludePoints,
            sensitivity: this.autoSensitivity
        });
        this.magicCurrentMask = maskData;

        const { mask, width: mw, height: mh } = maskData;
        this.magicMaskCanvas.width = mw;
        this.magicMaskCanvas.height = mh;
        const mCtx = this.magicMaskCanvas.getContext('2d');
        const imgData = mCtx.createImageData(mw, mh);
        const data = imgData.data;

        for (let i = 0; i < mask.length; i++) {
            const p = i * 4;
            if (mask[i] === 1) {
                data[p] = 52;
                data[p + 1] = 168;
                data[p + 2] = 83;
                data[p + 3] = 115;
            } else {
                data[p + 3] = 0;
            }
        }
        mCtx.putImageData(imgData, 0, 0);

        const sx = mw / this.canvas.width;
        const sy = mh / this.canvas.height;
        for (const p of this.magicSeedPoints) {
            mCtx.beginPath();
            mCtx.arc(p.x * sx, p.y * sy, 4, 0, Math.PI * 2);
            mCtx.fillStyle = '#34a853';
            mCtx.fill();
            mCtx.lineWidth = 1.5;
            mCtx.strokeStyle = '#ffffff';
            mCtx.stroke();
        }
        for (const p of this.magicExcludePoints) {
            mCtx.beginPath();
            mCtx.arc(p.x * sx, p.y * sy, 4, 0, Math.PI * 2);
            mCtx.fillStyle = '#ea4335';
            mCtx.fill();
            mCtx.lineWidth = 1.5;
            mCtx.strokeStyle = '#ffffff';
            mCtx.stroke();
        }

        this.magicMaskCanvas.style.display = 'block';
        this.updateMagicBarButtons();
    }

    updateMagicBarButtons() {
        const hasMask = Boolean(this.magicCurrentMask);
        const hasPoints = this.magicSeedPoints.length > 0 || this.magicExcludePoints.length > 0;
        const btnOut = document.getElementById('magic-apply-out');
        const btnIn = document.getElementById('magic-apply-in');
        const btnClear = document.getElementById('magic-clear');
        if (btnOut) btnOut.disabled = !hasMask;
        if (btnIn) btnIn.disabled = !hasMask;
        if (btnClear) btnClear.disabled = !hasPoints;
    }

    applyMagicSelection(isInverse) {
        if (!this.magicCurrentMask) return;
        ImageProcessor.applyEffectByMask(this.ctx, this.magicCurrentMask, {
            effectType: this.effectType,
            isInverse,
            blockSize: this.getMosaicBlockSize(),
            blurAmount: this.getBlurAmount()
        });
        this.saveState();
        const effectLabel = this.effectType === 'blur' ? 'ぼかし' : 'モザイク';
        const areaLabel = isInverse ? '外側（背景）' : '選択部分';
        this.clearMagicSelection();
        this.setTool('brush');
        this.showToast(`✨ ${areaLabel}に${effectLabel}を適用しました`);
    }

    clearMagicSelection() {
        this.magicSeedPoints = [];
        this.magicExcludePoints = [];
        this.magicCurrentMask = null;
        if (this.magicMaskCanvas) {
            this.magicMaskCanvas.style.display = 'none';
            const mCtx = this.magicMaskCanvas.getContext('2d');
            if (mCtx) mCtx.clearRect(0, 0, this.magicMaskCanvas.width, this.magicMaskCanvas.height);
        }
        this.updateMagicBarButtons();
    }

    async toggleCandidateDetection() {
        if (this.isCandidatesVisible) {
            this.clearCandidates();
            return;
        }
        if (!this.canvas) return;

        this.autoBgActive = false;
        this.autoBgBaseIndex = null;
        if (this.tool === 'magic-select') {
            this.setTool('brush');
        }

        this.showToast('🔍 候補を検出中...');
        const candidates = await AutoDetector.detectCandidates(this.canvas);
        if (!this.overlay) return;

        if (!candidates || candidates.length === 0) {
            this.showToast('候補は見つかりませんでした');
            return;
        }

        this.candidatesList = candidates.map((c) => ({ ...c, applied: false }));
        this.isCandidatesVisible = true;
        document.getElementById('btn-detect-candidates')?.classList.add('active');
        this.renderCandidates();
        this.updateContextCapsule();
        this.updateLayoutMetrics();
        this.showToast(`🔍 ${this.candidatesList.length}件の候補が見つかりました（クリックで加工）`);
    }

    renderCandidates() {
        if (!this.candidatesContainer || !this.canvas) return;
        this.candidatesContainer.innerHTML = '';
        const cw = this.canvas.width || 1;
        const ch = this.canvas.height || 1;

        this.candidatesList.forEach((cand) => {
            const box = document.createElement('button');
            box.type = 'button';
            box.className = `candidate-box candidate-${cand.type}`;
            if (cand.applied) box.classList.add('applied');
            box.style.left = `${(cand.x / cw) * 100}%`;
            box.style.top = `${(cand.y / ch) * 100}%`;
            box.style.width = `${(cand.width / cw) * 100}%`;
            box.style.height = `${(cand.height / ch) * 100}%`;
            box.title = `${cand.label}（クリックして加工）`;

            const badge = document.createElement('span');
            badge.className = 'candidate-label';
            badge.textContent = cand.applied ? '✓ 加工済み' : cand.label;
            box.appendChild(badge);

            box.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.applyCandidateBox(cand, box);
            });

            this.candidatesContainer.appendChild(box);
        });
        this.candidatesContainer.style.display = 'block';
    }

    applyRectEffect(rect) {
        if (this.effectType === 'blur') {
            ImageProcessor.applyBlurToRect(this.ctx, rect, this.getBlurAmount());
        } else {
            ImageProcessor.applyMosaicToRect(this.ctx, rect, this.getMosaicBlockSize());
        }
    }

    applyCandidateBox(cand, boxEl) {
        if (cand.applied) return;
        this.autoBgActive = false;
        this.autoBgBaseIndex = null;

        this.applyRectEffect({ x: cand.x, y: cand.y, width: cand.width, height: cand.height });
        cand.applied = true;
        if (boxEl) {
            boxEl.classList.add('applied');
            const badge = boxEl.querySelector('.candidate-label');
            if (badge) badge.textContent = '✓ 加工済み';
        }
        this.saveState();
        this.updateCandidatesBar();
        const effectLabel = this.effectType === 'blur' ? 'ぼかし' : 'モザイク';
        this.showToast(`${cand.label} に${effectLabel}を適用しました`);
    }

    applyAllCandidates() {
        const pending = this.candidatesList.filter((c) => !c.applied);
        if (pending.length === 0) return;

        this.autoBgActive = false;
        this.autoBgBaseIndex = null;

        pending.forEach((cand) => {
            this.applyRectEffect({ x: cand.x, y: cand.y, width: cand.width, height: cand.height });
            cand.applied = true;
        });

        this.saveState();
        this.renderCandidates();
        this.updateCandidatesBar();
        const effectLabel = this.effectType === 'blur' ? 'ぼかし' : 'モザイク';
        this.showToast(`✨ ${pending.length}件すべてに${effectLabel}を適用しました`);
    }

    updateCandidatesBar() {
        const btnAll = document.getElementById('candidates-apply-all');
        if (!btnAll) return;
        const remaining = this.candidatesList.filter((c) => !c.applied).length;
        btnAll.textContent = remaining > 0 ? `✨ すべて一括加工 (${remaining}件)` : '✓ すべて加工済み';
        btnAll.disabled = remaining === 0;
    }

    clearCandidates() {
        this.isCandidatesVisible = false;
        this.candidatesList = [];
        document.getElementById('btn-detect-candidates')?.classList.remove('active');
        if (this.candidatesContainer) {
            this.candidatesContainer.innerHTML = '';
            this.candidatesContainer.style.display = 'none';
        }
        this.updateContextCapsule();
        this.updateLayoutMetrics();
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
