import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { createLammps } from "lammps.js/client";

const canvas = document.getElementById("scene") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020617);
scene.fog = new THREE.Fog(0x020617, 15, 40);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
camera.position.set(5, 6, 10);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 25;
controls.target.set(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.75);
const key = new THREE.DirectionalLight(0xf8fafc, 0.65);
key.position.set(6, 8, 6);
const rim = new THREE.DirectionalLight(0x38bdf8, 0.35);
rim.position.set(-6, -4, -5);
scene.add(hemi, key, rim);

const floorGeometry = new THREE.PlaneGeometry(24, 24);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x0f172a,
  metalness: 0.1,
  roughness: 0.95,
  transparent: true,
  opacity: 0.6,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -4.5;
scene.add(floor);

const MAX_PARTICLES = 2048;

const atomGeometry = new THREE.SphereGeometry(0.18, 32, 20);
const atomMaterial = new THREE.MeshStandardMaterial({
  color: 0x60a5fa,
  metalness: 0.35,
  roughness: 0.3,
  emissive: 0x0b1120,
  emissiveIntensity: 0.6,
  vertexColors: true,
});
const atoms = new THREE.InstancedMesh(atomGeometry, atomMaterial, MAX_PARTICLES);
atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
atoms.count = 0;
atoms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3).setUsage(
  THREE.DynamicDrawUsage
);
scene.add(atoms);

const bondsGeometry = new THREE.BufferGeometry();
const bondsMaterial = new THREE.LineBasicMaterial({
  color: 0x94a3b8,
  linewidth: 1,
  transparent: true,
  opacity: 0.5,
});
const bonds = new THREE.LineSegments(bondsGeometry, bondsMaterial);
scene.add(bonds);

const boxMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff,
  linewidth: 1,
  transparent: true,
  opacity: 0.35,
});
const box = new THREE.LineLoop(new THREE.BufferGeometry(), boxMaterial);
scene.add(box);

const USE_WRAPPED = false;
const mat = new THREE.Matrix4();
const color = new THREE.Color();

const resize = () => {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
};

window.addEventListener("resize", resize);
resize();

const fetchInput = async () => {
  const res = await fetch("/in.lj");
  if (!res.ok) throw new Error("Failed to fetch LAMMPS input script");
  return res.text();
};

const packBonds = (p1: Float32Array, p2: Float32Array) => {
  const count = p1.length / 3;
  const arr = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const src = i * 3;
    const dst = i * 6;
    arr[dst + 0] = p1[src + 0];
    arr[dst + 1] = p1[src + 1];
    arr[dst + 2] = p1[src + 2];
    arr[dst + 3] = p2[src + 0];
    arr[dst + 4] = p2[src + 1];
    arr[dst + 5] = p2[src + 2];
  }
  return arr;
};

const buildBox = (matrix: Float32Array, origin: Float32Array) => {
  if (!matrix.length || !origin.length) return new Float32Array(0);
  const ax = matrix[0];
  const ay = matrix[1];
  const bx = matrix[3];
  const by = matrix[4];
  const ox = origin[0];
  const oy = origin[1];
  return new Float32Array([
    ox, oy, 0,
    ox + ax, oy + ay, 0,
    ox + ax + bx, oy + ay + by, 0,
    ox + bx, oy + by, 0,
  ]);
};

(async () => {
  const [script, client] = await Promise.all([fetchInput(), createLammps()]);
  client.start();
  client.runInput("in.lj", script);

  const step = () => {
    client.advance(1, { applyPre: false, applyPost: false });

    const particles = client.syncParticles({ wrapped: USE_WRAPPED });
    const bondsSnap = client.syncBonds({ wrapped: USE_WRAPPED, copy: true });
    const boxSnap = client.syncBox({ copy: true });

    const pos = particles.positions;
    const count = Math.min(particles.count, MAX_PARTICLES);
    atoms.count = count;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      mat.makeTranslation(pos[idx], pos[idx + 1], pos[idx + 2]);
      atoms.setMatrixAt(i, mat);
      const height = THREE.MathUtils.clamp((pos[idx + 1] + 5) / 10, 0, 1);
      color.setHSL(0.55 - height * 0.15, 0.65, 0.55 + height * 0.15);
      atoms.setColorAt(i, color);
    }
    atoms.instanceMatrix.needsUpdate = true;
    if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;

    const bondsBuffer = bondsSnap.count
      ? packBonds(bondsSnap.first, bondsSnap.second)
      : new Float32Array(0);
    bondsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(bondsBuffer, 3)
    );
    bondsGeometry.setDrawRange(0, bondsSnap.count * 2);
    if (bondsSnap.count > 0) {
      bondsGeometry.computeBoundingSphere();
    }

    const boxBuffer = buildBox(boxSnap.matrix, boxSnap.origin);
    box.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(boxBuffer, 3)
    );
    box.geometry.setDrawRange(0, boxBuffer.length / 3);
  };

  const animate = () => {
    step();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener("beforeunload", () => {
    client.dispose();
    atoms.dispose();
    bonds.geometry.dispose();
    box.geometry.dispose();
  });
})();
