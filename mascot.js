/**
 * mascot.js — Three.js animated 3D model viewer for the About panel.
 * Loads mascot-anim.glb, plays all animations in sequence, and adds
 * smooth idle rotation + gentle bob so the mascot "dances" continuously.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const CANVAS_ID = "mascotCanvas";
const CONTAINER_ID = "mascotContainer";
const LOADING_ID = "mascotLoading";
const MODEL_URL = "./mascot-anim.glb";

/* ─── Utilities ─── */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* ─── Init (runs once the About modal is first opened) ─── */
let initialized = false;
let renderer, scene, camera, mixer, clock, animActions;
let raf = 0;
let currentActionIdx = 0;
let danceBob = 0;
let danceRot = 0;
let modelGroup;

function initMascot() {
  if (initialized) return;
  initialized = true;

  const canvas = document.getElementById(CANVAS_ID);
  const container = document.getElementById(CONTAINER_ID);
  const loading = document.getElementById(LOADING_ID);
  if (!canvas || !container) return;

  const W = container.clientWidth  || 300;
  const H = container.clientHeight || 400;

  /* ── Renderer ── */
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true   // transparent so parchment shows through
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* ── Scene ── */
  scene = new THREE.Scene();
  // Warm parchment ambient light
  const ambient = new THREE.AmbientLight(0xf5e6c8, 1.4);
  scene.add(ambient);

  // Key light (warm, from upper-left)
  const key = new THREE.DirectionalLight(0xfff2d0, 2.2);
  key.position.set(-2, 4, 3);
  key.castShadow = true;
  scene.add(key);

  // Rim light (cooler, from behind)
  const rim = new THREE.DirectionalLight(0xd0e8ff, 0.6);
  rim.position.set(2, 2, -3);
  scene.add(rim);

  /* ── Camera ── */
  camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  camera.position.set(0, 0, 3.2);
  camera.lookAt(0, 0, 0);

  /* ── Clock ── */
  clock = new THREE.Clock();

  /* ── Load GLB ── */
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");

  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);  // required for Meshopt-compressed GLBs

  loader.load(
    MODEL_URL,
    (gltf) => {
      /* ── Model setup ── */
      const model = gltf.scene;

      // Auto-fit: center + scale model to fill the panel nicely in the middle
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const targetSize = 2.1;
      const scaleFactor = targetSize / Math.max(maxDim, 0.001);

      modelGroup = new THREE.Group();
      model.position.sub(center); // re-center model geometry
      modelGroup.add(model);
      modelGroup.scale.setScalar(scaleFactor);
      modelGroup.position.set(0, -0.1, 0);
      scene.add(modelGroup);

      // Enable shadows on every mesh
      model.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          // Preserve material quality
          if (node.material) {
            node.material.needsUpdate = true;
          }
        }
      });

      /* ── Animations ── */
      mixer = new THREE.AnimationMixer(model);
      animActions = [];

      if (gltf.animations && gltf.animations.length > 0) {
        gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          animActions.push(action);
        });

        // Start playing the first animation
        playAction(0);

        // Cycle through animations every few seconds for variety
        scheduleNextDance();
      }

      /* ── Hide loading indicator ── */
      if (loading) {
        loading.style.opacity = "0";
        setTimeout(() => { loading.style.display = "none"; }, 400);
      }

      /* ── Start render loop ── */
      renderLoop();
    },
    (progress) => {
      if (loading && progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loading.textContent = `Loading 3D… ${pct}%`;
      }
    },
    (err) => {
      console.error("mascot-anim.glb load error:", err);
      if (loading) loading.textContent = "3D model unavailable";
    }
  );

  /* ── Responsive resize ── */
  const resizeObs = new ResizeObserver(() => {
    if (!renderer) return;
    const W2 = container.clientWidth;
    const H2 = container.clientHeight;
    if (W2 > 0 && H2 > 0) {
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
    }
  });
  resizeObs.observe(container);

  /* ── Mouse parallax on hover ── */
  container.addEventListener("mousemove", (e) => {
    if (!modelGroup) return;
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;  // -1 … +1
    const ny = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
    // Gently tilt the model toward the cursor
    modelGroup.rotation.y = lerp(modelGroup.rotation.y, nx * 0.5, 0.08);
    modelGroup.rotation.x = lerp(modelGroup.rotation.x, ny * -0.15, 0.08);
  });
  container.addEventListener("mouseleave", () => {
    // Smoothly return to idle tilt when mouse leaves
  });
}

/* ─── Animation helpers ─── */
function playAction(idx) {
  if (!animActions || animActions.length === 0) return;
  const clampedIdx = idx % animActions.length;

  // Crossfade from current
  if (currentActionIdx !== null && animActions[currentActionIdx]) {
    animActions[currentActionIdx].fadeOut(0.5);
  }

  animActions[clampedIdx].reset().fadeIn(0.5).play();
  currentActionIdx = clampedIdx;
}

function scheduleNextDance() {
  if (!animActions) return;
  const clip = animActions[currentActionIdx];
  const duration = clip?._clip?.duration ?? 3;
  // Play each animation at least once fully, then switch
  const delay = Math.max(duration * 1000, 2500);
  setTimeout(() => {
    if (!animActions) return;
    const next = (currentActionIdx + 1) % animActions.length;
    playAction(next);
    scheduleNextDance();
  }, delay);
}

/* ─── Render loop ─── */
function renderLoop() {
  raf = requestAnimationFrame(renderLoop);
  if (!renderer || !scene || !camera) return;

  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;

  // Advance animation mixer
  if (mixer) mixer.update(dt);

  // Gentle idle: slow auto-rotate + up-down dance bob
  if (modelGroup) {
    danceBob += dt;
    danceRot += dt;
    // Sinusoidal bob centered around middle of frame
    modelGroup.position.y = -0.1 + Math.sin(danceBob * 2.1) * 0.05;
    // Very slow auto-spin
    modelGroup.rotation.y += dt * 0.35;
  }

  renderer.render(scene, camera);
}

/* ─── Pause/resume when modal opens/closes ─── */
function pauseRenderer() {
  cancelAnimationFrame(raf);
  raf = 0;
}
function resumeRenderer() {
  if (initialized && renderer && raf === 0) {
    clock.getDelta(); // flush dt spike after pause
    renderLoop();
  }
}

/* ─── Hook into the About modal open/close ─── */
// The main script calls setAboutOpen() — we observe the DOM attribute.
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "attributes" && m.attributeName === "hidden") {
      const modal = document.getElementById("aboutModal");
      if (!modal) return;
      if (modal.hidden) {
        pauseRenderer();
      } else {
        // First open → init; subsequent opens → resume
        if (!initialized) {
          // Small delay so the panel has laid out and we can read clientWidth
          requestAnimationFrame(() => requestAnimationFrame(initMascot));
        } else {
          resumeRenderer();
        }
      }
    }
  }
});

// Start observing once DOM is ready
function hookModal() {
  const modal = document.getElementById("aboutModal");
  if (!modal) {
    // Script loaded before DOM; retry
    setTimeout(hookModal, 100);
    return;
  }
  observer.observe(modal, { attributes: true });
}

hookModal();
