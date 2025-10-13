import * as THREE from "three";
import createModule from "lammps.js";

const canvas = document.getElementById("scene") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
camera.position.set(0, 4, 10);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 0.7);
const key = new THREE.DirectionalLight(0xffffff, 0.6);
key.position.set(2, 3, 2);
const fill = new THREE.DirectionalLight(0xffffff, 0.25);
fill.position.set(-3, -2, -1);
scene.add(hemi, key, fill);

const atomsGeometry = new THREE.BufferGeometry();
const atomMaterial = new THREE.PointsMaterial({
  color: 0x38bdf8,
  size: 0.18,
  sizeAttenuation: true,
});
const atoms = new THREE.Points(atomsGeometry, atomMaterial);
scene.add(atoms);

const bondsGeometry = new THREE.BufferGeometry();
const bondsMaterial = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1 });
const bonds = new THREE.LineSegments(bondsGeometry, bondsMaterial);
scene.add(bonds);

const boxMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1, opacity: 0.5, transparent: true });
const box = new THREE.LineLoop(new THREE.BufferGeometry(), boxMaterial);
scene.add(box);

const resize = () => {
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
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
  const [module, script] = await Promise.all([createModule(), fetchInput()]);
  const lmp = new module.LAMMPSWeb();

  try {
    module.FS.mkdir("/work");
  } catch {}
  module.FS.chdir("/work");
  module.FS.writeFile("in.lj", script);

  lmp.start();
  lmp.runFile("in.lj");

  const step = () => {
    lmp.advance(1, false, false);

    const particles = lmp.syncParticles();
    const bondsSnap = lmp.syncBonds();
    const boxSnap = lmp.syncSimulationBox();

    const pos = module.HEAPF32.subarray(
      particles.positions.ptr >> 2,
      (particles.positions.ptr >> 2) + particles.positions.length
    );
    atomsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(Float32Array.from(pos), 3)
    );
    atomsGeometry.setDrawRange(0, particles.count);
    if (particles.count > 0) {
      atomsGeometry.computeBoundingSphere();
    }

    const p1 = module.HEAPF32.subarray(
      bondsSnap.first.ptr >> 2,
      (bondsSnap.first.ptr >> 2) + bondsSnap.first.length
    );
    const p2 = module.HEAPF32.subarray(
      bondsSnap.second.ptr >> 2,
      (bondsSnap.second.ptr >> 2) + bondsSnap.second.length
    );
    const bondsBuffer = bondsSnap.count
      ? packBonds(Float32Array.from(p1), Float32Array.from(p2))
      : new Float32Array(0);
    bondsGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(bondsBuffer, 3)
    );
    bondsGeometry.setDrawRange(0, bondsSnap.count * 2);
    if (bondsSnap.count > 0) {
      bondsGeometry.computeBoundingSphere();
    }

    const matrix = module.HEAPF32.subarray(
      boxSnap.matrix.ptr >> 2,
      (boxSnap.matrix.ptr >> 2) + boxSnap.matrix.length
    );
    const origin = module.HEAPF32.subarray(
      boxSnap.origin.ptr >> 2,
      (boxSnap.origin.ptr >> 2) + boxSnap.origin.length
    );

    const boxBuffer = buildBox(Float32Array.from(matrix), Float32Array.from(origin));
    box.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(boxBuffer, 3)
    );
    box.geometry.setDrawRange(0, boxBuffer.length / 3);
  };

  const animate = () => {
    step();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener("beforeunload", () => {
    lmp.stop();
  });
})();
