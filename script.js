let accessToken = null;
let latestJson = null;

/* Googleログイン */
function handleCredentialResponse(response) {
  requestAccessToken();
}

function requestAccessToken() {
  google.accounts.oauth2.initTokenClient({
    client_id: '479474446026-kej6f40kvfm6dsuvfeo5d4fm87c6god4.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (tokenResponse) => {
      accessToken = tokenResponse.access_token;
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

  const filenameInput = document.getElementById("filenameInput");
  const fileSelect = document.getElementById("fileSelect");

  let selectedFile = null;

  /* モデルURLまとめ */
  const API = {
    outer: "https://detect.roboflow.com/floor-plan-japan-base-6xuaz/2?api_key=E0aoexJvBDgvE3nb1jkc",
    inner: "https://detect.roboflow.com/floor-plan-japan/7?api_key=E0aoexJvBDgvE3nb1jkc",
    extra: "https://detect.roboflow.com/floor-plan-japan-2-menv0/1?api_key=E0aoexJvBDgvE3nb1jkc&confidence=0.25"
  };

  /* 共通 Roboflow 呼び出し関数 */
  async function runRoboflow(url, file) {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(url, { method: "POST", body: formData });
    return await res.json();
  }

  /* IoU 計算 */
  function calcIoU(a, b) {
    const ax1 = a.x - a.width / 2;
    const ax2 = a.x + a.width / 2;
    const ay1 = a.y - a.height / 2;
    const ay2 = a.y + a.height / 2;

    const bx1 = b.x - b.width / 2;
    const bx2 = b.x + b.width / 2;
    const by1 = b.y - b.height / 2;
    const by2 = b.y + b.height / 2;

    const interX = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    const interY = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
    const intersect = interX * interY;

    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - intersect;

    return intersect / union;
  }

  /* 壁補完（Wall ↔ Fusuma の隙間を埋める）*/
function fillWallGaps(preds) {
  const walls = preds.filter(p =>
    p.class === "wall" || p.class === "fusuma"
  );

  const filled = [];

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i];
      const b = walls[j];

      // ★ 補完対象は「Wall ↔ Fusuma」のみ
      const isPair =
        (a.class === "wall" && b.class === "fusuma") ||
        (a.class === "fusuma" && b.class === "wall");

      if (!isPair) continue; // ← ここで Wall↔Wall や Fusuma↔Fusuma を拒否

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 距離が近いときだけ補完
      if (dist < 40) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;

        filled.push({
          class: "wall",
          x: midX,
          y: midY,
          width: Math.max(5, Math.abs(a.x - b.x)),
          height: Math.max(5, Math.abs(a.y - b.y)),
          confidence: 0.99
        });
      }
    }
  }

  return filled;
}


  /* 重なり優先ルール適用（チラつき防止）*/
  function applyPriority(preds) {
    const result = [];

    preds.forEach(p => {
      let skip = false;

      preds.forEach(other => {
        if (p === other) return;
        if (calcIoU(p, other) < 0.2) return;

        // Wall が Closet / Door に勝つ
        if ((p.class === "closet" || p.class === "door") && other.class === "wall") {
          skip = true;
        }

        // Window / Glass door が Wall に勝つ
        if (p.class === "wall" && 
            (other.class === "window" || other.class === "glass door")) {
          skip = true;
        }
      });

      if (!skip) result.push(p);
    });

    return result;
  }

  /* 折りたたみUI制御 */
  function openContainer(c) {
    c.classList.remove("collapsed");
    c.classList.add("expanded");
  }
  function closeContainer(c) {
    c.classList.remove("expanded");
    c.classList.add("collapsed");
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

  /* 画像プレビュー */
  document.getElementById("imageInput").addEventListener("change", (e) => {
    selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      previewImg.src = ev.target.result;
      openContainer(uploadContainer);
      closeContainer(resultContainer);
    };
    reader.readAsDataURL(selectedFile);
  });

  /* ローディング表示 */
  const loadingText = document.createElement("div");
  loadingText.style.color = "#008cff";
  loadingText.style.fontWeight = "bold";
  document.querySelector(".left-pane").appendChild(loadingText);

  let loadingInterval;

  /* ★ 3モデル合成処理（IoU完全実装＋base除外＋壁補完＋優先ルール） */
  async function runAllModels(file) {
    const outer = await runRoboflow(API.outer, file);
    const inner = await runRoboflow(API.inner, file);
    const extra = await runRoboflow(API.extra, file);

    if (!outer.predictions.length) return inner;

    const outerBox = outer.predictions[0];

    function isInside(pred) {
      return (
        pred.x > outerBox.x - outerBox.width / 2 &&
        pred.x < outerBox.x + outerBox.width / 2 &&
        pred.y > outerBox.y - outerBox.height / 2 &&
        pred.y < outerBox.y + outerBox.height / 2
      );
    }

    function notBase(pred) {
      return pred.class !== "base" && pred.class !== "outer";
    }

    const filteredInner = inner.predictions.filter(p => isInside(p) && notBase(p));
    const filteredExtra = extra.predictions.filter(p => isInside(p) && notBase(p));

    let finalPreds = [...outer.predictions, ...filteredInner];

    // extra（補完モデル）の IoU 重複チェック
    filteredExtra.forEach(e => {
      let duplicate = false;

      filteredInner.forEach(i => {
        if (e.class === i.class && calcIoU(e, i) > 0.4) {
          duplicate = true;
        }
      });

      if (!duplicate) finalPreds.push(e);
    });

    // 壁隙間補完
    const additions = fillWallGaps(finalPreds);
    finalPreds.push(...additions);

    // 優先ルール適用（重なり調整）
    finalPreds = applyPriority(finalPreds);

    return {
      image: outer.image,
      predictions: finalPreds
    };
  }

  /* ★ メイン解析ボタン */
  analyzeBtn.addEventListener("click", async () => {
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

    const mode = document.getElementById("modelSelector").value;
    let result;

    try {
      if (mode === "outer")      result = await runRoboflow(API.outer, selectedFile);
      else if (mode === "inner") result = await runRoboflow(API.inner, selectedFile);
      else if (mode === "extra") result = await runRoboflow(API.extra, selectedFile);
      else if (mode === "all")   result = await runAllModels(selectedFile);

      latestJson = result;
      resultPre.textContent = JSON.stringify(result, null, 2);

      openContainer(resultContainer);
      closeContainer(uploadContainer);

      draw3D(result.predictions, result.image.width, result.image.height);

    } catch (err) {
      alert("エラー: " + err.message);
    } finally {
      clearInterval(loadingInterval);
      loadingText.textContent = "";
      analyzeBtn.disabled = false;
    }
  });

  /* Google Drive 保存 */
  document.getElementById("saveBtn").addEventListener("click", () => {
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
    }).then(res => res.json()).then(() => {
      alert('保存完了');
      updateFileSelect();
    }).catch(err => {
      alert('保存失敗');
    });
  });

  /* Drive 読み込み */
  document.getElementById("loadBtn").addEventListener("click", () => {
    const fileId = fileSelect.value;
    if (!accessToken || !fileId) return alert("ログインまたはファイルを選択してください");

    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
    })
      .then(res => res.json())
      .then(data => {
        latestJson = data;
        resultPre.textContent = JSON.stringify(data, null, 2);
        openContainer(resultContainer);
        draw3D(data.predictions, data.image.width, data.image.height);
      });
  });

  /* Drive ファイル削除 */
  document.getElementById("deleteBtn").addEventListener("click", () => {
    const fileId = fileSelect.value;
    if (!accessToken || !fileId) return alert("ログインまたはファイルを選択してください");

    if (!confirm("本当に削除しますか？")) return;

    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: new Headers({ Authorization: "Bearer " + accessToken })
    })
      .then((res) => {
        if (res.status === 204) {
          alert("削除しました");
          updateFileSelect();
        } else {
          alert("削除失敗");
        }
      });
  });

  /* Drive ファイルリスト更新 */
  function updateFileSelect() {
    if (!accessToken) return;

    fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/json'`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
    })
      .then(res => res.json())
      .then(fileList => {
        fileSelect.innerHTML = `<option value="">読み込むファイルを選択</option>`;
        fileList.files.forEach(file => {
          const option = document.createElement("option");
          option.value = file.id;
          option.textContent = file.name;
          fileSelect.appendChild(option);
        });
      });
  }

  /* 3D描画 */
  function draw3D(predictions, imageWidth, imageHeight) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // ★背景色を白に

    const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.position.set(5, 5, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const container = document.getElementById("three-container");
    container.innerHTML = "";
    renderer.setSize(container.clientWidth, container.clientHeight || 600);
    renderer.setClearColor(0xffffff, 1); // ★白背景 Fix
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2;

    const scale = 0.01;
    const colors = {
      wall: 0x999999,
      door: 0x8b4513,
      "glass door": 0x87cefa,
      window: 0x1e90ff,
      closet: 0xffa500,
      fusuma: 0xda70d6,
    };

    const floorGeo = new THREE.PlaneGeometry(imageWidth * scale, imageHeight * scale);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ignore = ["left side", "right side", "under side", "top side", "base", "outer"];

    predictions.forEach(pred => {
      if (ignore.includes(pred.class)) return;

      const geo = new THREE.BoxGeometry(
        pred.width * scale,
        0.5,
        pred.height * scale
      );

      const color = colors[pred.class] || 0xffffff;
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.x = (pred.x - imageWidth / 2) * scale;
      mesh.position.y = 0.75;
      mesh.position.z = -(pred.y - imageHeight / 2) * scale;

      scene.add(mesh);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(5, 10, 7);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  }

});
