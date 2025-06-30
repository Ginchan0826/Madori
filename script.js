// === Google API設定 ===
const CLIENT_ID = '763926845208-bl7kvhg0tq4q99uepvckpcmgvhe4hvme.apps.googleusercontent.com'; // ← あなたのIDに変更
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let selectedFile = null;
let latestResult = null;

// Google認証
function initGoogleAPI() {
  gapi.load('client:auth2', async () => {
    await gapi.client.init({ clientId: CLIENT_ID, scope: SCOPES });
    await gapi.auth2.getAuthInstance().signIn();
    document.getElementById("status").textContent = "Googleログイン成功！";
  });
}

// Drive保存処理
async function uploadToDrive() {
  if (!selectedFile || !latestResult) {
    alert("画像と分析結果を取得してから保存してください。");
    return;
  }

  const accessToken = gapi.auth.getToken().access_token;
  const status = document.getElementById("status");

  // 画像アップロード
  const imgMeta = { name: selectedFile.name, mimeType: selectedFile.type };
  const imgForm = new FormData();
  imgForm.append("metadata", new Blob([JSON.stringify(imgMeta)], { type: "application/json" }));
  imgForm.append("file", selectedFile);

  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: new Headers({ Authorization: "Bearer " + accessToken }),
    body: imgForm
  });

  // JSONアップロード
  const jsonMeta = {
    name: selectedFile.name.replace(/\.\w+$/, ".json"),
    mimeType: "application/json"
  };
  const jsonBlob = new Blob([JSON.stringify(latestResult, null, 2)], { type: "application/json" });
  const jsonForm = new FormData();
  jsonForm.append("metadata", new Blob([JSON.stringify(jsonMeta)], { type: "application/json" }));
  jsonForm.append("file", jsonBlob);

  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: new Headers({ Authorization: "Bearer " + accessToken }),
    body: jsonForm
  });

  status.textContent = "Google Drive に画像とJSONを保存しました！";
}

// === ページ初期処理とRoboflow分析 + Three.js ===
document.addEventListener("DOMContentLoaded", () => {
  const uploadHeader = document.getElementById("upload-header");
  const uploadContainer = document.getElementById("upload-container");
  const resultHeader = document.getElementById("result-header");
  const resultContainer = document.getElementById("result-container");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const previewImg = document.getElementById("preview");
  const resultPre = document.getElementById("result");

  // 折りたたみ初期状態
  uploadContainer.classList.remove("expanded");
  uploadContainer.classList.add("collapsed");
  resultContainer.classList.remove("expanded");
  resultContainer.classList.add("collapsed");

  function closeContainer(container) {
    container.classList.remove("expanded");
    container.classList.add("collapsed");
  }
  function openContainer(container) {
    container.classList.remove("collapsed");
    container.classList.add("expanded");
  }
  function toggleExclusive(open, close) {
    if (open.classList.contains("expanded")) {
      closeContainer(open);
    } else {
      openContainer(open);
      closeContainer(close);
    }
  }

  uploadHeader.addEventListener("click", () => {
    toggleExclusive(uploadContainer, resultContainer);
  });
  resultHeader.addEventListener("click", () => {
    toggleExclusive(resultContainer, uploadContainer);
  });

  // ファイル選択
  document.getElementById("imageInput").addEventListener("change", (e) => {
    selectedFile = e.target.files[0];
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      previewImg.style.display = "block";
      openContainer(uploadContainer);
      closeContainer(resultContainer);
    };
    reader.readAsDataURL(selectedFile);
  });

  // ローディング表示
  const loadingText = document.createElement("div");
  loadingText.style.color = "#008cff";
  loadingText.style.fontWeight = "bold";
  loadingText.style.marginTop = "10px";
  loadingText.textContent = "";
  document.querySelector(".left-pane").appendChild(loadingText);

  let loadingInterval;

  // Roboflow分析
  window.analyzeImage = async () => {
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
      latestResult = result; // Drive保存用に保持

      clearInterval(loadingInterval);
      loadingText.textContent = "";

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
  };

  // Three.js で描画
  function draw3D(predictions, imageWidth, imageHeight) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.position.set(3.2, 3.2, 3.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const container = document.getElementById("three-container");
    container.innerHTML = "";
    const w = container.clientWidth;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const scale = 0.01;
    const classColors = {
      "left side": 0xffffff,
      "right side": 0xffffff,
      "top side": 0xffffff,
      "under side": 0xffffff,
      wall: 0xaaaaaa,
      door: 0x8b4513,
      "glass door": 0x87cefa,
      window: 0x1e90ff,
      closet: 0xffa500,
      fusuma: 0xda70d6,
    };

    predictions.forEach((pred) => {
      const geometry = new THREE.BoxGeometry(pred.width * scale, 0.1, pred.height * scale);
      const material = new THREE.MeshBasicMaterial({
        color: classColors[pred.class] || 0xffffff,
        transparent: true,
        opacity: 0.7,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = (pred.x - imageWidth / 2) * scale;
      mesh.position.y = 0;
      mesh.position.z = -(pred.y - imageHeight / 2) * scale;
      scene.add(mesh);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 10, 10).normalize();
    scene.add(light);

    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();
  }
});
