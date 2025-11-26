document.addEventListener('DOMContentLoaded', () => {
    // --- State & Constants ---
    const TILE_SIZE = 32, GRID_HEIGHT = 14;
    let allLevelsData = {}, currentEditingLevel = 1, selectedChar = '#', toolMode = 'pencil';
    let isMouseDown = false, startPos = { x: 0, y: 0 };
    let selection = { active: false, x1: 0, y1: 0, x2: 0, y2: 0 };
    let clipboard = null, isDraggingSelection = false;

    // --- DOM Elements ---
    const canvas = document.getElementById('editorCanvas'), ctx = canvas.getContext('2d');
    const toolModeBtns = document.querySelectorAll('.tool-mode-btn'), toolItems = document.querySelectorAll('.tool-item');
    const levelTabs = document.querySelectorAll('.level-tab'), levelIndicator = document.getElementById('current-level-indicator');
    const widthInput = document.getElementById('grid-width'), resizeBtn = document.getElementById('btn-resize');
    const deleteSelectionBtn = document.getElementById('btn-delete-selection'), selectionInfo = document.getElementById('selection-info');
    const pasteArea = document.getElementById('paste-area'), loadFromPasteBtn = document.getElementById('btn-load-from-paste');
    const loadFeedback = document.getElementById('load-feedback');
    const generateBtn = document.getElementById('btn-generate'), copyBtn = document.getElementById('btn-copy');
    const outputArea = document.getElementById('output-code'), copyFeedback = document.getElementById('copy-feedback');

    const OBJECT_COLORS = { '#': 'rgba(0, 255, 255, 0.7)', '^': 'rgba(255, 0, 0, 0.8)', 'v': 'rgba(255, 100, 100, 0.8)','J': 'rgba(255, 255, 0, 0.9)', 'O': 'rgba(255, 255, 0, 0.5)', 'S': 'rgba(0, 255, 0, 0.5)','C': 'rgba(255, 128, 0, 0.5)', 'V': 'rgba(255, 0, 255, 0.5)', 'N': 'rgba(255, 255, 0, 0.5)','G': 'rgba(255, 255, 0, 0.4)' };
    
    // --- Main Logic ---
    function init() {
        for (let i = 1; i <= 3; i++) allLevelsData[i] = { width: 100, data: createEmptyGridData(100) };
        setupEventListeners();
        switchLevel(1);
    }

    function setupEventListeners() {
        toolModeBtns.forEach(btn => btn.addEventListener('click', () => setToolMode(btn.dataset.mode)));
        toolItems.forEach(item => item.addEventListener('click', () => {
            toolItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedChar = item.dataset.char;
        }));
        levelTabs.forEach(tab => tab.addEventListener('click', () => switchLevel(parseInt(tab.dataset.level))));
        resizeBtn.addEventListener('click', resizeCurrentLevel);
        deleteSelectionBtn.addEventListener('click', deleteSelected);
        loadFromPasteBtn.addEventListener('click', handlePasteLoad);
        generateBtn.addEventListener('click', generateFullCode);
        copyBtn.addEventListener('click', copyToClipboard);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('keydown', (e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && selection.active) deleteSelected(); });
    }

    // --- Load from Paste ---
    function handlePasteLoad() {
        const content = pasteArea.value;
        if (!content.trim()) { loadFeedback.textContent = '❌ テキストエリアが空です。'; loadFeedback.style.color = '#e94560'; return; }
        try {
            const parsedLevels = parseLevelsJs(content);
            for (const levelIndex in parsedLevels) {
                if (allLevelsData.hasOwnProperty(levelIndex)) {
                    allLevelsData[levelIndex] = parsedLevels[levelIndex];
                }
            }
            switchLevel(currentEditingLevel);
            loadFeedback.textContent = '✅ 貼り付けた内容を正常に読み込みました。';
            loadFeedback.style.color = '#0f0';
        } catch (error) {
            loadFeedback.textContent = `❌ ${error.message}`;
            loadFeedback.style.color = '#e94560';
        }
    }

    function parseLevelsJs(content) {
        const parsedData = {};
        for (let i = 1; i <= 3; i++) {
            const levelBlockRegex = new RegExp(`const\\s+CUSTOM_LEVEL_${i}\\s*=\\s*\\[([\\s\\S]*?)\\];?`);
            const blockMatch = content.match(levelBlockRegex);

            if (blockMatch && typeof blockMatch[1] === 'string') {
                const blockContent = blockMatch[1];
                const lineRegex = /["'](.*?)["']/g;
                const lines = [];
                let lineMatch;
                while ((lineMatch = lineRegex.exec(blockContent)) !== null) {
                    lines.push(lineMatch[1]);
                }
                
                if (lines.length > 0) {
                    const width = lines[0].length;
                    const isValid = lines.every(line => line.length === width);
                    if (isValid) {
                        // ★★★ FIX: Convert immutable strings to a mutable 2D array for editing ★★★
                        const dataAsArrays = lines.map(line => line.split(''));
                        parsedData[i] = { data: dataAsArrays, width: width };
                    } else { throw new Error(`レベル ${i} のデータが不正です（行の長さが異なります）。`); }
                } else if (blockContent.trim() === '') {
                    parsedData[i] = { data: createEmptyGridData(100), width: 100 };
                }
            }
        }
        if (Object.keys(parsedData).length === 0) throw new Error("カスタムレベルのデータが見つかりません。");
        return parsedData;
    }

    // --- State & UI Updates ---
    function setToolMode(mode) { toolMode = mode; toolModeBtns.forEach(btn => btn.classList.toggle('selected', btn.dataset.mode === mode)); clearSelection(); updateCursor(); }
    function switchLevel(level) { currentEditingLevel = level; levelTabs.forEach(tab => tab.classList.toggle('selected', parseInt(tab.dataset.level) === level)); levelIndicator.textContent = level; widthInput.value = allLevelsData[level].width; canvas.width = allLevelsData[level].width * TILE_SIZE; canvas.height = GRID_HEIGHT * TILE_SIZE; clearSelection(); draw(); }
    
    function resizeCurrentLevel() {
        // ★★★ FIX: Resize now preserves existing content ★★★
        const newWidth = parseInt(widthInput.value);
        if (newWidth < 20 || newWidth > 1000) { alert('幅は20から1000の間で設定してください。'); return; }
        const current = allLevelsData[currentEditingLevel];
        const oldData = current.data;
        const oldWidth = current.width;
        const newData = createEmptyGridData(newWidth);
        const copyWidth = Math.min(oldWidth, newWidth);

        if (oldData && oldData.length === GRID_HEIGHT) {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                for (let x = 0; x < copyWidth; x++) {
                    if(oldData[y] && oldData[y][x]) { newData[y][x] = oldData[y][x]; }
                }
            }
        }
        allLevelsData[currentEditingLevel] = { width: newWidth, data: newData };
        switchLevel(currentEditingLevel);
    }

    // --- Mouse & Drawing Logic ---
    function handleMouseDown(e) { isMouseDown = true; startPos = getMouseGridPos(e); if (toolMode === 'select') { if (selection.active && isPosInSelection(startPos)) { isDraggingSelection = true; copySelectionToClipboard(); } else { clearSelection(); selection.active = true; selection.x1 = startPos.x; selection.y1 = startPos.y; } } }
    function handleMouseMove(e) { if (!isMouseDown) return; const currentPos = getMouseGridPos(e); updateCursor(e); switch (toolMode) { case 'pencil': placeObject(currentPos.x, currentPos.y, selectedChar); break; case 'rectangle': case 'select': if (!isDraggingSelection) { selection.x2 = currentPos.x; selection.y2 = currentPos.y; } break; } draw(); }
    function handleMouseUp(e) { if (!isMouseDown) return; isMouseDown = false; const endPos = getMouseGridPos(e); switch (toolMode) { case 'rectangle': applyRectangle(selectedChar); clearSelection(false); break; case 'select': if (isDraggingSelection) { pasteClipboard(endPos); } isDraggingSelection = false; updateSelectionUI(); break; } draw(); }
    function handleMouseLeave() { if (isMouseDown) { handleMouseUp({ offsetX: lastMousePos.x, offsetY: lastMousePos.y }); } }
    function placeObject(x, y, char) { const grid = allLevelsData[currentEditingLevel].data; if (y >= 0 && y < GRID_HEIGHT && grid.length > 0 && x >= 0 && x < grid[0].length) { grid[y][x] = char; } }
    function applyRectangle(char) { const { x1, y1, x2, y2 } = getNormalizedSelection(); for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) placeObject(x, y, char); }
    function clearSelection(fullClear = true) { selection.active = false; if (fullClear) clipboard = null; updateSelectionUI(); }
    function copySelectionToClipboard() { const { x1, y1, x2, y2 } = getNormalizedSelection(); clipboard = { data: [], width: x2 - x1 + 1, height: y2 - y1 + 1, start: startPos }; const grid = allLevelsData[currentEditingLevel].data; for (let y = y1; y <= y2; y++) clipboard.data.push(grid[y].slice(x1, x2 + 1)); }
    function pasteClipboard(endPos) { if (!clipboard) return; const grid = allLevelsData[currentEditingLevel].data; const { x1, y1, x2, y2 } = getNormalizedSelection(); for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) grid[y][x] = ' '; const dx = endPos.x - clipboard.start.x, dy = endPos.y - clipboard.start.y; for (let y = 0; y < clipboard.height; y++) for (let x = 0; x < clipboard.width; x++) { const char = clipboard.data[y][x]; if (char !== ' ') placeObject(x1 + x + dx, y1 + y + dy, char); } selection.x1 += dx; selection.y1 += dy; selection.x2 += dx; selection.y2 += dy; }
    function deleteSelected() { if (!selection.active) return; const { x1, y1, x2, y2 } = getNormalizedSelection(); const grid = allLevelsData[currentEditingLevel].data; for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) grid[y][x] = ' '; clearSelection(); draw(); }
    function draw() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawGrid(); drawObjects(); if (isMouseDown && (toolMode === 'rectangle' || (toolMode === 'select' && !isDraggingSelection))) { drawSelectionBox(selection, 'rgba(0, 100, 255, 0.3)'); } else if (selection.active && !isDraggingSelection) { drawSelectionBox(selection, 'rgba(0, 100, 255, 0.5)'); } if (isDraggingSelection) { const currentPos = getMouseGridPos({ offsetX: lastMousePos.x, offsetY: lastMousePos.y }); const dx = currentPos.x - startPos.x, dy = currentPos.y - startPos.y; drawGhost(dx, dy); } }
    function drawObjects() { const level = allLevelsData[currentEditingLevel]; if (!level || !level.data || level.data.length !== GRID_HEIGHT) return; const grid = level.data; for (let r = 0; r < GRID_HEIGHT; r++) { for (let c = 0; c < level.width; c++) { const char = grid[r] ? grid[r][c] : ' '; if (char && char !== ' ') drawTile(c, r, char, 1.0); } } }
    function drawGhost(dx, dy) { if (!clipboard) return; const { x1, y1 } = getNormalizedSelection(); for (let y = 0; y < clipboard.height; y++) for (let x = 0; x < clipboard.width; x++) { const char = clipboard.data[y][x]; if (char !== ' ') drawTile(x1 + x + dx, y1 + y + dy, char, 0.5); } }
    function drawTile(x, y, char, alpha) { ctx.globalAlpha = alpha; ctx.fillStyle = OBJECT_COLORS[char] || '#fff'; const px = x * TILE_SIZE, py = y * TILE_SIZE; if (char === '^') { ctx.beginPath(); ctx.moveTo(px, py + TILE_SIZE); ctx.lineTo(px + TILE_SIZE / 2, py); ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE); ctx.fill(); } else if (char === 'v') { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE); ctx.lineTo(px + TILE_SIZE, py); ctx.fill(); } else if (char === 'J') { ctx.fillRect(px + 4, py + TILE_SIZE * 0.7, TILE_SIZE - 8, TILE_SIZE * 0.3); } else if (char === 'O') { ctx.beginPath(); ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 2 - 4, 0, Math.PI * 2); ctx.stroke(); ctx.fill(); } else if (char === 'G') { ctx.fillRect(px + TILE_SIZE * 0.25, py, TILE_SIZE * 0.5, TILE_SIZE); } else { ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4); } ctx.globalAlpha = 1.0; }
    function drawGrid() { ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1; for (let x = 0; x <= canvas.width; x += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); } for (let y = 0; y <= canvas.height; y += TILE_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); } }
    function drawSelectionBox(sel, color) { const { x1, y1, x2, y2 } = getNormalizedSelection(); const x = x1 * TILE_SIZE, y = y1 * TILE_SIZE, w = (x2 - x1 + 1) * TILE_SIZE, h = (y2 - y1 + 1) * TILE_SIZE; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)'; ctx.strokeRect(x, y, w, h); }
    let lastMousePos = { x: 0, y: 0 }; 
    function updateCursor(e) { const pos = e ? getMouseGridPos(e) : getMouseGridPos({offsetX: lastMousePos.x, offsetY: lastMousePos.y}); if (toolMode === 'select' && selection.active && isPosInSelection(pos)) { canvas.style.cursor = 'move'; } else if (toolMode === 'pencil') { canvas.style.cursor = 'crosshair'; } else { canvas.style.cursor = 'default'; } }
    canvas.addEventListener('mousemove', e => { lastMousePos = { x: e.offsetX, y: e.offsetY }; updateCursor(e); });
    function getMouseGridPos(e) { return { x: Math.floor(e.offsetX / TILE_SIZE), y: Math.floor(e.offsetY / TILE_SIZE) }; }
    function isPosInSelection(pos) { const { x1, y1, x2, y2 } = getNormalizedSelection(); return pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2; }
    function getNormalizedSelection() { const x1 = Math.min(selection.x1, selection.x2), y1 = Math.min(selection.y1, selection.y2), x2 = Math.max(selection.x1, selection.x2), y2 = Math.max(selection.y1, selection.y2); return { x1, y1, x2, y2 }; }
    function updateSelectionUI() { deleteSelectionBtn.disabled = !selection.active; if (selection.active) { const { x1, y1, x2, y2 } = getNormalizedSelection(); selectionInfo.textContent = `範囲: (${x1}, ${y1}) - (${x2}, ${y2})`; } else { selectionInfo.textContent = '「選択」モードで範囲を指定してください'; } }
    
    function generateFullCode() {
        // ★★★ FIX: Use join('') to convert the internal 2D character array back to strings for output ★★★
        const customLevelsStrings = {}; 
        for (let i = 1; i <= 3; i++) { 
            const level = allLevelsData[i]; 
            let lines = ''; 
            if (level && Array.isArray(level.data)) { 
                lines = level.data.map(row => `    "${row.join('')}"`).join(',\n'); 
            } 
            customLevelsStrings[i] = `const CUSTOM_LEVEL_${i} = [\n${lines}\n];`; 
        } 
        const levelsTemplate = `/**\n * Level Data - Generated by Stage Editor\n */\nconst H = 14; \nfunction joinChunks(chunks) {\n    let result = new Array(H).fill("");\n    chunks.forEach(chunk => {\n        for (let i = 0; i < H; i++) {\n            const line = (i < chunk.length) ? chunk[i] : " ".repeat(chunk[0]?.length || 10);\n            result[i] += line;\n        }\n    });\n    return result;\n}\n// CUSTOM LEVEL DATA\n${customLevelsStrings[1]}\n${customLevelsStrings[2]}\n${customLevelsStrings[3]}\n\n// COMMON PARTS\nconst FLAT = ["               ", "               ", "               ", "               ", "               ", "               ", "               ", "               ", "               ", "               ", "               ", "               ", "               ", "               "];\n\n// LEVEL BUILDER\nfunction getLevelMap(levelIndex) {\n    let parts = [];\n    parts.push(FLAT, FLAT);\n    if (levelIndex === 1) {\n        parts.push(CUSTOM_LEVEL_1);\n    } else if (levelIndex === 2) {\n        parts.push(CUSTOM_LEVEL_2);\n    } else {\n        parts.push(CUSTOM_LEVEL_3);\n    }\n    return joinChunks(parts);\n}\n`; 
        outputArea.value = levelsTemplate.trim(); 
        copyFeedback.textContent = '✅ levels.js の全コードが生成されました。'; 
    }
    
    function copyToClipboard() { if (!outputArea.value) { copyFeedback.textContent = '先にコードを生成してください。'; return; } outputArea.select(); document.execCommand('copy'); copyFeedback.textContent = '✅ クリップボードにコピーしました！'; setTimeout(() => { copyFeedback.textContent = ''; }, 2000); }
    
    function createEmptyGridData(width) {
        // ★★★ FIX: Ensure the internal data is a mutable 2D array of characters ★★★
        return Array.from({ length: GRID_HEIGHT }, () => Array(width > 0 ? width : 1).fill(' '));
    }
    
    // --- Run ---
    init();
});