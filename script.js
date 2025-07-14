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
  };

  saveBtn.addEventListener("click", () => {
    if (!accessToken || !latestJson) return alert("ログインまたは解析が必要です");

    const metadata = {
      name: 'room_analysis.json',
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
      alert('Driveに保存完了');
    }).catch(err => {
      console.error(err);
      alert('保存失敗');
    });
  });

  loadBtn.addEventListener("click", () => {
    if (!accessToken) return alert("ログインしてください");

    fetch(`https://www.googleapis.com/drive/v3/files?q=name='room_analysis.json' and mimeType='application/json'`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
    }).then(res => res.json()).then(fileList => {
      if (!fileList.files || fileList.files.length === 0) {
        return alert('保存されたファイルが見つかりません');
      }
      const fileId = fileList.files[0].id;
      return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken })
      });
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

  function draw3D(predictions, imageWidth, imageHeight) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.position.set(3.2, 3.2, 3.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const container = document.getElementById("three-container");
    container.innerHTML = "";

    renderer.setSize(container.clientWidth, container.clientHeight || 600);
    container.appendChild(renderer.domElement);

    const scale = 0.01;
    const classColors = {
      "left side": 0xffffff, "right side": 0xffffff, "top side": 0xffffff, "under side": 0xffffff,
      wall: 0xaaaaaa, door: 0x8b4513, "glass door": 0x87cefa,
      window: 0x1e90ff, closet: 0xffa500, fusuma: 0xda70d6,
    };

    predictions.forEach((pred) => {
      const geometry = new THREE.BoxGeometry(
        pred.width * scale, 0.1, pred.height * scale
      );
      const color = classColors[pred.class] || 0xffffff;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = (pred.x - imageWidth / 2) * scale;
      mesh.position.y = 0;
      mesh.position.z = -(pred.y - imageHeight / 2) * scale;
      scene.add(mesh);
    });

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 10, 10).normalize();
    scene.add(light);

    (function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    })();
  }
});
