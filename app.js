// ==========================================
// 1. DOM要素の取得と初期設定
// ==========================================
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const container = document.querySelector('.canvas-container');

// ツールボタン群
const penBtn = document.getElementById('penBtn');
const eraserBtn = document.getElementById('eraserBtn');
const rectEraseBtn = document.getElementById('rectEraseBtn');
// 設定・アクションボタン群
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const undoBtn = document.getElementById('undoBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

// ==========================================
// 2. アプリケーションのグローバル状態（State）
// ==========================================
let eventLog = [];       // すべての操作（描画、消去、Undo）を記録するイベントの配列
let currentMode = 'pen'; // 現在選択されているツール ('pen' | 'eraser' | 'rectErase')
let isInteracting = false; // マウス押下中（操作中）かどうかを判定するフラグ
let currentPoints = [];  // 現在描画中のペンの座標履歴
let rectStart = null;    // 矩形消しゴムの開始座標を保持

// ==========================================
// 3. キャンバス設定とUI制御
// ==========================================

// ウィンドウサイズ変更時にキャンバスサイズを親要素に合わせ、再描画する
function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    redraw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // 初期化時に一度実行

// アクティブなツールボタンの見た目と、キャンバス上のカーソルを変更する
function setActiveTool(btn, mode, cursorClass) {
    // 全ボタンの非アクティブ化とカーソルクラスの初期化
    [penBtn, eraserBtn, rectEraseBtn].forEach(b => b.classList.remove('active'));
    canvas.classList.remove('eraser-mode', 'rect-erase-mode');

    // 選択されたツールをアクティブに設定
    btn.classList.add('active');
    currentMode = mode;
    if (cursorClass) canvas.classList.add(cursorClass);
}

// 各ツールボタンにクリックイベントを設定
penBtn.addEventListener('click', () => setActiveTool(penBtn, 'pen', ''));
eraserBtn.addEventListener('click', () => setActiveTool(eraserBtn, 'eraser', 'eraser-mode'));
rectEraseBtn.addEventListener('click', () => setActiveTool(rectEraseBtn, 'rectErase', 'rect-erase-mode'));

// ==========================================
// 4. ユーティリティ関数
// ==========================================

// 描画イベント用の一意なIDを生成する（タイムスタンプ＋ランダム文字列）
function generateId() {
    return 's:' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

// ISO8601形式で現在時刻のタイムスタンプを取得
function getTimestamp() {
    return new Date().toISOString();
}

// 座標群から「バウンディングボックス（最小・最大のXY座標）」を計算する関数
// ※これを事前計算しておくことで、消しゴム使用時の当たり判定を高速化する
function calculateBBox(points, padding) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
    };
}

// ==========================================
// 5. マウス操作と描画ロジック
// ==========================================

// マウスのボタンが押された時の処理（操作開始）
function startInteraction(e) {
    isInteracting = true;
    if (currentMode === 'pen') {
        // ペン描画の開始
        currentPoints = [{ x: e.offsetX, y: e.offsetY }];
        ctx.strokeStyle = colorPicker.value;
        ctx.lineWidth = brushSize.value;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(e.offsetX, e.offsetY);
    } else if (currentMode === 'eraser') {
        // ピンポイント消しゴムの実行
        eraseAt(e.offsetX, e.offsetY);
    } else if (currentMode === 'rectErase') {
        // 矩形消しゴムの開始位置を記録
        rectStart = { x: e.offsetX, y: e.offsetY };
    }
}

// マウスを動かしている時の処理（操作中）
function interact(e) {
    if (!isInteracting) return;

    if (currentMode === 'pen') {
        // ペンの軌跡を画面にリアルタイム描画し、座標を保存
        const x = e.offsetX;
        const y = e.offsetY;
        currentPoints.push({ x, y });
        ctx.lineTo(x, y);
        ctx.stroke();
    } else if (currentMode === 'eraser') {
        // ドラッグ中も連続して消しゴムを実行
        eraseAt(e.offsetX, e.offsetY);
    } else if (currentMode === 'rectErase') {
        // 矩形選択範囲をリアルタイムに描画して視覚的フィードバックを与える
        redraw(); // 過去の描画を復元して、赤い矩形が軌跡を残さないようにする
        const width = e.offsetX - rectStart.x;
        const height = e.offsetY - rectStart.y;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // 半透明の赤
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.fillRect(rectStart.x, rectStart.y, width, height);
        ctx.strokeRect(rectStart.x, rectStart.y, width, height);
    }
}

// マウスのボタンを離した、または画面外に出た時の処理（操作終了）
function stopInteraction(e) {
    if (!isInteracting) return;
    isInteracting = false;

    if (currentMode === 'pen' && currentPoints.length > 0) {
        // ペン操作終了時：イベントログに「描画(D)」イベントを記録する
        // ペンの太さに応じた余白を持たせてBBoxを計算
        const padding = parseFloat(brushSize.value) / 2 + 5;
        const bbox = calculateBBox(currentPoints, padding);

        eventLog.push({
            type: 'D', // Draw
            timestamp: getTimestamp(),
            id: generateId(),
            color: colorPicker.value,
            width: brushSize.value,
            bbox: bbox, // 計算したBBoxもログに含める
            pathString: pointsToBezierPath(currentPoints) // SVG互換のパス文字列に変換
        });
        redraw(); // 正規化されたパスで再描画
    } else if (currentMode === 'rectErase' && rectStart) {
        // 矩形消しゴム終了時：選択された範囲内の線を消去する処理を呼び出す
        const rectEnd = { x: e.offsetX, y: e.offsetY };
        const minX = Math.min(rectStart.x, rectEnd.x);
        const maxX = Math.max(rectStart.x, rectEnd.x);
        const minY = Math.min(rectStart.y, rectEnd.y);
        const maxY = Math.max(rectStart.y, rectEnd.y);

        eraseInRect(minX, minY, maxX, maxY);
        rectStart = null; // 状態をリセット
    }
    currentPoints = [];
}

// マウスイベントの登録
canvas.addEventListener('mousedown', startInteraction);
canvas.addEventListener('mousemove', interact);
canvas.addEventListener('mouseup', stopInteraction);
canvas.addEventListener('mouseout', stopInteraction);

// ==========================================
// 6. 消去（Eraser）ロジック
// ==========================================

// ピンポイント消しゴム処理
function eraseAt(x, y) {
    const { activeStrokes } = computeState();
    // 前面（後から描かれた線）から順に判定するため配列を反転
    const strokesArray = Array.from(activeStrokes.values()).reverse();

    for (let stroke of strokesArray) {
        // 1. 超高速なBBox判定（マウス座標がBBoxの四角形の外なら、即座に次の線へスキップ）
        if (x < stroke.bbox.minX || x > stroke.bbox.maxX || y < stroke.bbox.minY || y > stroke.bbox.maxY) {
            continue;
        }

        // 2. BBoxの中に入っている線だけ、重いパス判定（isPointInStroke）を走らせる
        const path = new Path2D(stroke.pathString);
        ctx.lineWidth = Math.max(stroke.width, 10); // 細い線でも消しやすくするため、最小幅を10に設定
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (ctx.isPointInStroke(path, x, y)) {
            // 消去イベントをログに記録し、再描画してループを抜ける（1クリックで1本の線のみ消す）
            eventLog.push({ type: 'E', timestamp: getTimestamp(), ids: [stroke.id] });
            redraw();
            break;
        }
    }
}

// 矩形範囲消しゴム処理
function eraseInRect(minX, minY, maxX, maxY) {
    const { activeStrokes } = computeState();
    let deletedIds = []; // 削除対象の線IDリスト

    activeStrokes.forEach(stroke => {
        // 1. 超高速なBBox判定（消しゴム矩形と線のBBoxが全く交差していなければスキップ）
        if (stroke.bbox.maxX < minX || stroke.bbox.minX > maxX || stroke.bbox.maxY < minY || stroke.bbox.minY > maxY) {
            return;
        }

        // 2. BBox同士が重なっている線だけ、正規表現で精密な座標チェックを行う
        const coords = stroke.pathString.match(/-?\d+(\.\d+)?/g);
        if (!coords) return;

        // パス文字列内の各頂点座標が、矩形内に含まれているかチェック
        for (let i = 0; i < coords.length; i += 2) {
            const px = parseFloat(coords[i]);
            const py = parseFloat(coords[i + 1]);
            if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                deletedIds.push(stroke.id);
                break; // 1つの頂点でも矩形内に入っていれば削除対象とし、次の線のチェックへ移行
            }
        }
    });

    // 削除対象があれば、まとめて「消去(E)」イベントとしてログに記録
    if (deletedIds.length > 0) {
        eventLog.push({ type: 'E', timestamp: getTimestamp(), ids: deletedIds });
        redraw();
    } else {
        redraw(); // 何も消さなかった場合も、赤い矩形を消すために再描画
    }
}

// 座標配列を滑らかなベジェ曲線（SVGのPath形式）に変換する
function pointsToBezierPath(points) {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const cp = points[i];
        // 次の点との中間地点を計算し、そこへ向かって二次ベジェ曲線を引く（滑らかにするための工夫）
        const endX = (points[i].x + points[i + 1].x) / 2;
        const endY = (points[i].y + points[i + 1].y) / 2;
        path += ` Q ${cp.x} ${cp.y} ${endX} ${endY}`;
    }
    // 最後の点へ直線をつなぐ
    const last = points[points.length - 1];
    path += ` L ${last.x} ${last.y}`;
    return path;
}

// ==========================================
// 7. イベントログの計算と画面の再描画 (Event Sourcing Core)
// ==========================================

// イベントログを最初から再生し、「現在画面に表示すべき線」と「Undo用の履歴」を計算する
function computeState() {
    let activeStrokes = new Map(); // 現在表示されている線を保持するMap (キー: ID, 値: 線のデータ)
    let actionStack = [];          // Undoを実現するためのアクション履歴

    for (let event of eventLog) {
        if (event.type === 'D') {
            // 描画：線をアクティブに追加し、履歴にも登録
            activeStrokes.set(event.id, event);
            actionStack.push({ type: 'D', id: event.id });
        } else if (event.type === 'E') {
            // 消去：指定された線をアクティブから削除し、復元できるようにデータごと履歴に保存
            const restoredStrokes = [];
            event.ids.forEach(id => {
                const target = activeStrokes.get(id);
                if (target) {
                    activeStrokes.delete(id);
                    restoredStrokes.push(target);
                }
            });
            actionStack.push({ type: 'E', restoredData: restoredStrokes });
        } else if (event.type === 'U') {
            // Undo：直前のアクションを履歴から取り出し、逆の操作を行う
            const lastAction = actionStack.pop();
            if (lastAction) {
                if (lastAction.type === 'D') {
                    activeStrokes.delete(lastAction.id); // 描画を取り消す（消す）
                } else if (lastAction.type === 'E') {
                    lastAction.restoredData.forEach(stroke => {
                        activeStrokes.set(stroke.id, stroke); // 消去を取り消す（復元する）
                    });
                }
            }
        }
    }
    return { activeStrokes };
}

// キャンバスをクリアし、現在の状態（activeStrokes）を描画し直す
function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const { activeStrokes } = computeState();

    activeStrokes.forEach(stroke => {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const path = new Path2D(stroke.pathString);
        ctx.stroke(path);
    });
}

// Undoボタンの処理：「取り消し(U)」イベントをログに追加し、再計算・再描画
undoBtn.addEventListener('click', () => {
    eventLog.push({ type: 'U', timestamp: getTimestamp() });
    redraw();
});

// ==========================================
// 8. .wbel ファイルのエクスポートとインポート
// ==========================================

// 履歴を出力（エクスポート）
exportBtn.addEventListener('click', () => {
    if (eventLog.length === 0) {
        alert("出力する履歴がありません。");
        return;
    }

    // イベントログをカンマ区切りのテキスト（CSVライクな形式）に変換
    let textData = eventLog.map(e => {
        if (e.type === 'D') {
            // 小数点以下を丸めてファイルサイズを節約する
            const bx1 = Math.round(e.bbox.minX);
            const by1 = Math.round(e.bbox.minY);
            const bx2 = Math.round(e.bbox.maxX);
            const by2 = Math.round(e.bbox.maxY);
            return `D,${e.timestamp},${e.id},${e.color},${e.width},${bx1},${by1},${bx2},${by2},${e.pathString}`;
        }
        if (e.type === 'E') return `E,${e.timestamp},${e.ids.join(';')}`; // 複数IDはセミコロン区切り
        if (e.type === 'U') return `U,${e.timestamp}`;
    }).join('\n'); // 1イベント1行に結合

    // テキストデータをBlobに変換し、ダミーのaタグを使ってダウンロードを実行
    const blob = new Blob([textData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whiteboard_events.wbel';
    a.click();
    URL.revokeObjectURL(url);
});

// ファイル選択ダイアログを開く
importBtn.addEventListener('click', () => {
    importFile.click();
});

// 履歴の読み込み（インポート）
importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const lines = event.target.result.split('\n');
        eventLog = []; // 既存のログをクリア

        lines.forEach(line => {
            if (!line.trim()) return; // 空行はスキップ
            const parts = line.split(',');
            const type = parts[0];
            const timestamp = parts[1];

            // 読み込んだ行のタイプに合わせてオブジェクトを再構築し、ログに追加
            if (type === 'D' && parts.length >= 10) {
                const bbox = {
                    minX: parseFloat(parts[5]),
                    minY: parseFloat(parts[6]),
                    maxX: parseFloat(parts[7]),
                    maxY: parseFloat(parts[8])
                };
                // パス文字列自体の中にカンマが含まれている可能性があるため、インデックス9以降を再結合
                const pathString = parts.slice(9).join(',');
                eventLog.push({
                    type: 'D', timestamp, id: parts[2], color: parts[3], width: parseFloat(parts[4]), bbox, pathString
                });
            } else if (type === 'E' && parts.length >= 3) {
                const ids = parts[2].split(';');
                eventLog.push({ type: 'E', timestamp, ids });
            } else if (type === 'U' && parts.length >= 2) {
                eventLog.push({ type: 'U', timestamp });
            }
        });

        redraw(); // 読み込んだログを元に画面を再構築
        importFile.value = ''; // 同じファイルを連続で読み込めるようにリセット
    };
    reader.readAsText(file);
});