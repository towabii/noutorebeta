import * as THREE from 'three';

// --- グローバル変数・定数 ---------------------------------
let scene, camera, renderer, clock;
let obstacle, exitSign, doors = [], posters = [];
const keys = {};

// ゲームの状態管理
let currentExit = 0;
let anomalyType = 'NONE'; // 'NONE', 'OBSTACLE', 'POSTER'
let gameActive = false;

// プレイヤー設定
const player = {
    height: 1.6,
    normalSpeed: 0.08,
    runSpeed: 0.14,
    turnSpeed: 0.002,
    keyTurnSpeed: 0.02
};

// 通路設定
const corridor = {
    width: 6,
    straightLength: 25,
    turnLength: 20,
    wallHeight: 3.5,
    wallThickness: 0.2 // ▼▼▼ 修正点：壁の厚みを定義 ▼▼▼
};

// UI要素
const startScreen = document.getElementById('start-screen');
const uiContainer = document.getElementById('ui-container');
const exitNumberUI = document.getElementById('exit-number');

// テクスチャ管理
const textureLoader = new THREE.TextureLoader();
const posterTextures = { normal: [], anomaly: [] };
const exitSignTextures = [];

// --- 初期化 -----------------------------------------------
function preloadTextures() {
    for (let i = 1; i <= 6; i++) {
        posterTextures.normal.push(textureLoader.load(`img/pos${i}.jpg`));
        posterTextures.anomaly.push(textureLoader.load(`img/ipos${i}.jpg`));
    }
    for (let i = 0; i <= 7; i++) {
        exitSignTextures.push(textureLoader.load(`img/${i}.jpg`));
    }
}

function init() {
    clock = new THREE.Clock();
    preloadTextures();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // ▼▼▼ 修正点：初期位置を判定エリアから離す ▼▼▼
    camera.position.set(0, player.height, corridor.straightLength / 2 - 3);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    createEnvironment();
    createPosters();
    createDoors();
    createExitSign();
    createObstacle();
    setupEventListeners();
    
    animate();
}

// --- 環境作成 ---------------------------------------------
function createEnvironment() {
    // マテリアル
    const wallTexture = textureLoader.load('img/wall.jpg');
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    const floorTexture = textureLoader.load('img/floor.jpg');
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    
    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture });
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    
    // 床
    const floorShape = new THREE.Shape([
        new THREE.Vector2(-corridor.width/2, corridor.straightLength/2),
        new THREE.Vector2(corridor.width/2, corridor.straightLength/2),
        new THREE.Vector2(corridor.width/2, -corridor.straightLength/2),
        new THREE.Vector2(-corridor.width/2 - corridor.turnLength, -corridor.straightLength/2),
        new THREE.Vector2(-corridor.width/2 - corridor.turnLength, -corridor.straightLength/2 + corridor.width),
        new THREE.Vector2(-corridor.width/2, -corridor.straightLength/2 + corridor.width)
    ]);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(floorShape), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // 天井
    const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(floorShape), ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = corridor.wallHeight;
    scene.add(ceiling);

    // ▼▼▼ 修正点：壁を厚みのあるBoxGeometryに変更して隙間をなくす ▼▼▼
    // 後ろの壁
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(corridor.width, corridor.wallHeight, corridor.wallThickness), wallMaterial);
    backWall.position.set(0, corridor.wallHeight / 2, corridor.straightLength / 2 + corridor.wallThickness/2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // 直進通路の右壁
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(corridor.straightLength, corridor.wallHeight, corridor.wallThickness), wallMaterial);
    rightWall.position.set(corridor.width / 2 + corridor.wallThickness/2, corridor.wallHeight / 2, 0);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);
    
    // L字の外側の壁 (2パーツ)
    const outerWall1 = new THREE.Mesh(new THREE.BoxGeometry(corridor.straightLength / 2, corridor.wallHeight, corridor.wallThickness), wallMaterial);
    outerWall1.position.set(-corridor.width/2 - corridor.wallThickness/2, corridor.wallHeight/2, corridor.straightLength/4);
    outerWall1.rotation.y = Math.PI/2;
    outerWall1.receiveShadow = true;
    scene.add(outerWall1);
    
    const outerWall2 = new THREE.Mesh(new THREE.BoxGeometry(corridor.turnLength + corridor.width/2 + corridor.wallThickness, corridor.wallHeight, corridor.wallThickness), wallMaterial);
    outerWall2.position.set(-corridor.width/2 - corridor.turnLength/2, corridor.wallHeight/2, -corridor.straightLength/2 - corridor.wallThickness/2);
    outerWall2.receiveShadow = true;
    scene.add(outerWall2);
    
    // L字の内側の壁
    const innerWall = new THREE.Mesh(new THREE.BoxGeometry(corridor.turnLength, corridor.wallHeight, corridor.wallThickness), wallMaterial);
    innerWall.position.set(-corridor.width/2 - corridor.turnLength/2, corridor.wallHeight/2, -corridor.straightLength/2 + corridor.width + corridor.wallThickness/2);
    innerWall.receiveShadow = true;
    scene.add(innerWall);
    
    // 行き止まりの壁
    const farWall = new THREE.Mesh(new THREE.BoxGeometry(corridor.width, corridor.wallHeight, corridor.wallThickness), wallMaterial);
    farWall.position.set(-corridor.width/2 - corridor.turnLength - corridor.wallThickness/2, corridor.wallHeight/2, -corridor.straightLength/2 + corridor.width/2);
    farWall.rotation.y = Math.PI/2;
    farWall.receiveShadow = true;
    scene.add(farWall);

    // 照明
    for (let z = 10; z > -12; z -= 8) {
        const light = new THREE.PointLight(0xffffff, 0.7, 15);
        light.position.set(0, corridor.wallHeight - 0.5, z);
        light.castShadow = true;
        scene.add(light);
    }
    for (let x = -5; x > -20; x -= 8) {
        const light = new THREE.PointLight(0xffffff, 0.7, 15);
        light.position.set(x, corridor.wallHeight - 0.5, -corridor.straightLength / 2 + 2);
        light.castShadow = true;
        scene.add(light);
    }
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);
}

function createPosters() {
    for (let i = 0; i < 6; i++) {
        const poster = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1.5),
            new THREE.MeshBasicMaterial({ map: posterTextures.normal[i] })
        );
        // ▼▼▼ 修正点：左壁に配置 ▼▼▼
        poster.position.set(
            corridor.width / 2 - 0.01,
            player.height,
            (corridor.straightLength / 2) - 5 - (i * 4)
        );
        poster.rotation.y = -Math.PI / 2;
        posters.push(poster);
        scene.add(poster);
    }
}

function createDoors() {
    const geo = new THREE.PlaneGeometry(2, 3);
    const mat = new THREE.MeshStandardMaterial({ map: textureLoader.load('img/door.jpg') });
    
    const startDoor = new THREE.Mesh(geo, mat);
    startDoor.position.set(0, 1.5, corridor.straightLength / 2 + 0.01);
    startDoor.rotation.y = Math.PI;
    scene.add(startDoor);

    const endDoor = new THREE.Mesh(geo, mat);
    // ▼▼▼ 修正点：左折した先のドア位置 ▼▼▼
    endDoor.position.set(-corridor.turnLength, 1.5, -corridor.straightLength / 2 + corridor.width / 2 - 0.01);
    scene.add(endDoor);
}

function createExitSign() {
    const geo = new THREE.PlaneGeometry(0.8, 0.8);
    const mat = new THREE.MeshBasicMaterial({ map: exitSignTextures[0] });
    exitSign = new THREE.Mesh(geo, mat);
    // ▼▼▼ 修正点：左折の角に配置 ▼▼▼
    exitSign.position.set(-corridor.width / 2 + 0.01, corridor.wallHeight - 1, -corridor.straightLength / 2 + 2);
    exitSign.rotation.y = Math.PI / 2;
    scene.add(exitSign);
}

function createObstacle() {
    obstacle = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.8, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    obstacle.position.y = 1.8 / 2;
    obstacle.castShadow = true;
    scene.add(obstacle);
}

// --- イベントリスナー ---------------------------------------
function setupEventListeners() {
    startScreen.addEventListener('click', startGame, { once: true });
    document.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    document.addEventListener('mousemove', (e) => {
        if (gameActive && document.pointerLockElement) {
            camera.rotation.y -= e.movementX * player.turnSpeed;
            camera.rotation.x -= e.movementY * player.turnSpeed;
            camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        }
    });
}

// --- ゲームロジック -----------------------------------------
function startGame() {
    gameActive = true;
    startScreen.style.display = 'none';
    uiContainer.classList.remove('hidden');
    document.body.requestPointerLock();
    // ▼▼▼ 修正点：開始時に必ず0番からスタートさせる ▼▼▼
    currentExit = 0; 
    resetRound();
}

function resetRound() {
    camera.position.set(0, player.height, corridor.straightLength / 2 - 3);
    camera.rotation.set(0, 0, 0);

    obstacle.position.set(0, 1.8 / 2, -corridor.straightLength/2);
    obstacle.material.color.set(0xffffff);

    posters.forEach((p, i) => { p.material.map = posterTextures.normal[i]; });

    const rand = Math.random();
    if (rand < 0.33) {
        anomalyType = 'OBSTACLE';
        obstacle.material.color.set(0xff0000);
    } else if (rand < 0.66) {
        anomalyType = 'POSTER';
        const idx = Math.floor(Math.random() * 6);
        posters[idx].material.map = posterTextures.anomaly[idx];
    } else {
        anomalyType = 'NONE';
    }
    updateUI();
}

function checkJudgment(isForward) {
    const hasAnomaly = (anomalyType !== 'NONE');
    const correct = (isForward && !hasAnomaly) || (!isForward && hasAnomaly);
    
    currentExit = correct ? currentExit + 1 : 0;
    
    if (currentExit >= 7) {
        gameActive = false;
        document.exitPointerLock();
        alert("クリア！7番出口です。おめでとうございます！");
        location.reload();
    } else {
        resetRound();
    }
}

function updateUI() {
    exitNumberUI.textContent = currentExit;
    exitSign.material.map = exitSignTextures[currentExit];
}

// --- アニメーションループ ---------------------------------
function update() {
    if (!gameActive) return;

    // ▼▼▼ 修正点：矢印キーでの視点操作 ▼▼▼
    if (keys['arrowleft']) camera.rotation.y += player.keyTurnSpeed;
    if (keys['arrowright']) camera.rotation.y -= player.keyTurnSpeed;
    if (keys['arrowup']) camera.rotation.x += player.keyTurnSpeed;
    if (keys['arrowdown']) camera.rotation.x -= player.keyTurnSpeed;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x)); // 縦回転の制限

    const speed = keys['shift'] ? player.runSpeed : player.normalSpeed;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    // ▼▼▼ 修正点：ADキーでの左右移動（ストレイフ） ▼▼▼
    const right = new THREE.Vector3();
    right.crossVectors(camera.up, direction).normalize();

    if (keys['w']) camera.position.addScaledVector(direction, speed);
    if (keys['s']) camera.position.addScaledVector(direction, -speed);
    if (keys['a']) camera.position.addScaledVector(right, speed);
    if (keys['d']) camera.position.addScaledVector(right, -speed);

    // 当たり判定
    const p = camera.position;
    const halfWidth = corridor.width / 2 - 0.5;
    if (p.z > -corridor.straightLength / 2) { // 直線部分
        p.x = Math.max(-halfWidth, Math.min(halfWidth, p.x));
    } else { // コーナー以降
        p.z = Math.max(-corridor.straightLength / 2, p.z);
        p.x = Math.min(halfWidth, p.x);
        if (p.x < -halfWidth) {
             p.z = Math.max(-corridor.straightLength / 2, Math.min(-corridor.straightLength / 2 + corridor.width - 0.5, p.z));
        }
    }
    
    // 障害物の移動
    obstacle.position.z += 0.05;
    if (obstacle.position.z > corridor.straightLength / 2) {
        obstacle.position.z = -corridor.straightLength/2;
    }
    
    // 判定エリア
    // ▼▼▼ 修正点：左折後の判定エリア ▼▼▼
    if (p.x < -corridor.turnLength + 2 && p.z < -corridor.straightLength/2 + corridor.width) { 
        checkJudgment(true);
    } else if (p.z > corridor.straightLength / 2 - 1) { 
        checkJudgment(false);
    }
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// --- 実行 -------------------------------------------------
init();``