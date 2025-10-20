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

function draw3D(predictions, imageWidth, imageHeight) {
  // ======== 外周輪郭抽出アルゴリズム ========

  // 「left/right/top/under side」を除外
  const validPreds = predictions.filter(
    (p) =>
      !["left side", "right side", "top side", "under side"].includes(p.class)
  );

  // 壁のみ抽出
  const walls = validPreds.filter((p) => p.class === "wall");

  // 壁の外接矩形群から全体の輪郭を推定
  const points = [];
  walls.forEach((w) => {
    const x1 = w.x - w.width / 2;
    const y1 = w.y - w.height / 2;
    const x2 = w.x + w.width / 2;
    const y2 = w.y + w.height / 2;
    points.push([x1, y1], [x2, y1], [x2, y2], [x1, y2]);
  });

  // 輪郭点が存在しない場合は終了
  if (points.length < 3) {
    alert("壁が検出されませんでした。");
    return;
  }

  // 凸包アルゴリズム（Graham Scan）で外周の輪郭を抽出
  function convexHull(points) {
    points.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
    const cross = (o, a, b) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (let p of points) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
        lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
        upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  const hull = convexHull(points);

  // ======== Three.js 初期化 ========
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
  camera.position.set(5, 5, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const container = document.getElementById("three-container");
  container.innerHTML = "";
  renderer.setSize(container.clientWidth, container.clientHeight || 600);
  container.appendChild(renderer.domElement);

  const controls = new window.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.maxPolarAngle = Math.PI / 2;

  const scale = 0.01;

  // ======== 床生成 ========
  const floorGeometry = new THREE.PlaneGeometry(imageWidth * scale, imageHeight * scale);
  const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ======== 外周壁のみ描画 ========
  const wallColor = 0x999999;
  const wallHeight = 1.5;
  const material = new THREE.MeshLambertMaterial({ color: wallColor });

  // 凸包（輪郭）上に壁を並べる
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.sqrt(dx * dx + dy * dy);

    const geometry = new THREE.BoxGeometry(length * scale, wallHeight, 0.1);
    const mesh = new THREE.Mesh(geometry, material);

    const angle = Math.atan2(dy, dx);
    mesh.rotation.y = -angle;
    mesh.position.x = ((a[0] + b[0]) / 2 - imageWidth / 2) * scale;
    mesh.position.y = wallHeight / 2;
    mesh.position.z = -((a[1] + b[1]) / 2 - imageHeight / 2) * scale;

    scene.add(mesh);
  }

  // ======== ライト ========
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040));

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
}



});