class PointerLockControls extends THREE.EventDispatcher {
  constructor(camera, domElement) {
    super();
    if (domElement === undefined) {
      domElement = document.body;
    }

    this.domElement = domElement;
    this.isLocked = false;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.pointerSpeed = 1.0;

    camera.rotation.set(0, 0, 0);

    const scope = this;
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const PI_2 = Math.PI / 2;
    let vec = new THREE.Vector3();
    let changeEvent = { type: "change" };
    let lockEvent = { type: "lock" };
    let unlockEvent = { type: "unlock" };

    function onMouseMove(event) {
      if (scope.isLocked === false) return;

      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      euler.setFromQuaternion(camera.quaternion);
      euler.y -= movementX * 0.002 * scope.pointerSpeed;
      euler.x -= movementY * 0.002 * scope.pointerSpeed;
      euler.x = Math.max(PI_2 - scope.maxPolarAngle, Math.min(PI_2 - scope.minPolarAngle, euler.x));
      camera.quaternion.setFromEuler(euler);

      scope.dispatchEvent(changeEvent);
    }

    function onPointerlockChange() {
      if (scope.domElement.ownerDocument.pointerLockElement === scope.domElement) {
        scope.dispatchEvent(lockEvent);
        scope.isLocked = true;
      } else {
        scope.dispatchEvent(unlockEvent);
        scope.isLocked = false;
      }
    }

    function onPointerlockError() {
      console.error("PointerLockControls: Unable to use Pointer Lock API");
    }

    this.connect = function () {
      scope.domElement.ownerDocument.addEventListener("mousemove", onMouseMove);
      scope.domElement.ownerDocument.addEventListener("pointerlockchange", onPointerlockChange);
      scope.domElement.ownerDocument.addEventListener("pointerlockerror", onPointerlockError);
    };

    this.disconnect = function () {
      scope.domElement.ownerDocument.removeEventListener("mousemove", onMouseMove);
      scope.domElement.ownerDocument.removeEventListener("pointerlockchange", onPointerlockChange);
      scope.domElement.ownerDocument.removeEventListener("pointerlockerror", onPointerlockError);
    };

    this.dispose = function () {
      scope.disconnect();
    };

    this.getObject = function () {
      return camera;
    };

    this.getDirection = function () {
      const direction = new THREE.Vector3(0, 0, -1);
      return function (v) {
        return v.copy(direction).applyQuaternion(camera.quaternion);
      };
    }();

    this.moveForward = function (distance) {
      vec.setFromMatrixColumn(camera.matrix, 0);
      vec.crossVectors(camera.up, vec);
      camera.position.addScaledVector(vec, distance);
    };

    this.moveRight = function (distance) {
      vec.setFromMatrixColumn(camera.matrix, 0);
      camera.position.addScaledVector(vec, distance);
    };

    this.lock = function () {
      scope.domElement.requestPointerLock();
    };

    this.unlock = function () {
      scope.domElement.ownerDocument.exitPointerLock();
    };

    this.connect();
  }
}

const canvas = document.querySelector("#game");
const menuScreen = document.querySelector("#menu-screen");
const optionsScreen = document.querySelector("#options-screen");
const creditsScreen = document.querySelector("#credits-screen");
const pauseScreen = document.querySelector("#pause-screen");
const startBtn = document.querySelector("#start-btn");
const optionsBtn = document.querySelector("#options-btn");
const creditsBtn = document.querySelector("#credits-btn");
const backButtons = document.querySelectorAll(".back-btn");
const resumeBtn = document.querySelector("#resume-btn");
const returnBtn = document.querySelector("#return-btn");
const sensitivityInput = document.querySelector("#sensitivity");
const ambienceInput = document.querySelector("#ambience");
const fogInput = document.querySelector("#fog");
const slotsContainer = document.querySelector("#inventory .slots");
const notePanel = document.querySelector("#note-panel");
const closeNoteBtn = document.querySelector("#close-note");
const messageEl = document.querySelector("#message");
const objectiveItems = document.querySelectorAll("#objective li");
const healthBar = document.querySelector("#health-bar");
const fearBar = document.querySelector("#fear-bar");
const threatBar = document.querySelector("#threat-bar");

const state = {
  running: false,
  paused: false,
  sensitivity: 1,
  fogDensity: 0.05,
  health: 100,
  fear: 0,
  selectedSlot: 0,
  inventory: Array.from({ length: 6 }, () => null),
  objectives: {
    mapa: false,
    amuleto: false,
    llave: false,
  },
  messageTimeout: null,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.FogExp2(0x05070b, state.fogDensity);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

const controls = new PointerLockControls(camera, document.body);

const player = {
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  speed: 6,
  flashlight: null,
};

const keyState = new Set();

const ambientLight = new THREE.AmbientLight(0x203040, 0.4);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0x7ec8ff, 0.5);
moonLight.position.set(30, 40, -20);
scene.add(moonLight);

const flashlight = new THREE.SpotLight(0xbad9ff, 2.2, 30, Math.PI / 8, 0.3, 1.5);
flashlight.position.set(0, 1.6, 0);
flashlight.target.position.set(0, 1.5, -1);
scene.add(flashlight, flashlight.target);

const groundGeometry = new THREE.PlaneGeometry(200, 200, 40, 40);
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a0f15,
  roughness: 1,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const treeGroup = new THREE.Group();
const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 });
const treeTopMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1f0c, roughness: 0.8 });

for (let i = 0; i < 140; i += 1) {
  const trunkHeight = 2 + Math.random() * 3;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, trunkHeight, 6), treeTrunkMaterial);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.5, 8), treeTopMaterial);
  const tree = new THREE.Group();
  tree.add(trunk, top);
  trunk.position.y = trunkHeight / 2;
  top.position.y = trunkHeight + 1;
  const angle = Math.random() * Math.PI * 2;
  const radius = 25 + Math.random() * 60;
  tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  tree.rotation.y = Math.random() * Math.PI * 2;
  treeGroup.add(tree);
}

scene.add(treeGroup);

const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.8 });
const obstacles = [];
for (let i = 0; i < 20; i += 1) {
  const size = 1 + Math.random() * 2.5;
  const rock = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.6, size), obstacleMaterial);
  rock.position.set((Math.random() - 0.5) * 80, size * 0.3, (Math.random() - 0.5) * 80);
  obstacles.push(rock);
  scene.add(rock);
}

const itemMaterial = new THREE.MeshStandardMaterial({ color: 0x7ce7ff, emissive: 0x1b3e5a });
const items = [];
const requiredItems = [
  { key: "mapa", name: "Mapa viejo", color: 0x7ce7ff },
  { key: "amuleto", name: "Amuleto", color: 0xffd166 },
  { key: "llave", name: "Llave oxidada", color: 0xff7b88 },
];

function createItem(def, position) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.color,
    emissiveIntensity: 0.6,
  }));
  mesh.position.copy(position);
  mesh.userData = {
    key: def.key,
    name: def.name,
    type: "objective",
  };
  scene.add(mesh);
  items.push(mesh);
}

requiredItems.forEach((item, index) => {
  createItem(item, new THREE.Vector3(-20 + index * 16, 0.6, -25 + index * 10));
});

const noteItem = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), itemMaterial);
noteItem.position.set(10, 0.4, -8);
noteItem.userData = { key: "nota", name: "Nota", type: "note" };
scene.add(noteItem);
items.push(noteItem);

const flashlightItem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10), new THREE.MeshStandardMaterial({
  color: 0xb0b6bf,
  emissive: 0x1a1f22,
}));
flashlightItem.position.set(-6, 0.4, 6);
flashlightItem.userData = { key: "linterna", name: "Linterna", type: "flashlight" };
scene.add(flashlightItem);
items.push(flashlightItem);

const entity = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0x2f0015, emissive: 0x33000f, emissiveIntensity: 0.8 })
);
entity.position.set(25, 1.2, 25);
scene.add(entity);

const entityData = {
  speed: 2.2,
  baseSpeed: 2.2,
  maxSpeed: 6,
};

const inventoryLabels = ["Linterna", "Nota", "Vacío", "Vacío", "Vacío", "Vacío"];
state.inventory[0] = { key: "linterna", name: "Linterna", type: "flashlight" };
state.inventory[1] = { key: "nota", name: "Nota", type: "note" };

function renderInventory() {
  slotsContainer.innerHTML = "";
  state.inventory.forEach((item, index) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (index === state.selectedSlot) {
      slot.classList.add("active");
    }
    if (item) {
      slot.classList.add("filled");
      slot.textContent = item.name;
    } else {
      slot.textContent = "Vacío";
    }
    slotsContainer.appendChild(slot);
  });
}

renderInventory();

function showMessage(text, duration = 2200) {
  messageEl.textContent = text;
  messageEl.classList.add("active");
  clearTimeout(state.messageTimeout);
  state.messageTimeout = setTimeout(() => {
    messageEl.classList.remove("active");
  }, duration);
}

function updateObjectives() {
  objectiveItems.forEach((item) => {
    const key = item.dataset.key;
    if (state.objectives[key]) {
      item.classList.add("complete");
    }
  });
}

function setNotePanel(visible) {
  notePanel.classList.toggle("active", visible);
}

function togglePause(paused) {
  state.paused = paused;
  pauseScreen.classList.toggle("active", paused);
  if (paused) {
    controls.unlock();
  } else {
    controls.lock();
  }
}

function startGame() {
  menuScreen.classList.remove("active");
  creditsScreen.classList.remove("active");
  optionsScreen.classList.remove("active");
  pauseScreen.classList.remove("active");
  state.running = true;
  state.health = 100;
  state.fear = 0;
  player.velocity.set(0, 0, 0);
  camera.position.set(0, 1.6, 5);
  controls.lock();
  showMessage("Encuentra los 3 objetos clave y evita la entidad.");
}

function returnToMenu() {
  state.running = false;
  state.paused = false;
  menuScreen.classList.add("active");
  pauseScreen.classList.remove("active");
  controls.unlock();
}

startBtn.addEventListener("click", startGame);
optionsBtn.addEventListener("click", () => {
  menuScreen.classList.remove("active");
  optionsScreen.classList.add("active");
});
creditsBtn.addEventListener("click", () => {
  menuScreen.classList.remove("active");
  creditsScreen.classList.add("active");
});
backButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    optionsScreen.classList.remove("active");
    creditsScreen.classList.remove("active");
    menuScreen.classList.add("active");
  });
});
resumeBtn.addEventListener("click", () => togglePause(false));
returnBtn.addEventListener("click", returnToMenu);

closeNoteBtn.addEventListener("click", () => setNotePanel(false));

window.addEventListener("keydown", (event) => {
  if (!state.running) return;
  if (event.code === "Escape") {
    togglePause(!state.paused);
    return;
  }
  if (state.paused) return;

  if (event.code.startsWith("Digit")) {
    const index = Number(event.code.replace("Digit", "")) - 1;
    if (index >= 0 && index < state.inventory.length) {
      state.selectedSlot = index;
      renderInventory();
    }
  }

  keyState.add(event.code);

  if (event.code === "KeyE") {
    pickUpItem();
  }
  if (event.code === "KeyQ") {
    dropItem();
  }
  if (event.code === "KeyN") {
    setNotePanel(true);
  }
});

window.addEventListener("keyup", (event) => {
  keyState.delete(event.code);
});

sensitivityInput.addEventListener("input", (event) => {
  state.sensitivity = Number(event.target.value);
});

ambienceInput.addEventListener("input", (event) => {
  ambienceGain.gain.value = Number(event.target.value);
});

fogInput.addEventListener("input", (event) => {
  state.fogDensity = Number(event.target.value);
  scene.fog.density = state.fogDensity;
});

function pickUpItem() {
  const availableIndex = state.inventory.findIndex((slot) => slot === null);
  if (availableIndex === -1) {
    showMessage("Inventario lleno.");
    return;
  }

  const item = items.find((mesh) => mesh.position.distanceTo(camera.position) < 2.2);
  if (!item) {
    showMessage("No hay nada cerca.");
    return;
  }

  const { key, name, type } = item.userData;
  if (state.inventory.some((slot) => slot?.key === key)) {
    showMessage("Ya tienes este objeto.");
    return;
  }

  state.inventory[availableIndex] = { key, name, type };
  scene.remove(item);
  items.splice(items.indexOf(item), 1);
  renderInventory();
  showMessage(`Has tomado ${name}.`);

  if (type === "note") {
    setNotePanel(true);
  }

  if (type === "objective") {
    state.objectives[key] = true;
    updateObjectives();
    checkWin();
  }
}

function dropItem() {
  const item = state.inventory[state.selectedSlot];
  if (!item) {
    showMessage("Slot vacío.");
    return;
  }
  const drop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), itemMaterial);
  drop.position.copy(camera.position);
  drop.position.y = 0.5;
  drop.userData = { ...item, type: item.type === "objective" ? "objective" : item.type };
  scene.add(drop);
  items.push(drop);
  if (item.type === "objective") {
    state.objectives[item.key] = false;
  }
  state.inventory[state.selectedSlot] = null;
  renderInventory();
  updateObjectives();
  showMessage(`Has soltado ${item.name}.`);
}

function checkWin() {
  if (Object.values(state.objectives).every(Boolean)) {
    showMessage("¡Has reunido los objetos! Busca la salida...", 3000);
    setTimeout(() => {
      showMessage("Victoria: escapaste del bosque.");
      returnToMenu();
    }, 3500);
  }
}

function updateUI() {
  healthBar.style.width = `${state.health}%`;
  fearBar.style.width = `${Math.min(100, state.fear)}%`;
  const distance = entity.position.distanceTo(camera.position);
  const threat = Math.max(0, 100 - distance * 6);
  threatBar.style.width = `${Math.min(100, threat)}%`;
}

function updatePlayer(delta) {
  player.direction.set(0, 0, 0);
  if (keyState.has("KeyW")) player.direction.z -= 1;
  if (keyState.has("KeyS")) player.direction.z += 1;
  if (keyState.has("KeyA")) player.direction.x -= 1;
  if (keyState.has("KeyD")) player.direction.x += 1;
  player.direction.normalize();

  player.velocity.x = player.direction.x * player.speed;
  player.velocity.z = player.direction.z * player.speed;

  controls.moveRight(player.velocity.x * delta);
  controls.moveForward(player.velocity.z * delta);

  camera.position.y = 1.6 + Math.sin(Date.now() * 0.01) * 0.03;

  flashlight.position.copy(camera.position);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  flashlight.target.position.copy(camera.position.clone().add(forward.multiplyScalar(2)));
  flashlight.target.updateMatrixWorld();

  const hasFlashlight = state.inventory.some((slot) => slot?.key === "linterna");
  flashlight.intensity = hasFlashlight ? 2.2 : 0.2;
}

function updateEntity(delta) {
  const toPlayer = new THREE.Vector3().subVectors(camera.position, entity.position);
  const distance = toPlayer.length();
  const speedBoost = Math.max(0, (20 - distance) * 0.15);
  entityData.speed = Math.min(entityData.maxSpeed, entityData.baseSpeed + speedBoost);
  toPlayer.normalize();
  entity.position.add(toPlayer.multiplyScalar(entityData.speed * delta));

  if (distance < 2) {
    state.health = Math.max(0, state.health - 18 * delta);
    state.fear = Math.min(100, state.fear + 20 * delta);
    if (state.health <= 0) {
      showMessage("Has sido alcanzado. Fin de la partida.");
      returnToMenu();
    }
  } else if (distance < 10) {
    state.fear = Math.min(100, state.fear + 8 * delta);
  } else {
    state.fear = Math.max(0, state.fear - 6 * delta);
  }
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  if (!state.running || state.paused) {
    renderer.render(scene, camera);
    return;
  }

  const delta = clock.getDelta();
  updatePlayer(delta);
  updateEntity(delta);
  updateUI();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const audioContext = new AudioContext();
const ambienceGain = audioContext.createGain();
ambienceGain.gain.value = Number(ambienceInput.value);
const oscillator = audioContext.createOscillator();
oscillator.type = "sawtooth";
oscillator.frequency.value = 55;
oscillator.connect(ambienceGain);
ambienceGain.connect(audioContext.destination);
oscillator.start();

window.addEventListener("click", () => {
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
});
