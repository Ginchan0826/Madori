document.addEventListener("DOMContentLoaded", () => {
  const uploadHeader = document.getElementById("upload-header");
  const uploadContainer = document.getElementById("upload-container");
  const resultHeader = document.getElementById("result-header");
  const resultContainer = document.getElementById("result-container");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const previewImg = document.getElementById("preview");
  const resultPre = document.getElementById("result");

  // 初期折りたたみ状態
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

  // 排他トグル関数
  function toggleExclusive(openContainerElem, closeContainerElem) {
    if (openContainerElem.classList.contains("expanded")) {
      closeContainer(openContainerElem);
    } else {
      openContainer(openContainerElem);
      closeContainer(closeContainerElem);
    }
  }

  uploadHeader.addEventListener("click", () => {
    toggleExclusive(uploadContainer, resultContainer);
  });

  resultHeader.addEventListener("click", () => {
    toggleExclusive(resultContainer, uploadContainer);
  });

  // ファイル選択処理
  let selectedFile = null;
  document.getElementById("imageInput").addEventListener("change", (e) => {
    selectedFile = e.target.files[0];
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      previewImg.style.display = "block";
      // 画像アップロード時はアップロード画像を自動展開し、結果は閉じる
      openContainer(uploadContainer);
      closeContainer(resultContainer);
    };
    reader.readAsDataURL(selectedFile);
  });

  // ローディング表示用
  const loadingText = document.createElement("div");
  loadingText.style.color = "#008cff";
  loadingText.style.fontWeight = "bold";
  loadingText.style.marginTop = "10px";
  loadingText.textContent = "";
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
      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      clearInterval(loadingInterval);
      loadingText.textContent = "";

      // 結果を表示し展開、アップロード画像は閉じる
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

  // Three.js 3D描画（カメラ位置調整）
  function draw3D(predictions, imageWidth, imageHeight) {
    const scene = new THREE.Scene();

    // カメラ位置を少し引き、右下が見切れないよう調整
    const camera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.position.set(3.2, 3.2, 3.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const container = document.getElementById("three-container");
    container.innerHTML = "";

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight || 600;
    renderer.setSize(containerWidth, containerHeight);
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
      const geometry = new THREE.BoxGeometry(
        pred.width * scale,
        0.1,
        pred.height * scale
      );

      const color = classColors[pred.class] || 0xffffff;
      const material = new THREE.MeshBasicMaterial({
        color: color,
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
