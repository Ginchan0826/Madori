import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/controls/OrbitControls.js';

let accessToken = null;
let latestJson = null;

// Googleログインコールバック（グローバル必須）
window.handleCredentialResponse = (response) => {
  console.log("Googleログイン成功");
  google.accounts.oauth2.initTokenClient({
    client_id: '479474446026-kej6f40kvfm6dsuvfeo5d4fm87c6god4.apps.googleusercontent.com',
    scope: 'https://www.googleapis.com/auth/drive',
    callback: (tokenResponse) => {
      accessToken = tokenResponse.access_token;
      updateFileSelect();
    }
  }).requestAccessToken();
};

document.addEventListener("DOMContentLoaded", () => {
  const previewImg = document.getElementById("preview");
  const resultPre = document.getElementById("result");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const saveBtn = document.getElementById("saveBtn");
  const loadBtn = document.getElementById("loadBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const filenameInput = document.getElementById("filenameInput");
  const fileSelect = document.getElementById("fileSelect");
  const uploadHeader = document.getElementById("upload-header");
  const uploadContainer = document.getElementById("upload-container");
  const resultHeader = document.getElementById("result-header");
  const resultContainer = document.getElementById("result-container");

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

  uploadHeader.addEventListener("click", () => toggleExclusive(uploadContainer, resultContainer));
  resultHeader.addEventListener("click", () => toggleExclusive(resultContainer, uploadContainer));

  analyzeBtn.addEventListener("click", async () => {
    if (!selectedFile) return alert("画像を選んでください");

    const model = "floor-plan-japan";
    const version = 7;
    const apiKey = "E0aoexJvBDgvE3nb1jkc";

    const formData = new FormData();
    formData.append("file", selectedFile);
    const url = `https://detect.roboflow.com/${model}/${version}?api_key=${apiKey}`;

    const res = await fetch(url, { method: "POST", body: formData });
    const json = await res.json();

    latestJson = json;
    resultPre.textContent = JSON.stringify(json, null, 2);
    openContainer(resultContainer);
    closeContainer(uploadContainer);
    draw3D(json.predictions, json.image.width, json.image.height);
  });

  saveBtn.addEventListener("click", () => {
    if (!accessToken || !latestJson) return alert("ログインまたは解析が必要です");
    const filename = filenameInput.value.trim();
    if (!filename) return alert("保存名を入力してください");

    const metadata = { name: `${filename}.json`, mimeType: 'application/json' };
    const file = new Blob([JSON.stringify(latestJson)], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form
    }).then(() => {
      alert("保存完了");
      updateFileSelect();
    });
  });

  loadBtn.addEventListener("click", () => {
    const fileId = fileSelect.value;
    if (!accessToken || !fileId) return alert("ファイルを選択してください");

    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
    }).then(res => res.json()).then(json => {
      latestJson = json;
      resultPre.textContent = JSON.stringify(json, null, 2);
      draw3D(json.predictions, json.image.width, json.image.height);
    });
  });

  deleteBtn.addEventListener("click", () => {
    const fileId = fileSelect.value;
    if (!accessToken || !fileId) return alert("ファイルを選択してください");
    if (!confirm("本当に削除しますか？")) return;

    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: new Headers({ Authorization: "Bearer " + accessToken })
    }).then(res => {
      if (res.status === 204) {
        alert("削除完了");
        updateFileSelect();
      }
    });
  });

  function updateFileSelect() {
    if (!accessToken) return;
    fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType='application/json'`, {
      headers: new Headers({ Authorization: "Bearer " + accessToken })
    }).then(res => res.json()).then(fileList => {
      fileSelect.innerHTML = `<option value="">読み込むファイルを選択</option>`;
      fileList.files.forEach(file => {
        const opt = document.createElement("option");
        opt.value = file.id;
        opt.textContent = file.name;
        fileSelect.appendChild(opt);
      });
    });
  }

  function draw3D(predictions, imageWidth, imageHeight) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.position.set(3.2, 3.2, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const container = document.getElementById("three-container");
    container.innerHTML = "";
    renderer.setSize(container.clientWidth, container.clientHeight || 600);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.update();

    const scale = 0.01;
    const objectHeight = 0.5;
    const classColors = {
      wall: 0xaaaaaa, door: 0x8b4513, "glass door": 0x87cefa,
      window: 0x1e90ff, closet: 0xffa500, fusuma: 0xda70d6
    };
    const hidden = ["top side", "under side", "left side", "right side"];

    predictions.forEach((p) => {
      if (hidden.includes(p.class)) return;
      const geo = new THREE.BoxGeometry(p.width * scale, objectHeight, p.height * scale);
      const mat = new THREE.MeshBasicMaterial({ color: classColors[p.class] || 0xffffff, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = (p.x - imageWidth / 2) * scale;
      mesh.position.y = objectHeight / 2;
      mesh.position.z = -(p.y - imageHeight / 2) * scale;
      scene.add(mesh);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 10, 10).normalize();
    scene.add(light);

    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  function openContainer(c) { c.classList.remove("collapsed"); c.classList.add("expanded"); }
  function closeContainer(c) { c.classList.remove("expanded"); c.classList.add("collapsed"); }
  function toggleExclusive(a, b) {
    a.classList.contains("expanded") ? closeContainer(a) : (openContainer(a), closeContainer(b));
  }
});
