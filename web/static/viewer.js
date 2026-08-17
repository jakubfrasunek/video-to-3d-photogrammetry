import * as THREE from "three";
import { OrbitControls } from "/vendor/OrbitControls.js";
import { MTLLoader } from "/vendor/MTLLoader.js";
import { OBJLoader } from "/vendor/OBJLoader.js";

const instances = new Map();

function fitCamera(camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const distance = maxSize * 2.15;
  camera.position.set(distance * 0.75, distance * 0.42, distance);
  camera.near = maxSize / 100;
  camera.far = maxSize * 20;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
}

function createInstance() {
  let renderer;
  let animationId;
  let meshes = [];
  let lights = [];
  let lightLevel = 1;
  let onResize;
  let resizeObserver;

  function dispose() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    if (onResize) window.removeEventListener("resize", onResize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    for (const mesh of meshes) {
      mesh.userData.textured?.dispose();
      mesh.userData.clay?.dispose();
    }
    meshes = [];
    lights = [];
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      renderer = null;
    }
  }

  function prepareMaterials(root) {
    meshes = [];
    root.traverse((child) => {
      if (!child.isMesh) return;
      const src = Array.isArray(child.material) ? child.material[0] : child.material;
      const map = src?.map || null;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const texturedMat = new THREE.MeshStandardMaterial({
        map,
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      const clay = new THREE.MeshStandardMaterial({
        color: 0xd8d3cb,
        roughness: 0.68,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      child.userData.textured = texturedMat;
      child.userData.clay = clay;
      child.material = texturedMat;
      meshes.push(child);
    });
  }

  function setTextured(on) {
    for (const mesh of meshes) {
      mesh.material = on ? mesh.userData.textured : mesh.userData.clay;
    }
  }

  function setLight(level) {
    lightLevel = Math.max(0.15, Math.min(3, Number(level) || 1));
    for (const light of lights) {
      light.object.intensity = light.base * lightLevel;
    }
    if (renderer) renderer.toneMappingExposure = 0.85 + lightLevel * 0.4;
  }

  async function show(container, base) {
    dispose();
    while (container.firstChild) container.removeChild(container.firstChild);
    lightLevel = 1;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 380;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8eaf0);
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    const addLight = (light, intensity) => {
      light.intensity = intensity * lightLevel;
      scene.add(light);
      lights.push({ object: light, base: intensity });
    };
    addLight(new THREE.AmbientLight(0xffffff, 1), 0.9);
    addLight(new THREE.HemisphereLight(0xffffff, 0xb7c0cc, 1), 1.35);
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.position.set(3.2, 5.4, 4.2);
    addLight(key, 1.7);
    const fill = new THREE.DirectionalLight(0xfff4ea, 1);
    fill.position.set(-4.2, 2.2, 2.4);
    addLight(fill, 1.05);
    const rim = new THREE.DirectionalLight(0xd7e6ff, 1);
    rim.position.set(0.2, 3.4, -4.6);
    addLight(rim, 0.85);
    setLight(lightLevel);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    const materials = await new MTLLoader().setPath(base).loadAsync("model.mtl");
    materials.preload();
    const model = await new OBJLoader().setMaterials(materials).setPath(base).loadAsync("model.obj");
    prepareMaterials(model);
    scene.add(model);
    fitCamera(camera, controls, model);

    onResize = () => {
      if (!renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 2 || h < 2) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const tick = () => {
      if (!renderer) return;
      controls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(tick);
    };
    tick();
  }

  function resize() {
    onResize?.();
  }

  return { show, dispose, setTextured, setLight, resize };
}

window.ObjectCaptureViewer = {
  async show(container, base) {
    const current = instances.get(container);
    if (current) current.dispose();
    const inst = createInstance();
    instances.set(container, inst);
    await inst.show(container, base);
  },
  disposeAll() {
    for (const inst of instances.values()) inst.dispose();
    instances.clear();
  },
  setTextured(container, on) {
    instances.get(container)?.setTextured(on);
  },
  setLight(container, level) {
    instances.get(container)?.setLight(level);
  },
  resize(container) {
    instances.get(container)?.resize();
  },
};
