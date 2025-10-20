let accessToken = null;
let latestJson = null;

function handleCredentialResponse(response) {
  console.log("Googleログイン成功");
  requestAccessToken();
}

function requestAccessToken() {
  google.accounts.oauth2.initTokenClient({
    client_id: '479474446026-kej6f40kvfm6dsuvfeo5d4fm87c6god4.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (tokenResponse) => {
      accessToken = tokenResponse.access_token;
      console.log("アクセストークン取得済");
      updateFileSelect();
    }
  }).requestAccessToken();
}

document.addEventListener("DOMContentLoaded", () => {
  const uploadHeader = document.getElementById("upload-header");
  const uploadContainer = document.getElementById("upload-container");
  const resultHeader = document.getElementById("result-header");
  const resultContainer = document.getElementById("result-container");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const previewImg = document.getElementById("preview");
  const resultPre = document.getElementById("result");
  const saveBtn = document.getElementById("saveBtn");
  const loadBtn = document.getElementById("loadBtn");

  const filenameInput = document.getElementById("filenameInput");
  const fileSelect = document.getElementById("fileSelect");

  analyzeBtn.addEventListener("click", analyzeImage);

  function openContainer(container) {
    container.classList.remove("collapsed");
    container.classList.add("expanded");
  }
  function closeContainer(container) {
    container.classList.remove("expanded");
    container.classList.add("collapsed");
  }
  function toggleExclusive(openElem, closeElem) {
    if (openElem.classList.contains("expanded")) {
      closeContainer(openElem);
    } else {
      openContainer(openElem);
      closeContainer(closeElem);
    }
  }

  uploadHeader.addEventListener("click", () => {
    toggleExclusive(uploadContainer, resultContainer);
  });
  resultHeader.addEventListener("click", () => {
    toggleExclusive(resultContainer, uploadContainer);
  });

  let selectedFile = null;
  document.getElementById("imageInput").addEventListener("change", (e) => {
    selectedFile = e.target.files[0];
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      openContainer(uploadContainer);
      closeContainer(resultContainer);
    };
    reader.readAsDataURL(selectedFile);
  });

  const loadingText = document.createElement("div");
  loadingText.style.color = "#008cff";
  loadingText.style.fontWeight = "bold";
  loadingText.style.marginTop = "10px";
  document.querySelector(".left-pane").appendChild(loadingText);

  let loadingInterval;

  async function analyzeImage() {
    if (!selectedFile) {
      alert("画像を選択してください");
      return;
    }

    analyzeBtn.disabled = true;
    loadingText.textContent = "分析中";
    let dotCount = 0;
    loadingInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      loadingText.textContent = "分析中" + ".".repeat(dotCount);
    }, 500);

    const model = "floor-plan-japan";
    const version = 7;
    const apiKey = "E0aoexJvBDgvE3nb1jkc";

    const formData = new FormData();
    formData.append("file", selectedFile);

    const url = `https://detect.roboflow.com/${model}/${version}?api_key=${apiKey}`;

    try {
      const res = await fetch(url, { method: "POST", body: formData });
      const result = await res.json();

      clearInterval(loadingInterval);
      loadingText.textContent = "";
      latestJson = result;

      resultPre.textContent = JSON.stringify(result, null, 2);
      openContainer(resultContainer);
      closeContainer(uploadContainer);
      draw3D(result.predictions, result.image.width, result.image.height);
    } catch (err) {
      clearInterval(loadingInterval);
      loadingText.textContent = "エラー: " + err.message;
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  saveBtn.addEventListener("click", () => {
    if (!accessToken || !latestJson) return alert("ログインまたは解析が必要です");

    const filename = filenameInput.value.trim();
    if (!filename) return alert("保存名を入力してください");

    const metadata = {
      name: `${filename}.json`,
      mimeType: 'application/json'
    };
    const file = new Blob([JSON.stringify(latestJson)], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form
    }).then(res => res.json()).then(result => {
      alert('保存完了');
      updateFileSelect();
    }).catch(err => {
      console.error(err);
      alert('保存失敗');
    });
  });

  loadBtn.addEventListener("click", () => {
    const fileId = fileSelect.value;
    if (!accessToken || !fileId) return alert("ログインまたはファイルを選択してください");

    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
    }).then(res => res.json()).then(data => {
      latestJson = data;
      resultPre.textContent = JSON.stringify(data, null, 2);
      openContainer(resultContainer);
      closeContainer(uploadContainer);
      draw3D(data.predictions, data.image.width, data.image.height);
    }).catch(err => {
      console.error(err);
      alert('読み込みに失敗しました');
    });
  });
  const deleteBtn = document.getElementById("deleteBtn");

deleteBtn.addEventListener("click", () => {
  const fileId = fileSelect.value;
  if (!accessToken || !fileId) return alert("ログインまたはファイルを選択してください");

  const confirmDelete = confirm("本当にこのファイルを削除しますか？");
  if (!confirmDelete) return;

  fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: new Headers({
      Authorization: "Bearer " + accessToken
    })
  })
  .then((res) => {
    if (res.status === 204) {
      alert("ファイルを削除しました");
      updateFileSelect(); // 削除後にリスト更新
    } else {
      throw new Error("削除に失敗しました");
    }
  })
  .catch((err) => {
    console.error(err);
    alert("削除エラー: " + err.message);
  });
});


  function updateFileSelect() {
    if (!accessToken) return;

    fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/json'`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
    }).then(res => res.json()).then(fileList => {
      fileSelect.innerHTML = `<option value="">読み込むファイルを選択</option>`;
      fileList.files.forEach(file => {
        const option = document.createElement("option");
        option.value = file.id;
        option.textContent = file.name;
        fileSelect.appendChild(option);
      });
    });
  }

  import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

function draw3D(predictions, imageWidth, imageHeight) {
  // ======== Three.js 初期設定 ========
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });

  const container = document.getElementById("three-container");
  container.innerHTML = "";
  renderer.setSize(container.clientWidth, container.clientHeight || 600);
  container.appendChild(renderer.domElement);

  const scale = 0.01;

  // ======== 環境ライト ========
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  // ======== 床 ========
  const floorGeometry = new THREE.PlaneGeometry(imageWidth * scale, imageHeight * scale);
  const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ======== 壁などのオブジェクト描画 ========
  const classColors = {
    wall: 0x999999,
    door: 0x8b4513,
    "glass door": 0x87cefa,
    window: 0x1e90ff,
    closet: 0xffa500,
    fusuma: 0xda70d6,
  };
  const ignoreList = ["left side", "right side", "under side", "top side"];
  const wallHeight = 2.5;

  predictions.forEach((pred) => {
    if (ignoreList.includes(pred.class)) return;
    const geometry = new THREE.BoxGeometry(
      pred.width * scale,
      wallHeight,
      pred.height * scale
    );
    const color = classColors[pred.class] || 0xffffff;
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = (pred.x - imageWidth / 2) * scale;
    mesh.position.y = wallHeight / 2;
    mesh.position.z = -(pred.y - imageHeight / 2) * scale;
    scene.add(mesh);
  });

  // ======== プレイヤー（青い球体） ========
  const playerGeo = new THREE.SphereGeometry(0.2, 16, 16);
  const playerMat = new THREE.MeshStandardMaterial({ color: 0x3333ff });
  const playerMesh = new THREE.Mesh(playerGeo, playerMat);
  playerMesh.position.set(0, 0.2, 0);
  scene.add(playerMesh);

  // ======== カメラ操作設定 ========
  const controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(controls.getObject());
  document.addEventListener("click", () => controls.lock());

  // ======== 視点切替UI ========
  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = "視点切替 (F1)";
  Object.assign(toggleBtn.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    zIndex: 10,
    padding: "8px 12px",
    background: "#008cff",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  });
  document.body.appendChild(toggleBtn);

  // ======== 移動ロジック ========
  const moveSpeed = 0.05;
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const keys = { w: false, a: false, s: false, d: false };
  let cameraMode = "first"; // "first" or "third"
  const followDistance = 2.5;

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === "f1") toggleView();
  });
  document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
  });
  toggleBtn.onclick = () => toggleView();

  function toggleView() {
    if (cameraMode === "first") {
      cameraMode = "third";
    } else {
      cameraMode = "first";
      controls.getObject().position.copy(playerMesh.position);
    }
  }

  camera.position.set(0, 1.6, 0); // 初期視点高さ

  function updatePlayer() {
    direction.set(
      Number(keys.d) - Number(keys.a),
      0,
      Number(keys.s) - Number(keys.w)
    );
    direction.normalize();

    if (controls.isLocked) {
      velocity.z = -direction.z * moveSpeed;
      velocity.x = -direction.x * moveSpeed;
      controls.moveRight(-velocity.x);
      controls.moveForward(-velocity.z);
      playerMesh.position.copy(controls.getObject().position);
    }

    // 三人称カメラ追従
    if (cameraMode === "third") {
      const behind = new THREE.Vector3(0, 1.6, followDistance);
      behind.applyQuaternion(camera.quaternion);
      const desiredPos = playerMesh.position.clone().add(behind);
      camera.position.lerp(desiredPos, 0.1);
      camera.lookAt(
        playerMesh.position.clone().add(new THREE.Vector3(0, 1.0, 0))
      );
    } else {
      camera.position.copy(
        controls.getObject().position.clone().add(new THREE.Vector3(0, 1.6, 0))
      );
    }
  }

  // ======== メインループ ========
  (function animate() {
    requestAnimationFrame(animate);
    updatePlayer();
    renderer.render(scene, camera);
  })();
}

});