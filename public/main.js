import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Constants
// biome-ignore format: vars
const
  SCALE_CAMERA = false,
  PLATFORM_RADIUS = 2,
  PLATFORM_SEGMENTS = 64,
  LOAD_INIT_MODEL = true,
  DEFAULT_MODEL = "/millennium_falcon.glb",
  DEFAULT_MATERIAL_MODE = "holo",
  DEFAULT_MODEL_ORIENTATION = Math.PI / 2.5,
  ANIMATE_PLATFORM_OPACITY = false,
  USE_COLOR_INTENSITY = false,
  RING_DIAMETERS = [0.9, 1.2, 1.5],
  RING_THICKNESS = [0.004, 0.008, 0.012],
  RING_OPACITIES = [0.35, 0.35, 0.4],
  MODEL_ROTATION_ENABLED = true,
  MODEL_ROTATION_SPEED = 0.05,
  MODEL_ROTATION_MIN_SPEED = 0.09,
  MODEL_ROTATION_MAX_SPEED = 4.2,
  MODEL_ROTATION_STEP_INTERVAL = 10,
  MODEL_ROTATION_STEP_SIZE = 0.05,
  SPEED_GAUGE_SEGMENTS = 15,
  SPEED_SEGMENTS = Array.from(
    { length: SPEED_GAUGE_SEGMENTS },
    (_, i) => MODEL_ROTATION_MIN_SPEED + (MODEL_ROTATION_MAX_SPEED - MODEL_ROTATION_MIN_SPEED) * (i / (SPEED_GAUGE_SEGMENTS - 1))
  ),
  COLORS_NEON_GEN_BLUE = {
    base: 0x00ffff,
    darkBase: 0x00ccff,
    emissive: 0x00ffce,
    specular: 0x00ffce,
  },
    COLORS_ORANGE = {
    base: 0xff8c00,
    darkBase: 0xff4800,
    emissive: 0x800000,
    specular: 0xff9900,
  },
    COLORS_AURA = {
    base: 0xee6d2b,
    darkBase: 0x8b4513,
    emissive: 0x8b4513,
    specular: 0x8b4513,
  },
    COLORS_VERDE = {
    base: 0x399334,
    darkBase: 0x2e7d32,
    emissive: 0x2e7d32,
    specular: 0x2e7d32,
  },
  COLORS = COLORS_NEON_GEN_BLUE
;


// biome-ignore format: vars
let
  scene = null,
  camera = null,
  renderer = null,
  controls = null,
  model = null,
  animationId = null,
  timeValue = 0,
  rotationFrame = 0,
  viewMode = DEFAULT_MATERIAL_MODE,
  modelLoaded = false,
  modelStats = null,
  rotationEnabled = MODEL_ROTATION_ENABLED,
  rotationSpeed = MODEL_ROTATION_SPEED,
  isDragging = false,
  isPanelDragEnabled = false,
  isPanelDragging = false,
  dragOffset = { x: 0, y: 0 }
;

document.addEventListener('DOMContentLoaded', init);

function init() {
  setupThreeJs();
  setupUI();
  setupEvents();
  calculateTicks();
  generateXenoScript();
  setupHexaGrid();
  setupSpeedGauge();
  
  if (LOAD_INIT_MODEL) {
    loadModel(DEFAULT_MODEL, DEFAULT_MODEL.split("/").pop() || "Unknown Model");
  }
  
  animate();
}

function setupThreeJs() {
  scene = new THREE.Scene();
  
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 3);

  // some alpha for transparency
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('interface-plane').appendChild(renderer.domElement);
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);
  
  // 3d platform
  const platformGeometry = new THREE.CircleGeometry(PLATFORM_RADIUS, PLATFORM_SEGMENTS);
  const platformMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.base,
    side: THREE.DoubleSide,
    opacity: 0.15,
    transparent: true
  });
  const platform = new THREE.Mesh(platformGeometry, platformMaterial);
  platform.rotation.x = -Math.PI / 2; // lay flat
  platform.position.y = -0.01; // slightly below origin to avoid z-fighting
  scene.add(platform);
  
  // setup
  const rings = createPlatformRings();
  rings.forEach(ring => scene.add(ring));
  scene.add(createCross());
  
  // handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    calculateTicks();
  });
}

function setupUI() {
  // at the moment nothing needed here, DOM elements already defined in HTML
}

function setupEvents() {
  document.getElementById('model-upload').addEventListener('change', (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const file = e.target.files[0];
    if (!file) return;
    
    const url = URL.createObjectURL(file);
    loadModel(url, file.name);
  });
  
  // view mode buttons
  document.getElementById('btn-normal').addEventListener('click', () => {
    setMaterialMode('normal');
  });
  document.getElementById('btn-holo').addEventListener('click', () => {
    setMaterialMode('holo');
  });
  document.getElementById('btn-spider').addEventListener('click', () => {
    setMaterialMode('spider');
  });
  
  // rotation toggle
  document.getElementById('btn-rotate').addEventListener('click', () => {
    rotationEnabled = !rotationEnabled;
    document.getElementById('btn-rotate').classList.toggle('active', rotationEnabled);
    
    const secondaryText = document.querySelector('#btn-rotate .button-secondary-text');
    if (secondaryText) {
      secondaryText.textContent = rotationEnabled ? "Freeze Model" : "Rotate Model";
    }
    
    updateSpeedGaugeState();
  });
  
  // clear model button
  document.getElementById('btn-clear').addEventListener('click', clearModel);
  
  // panel movement
  document.getElementById('btn-move-panel').addEventListener('click', togglePanelDrag);
  const panel = document.getElementById('interface-panel');
  panel.addEventListener('mousedown', (e) => {
    if (!isPanelDragEnabled) return;
    e.stopPropagation();
    
    const rect = panel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    isPanelDragging = true;
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isPanelDragging) return;
    
    panel.style.left = `${e.clientX - dragOffset.x}px`;
    panel.style.top = `${e.clientY - dragOffset.y}px`;
  });
  
  document.addEventListener('mouseup', () => {
    isPanelDragging = false;
  });
  
  // speed gauge
  const speedGauge = document.getElementById('speed-gauge');
  speedGauge.addEventListener('mousedown', handleSpeedGaugeMouseDown);
  document.addEventListener('mousemove', handleSpeedGaugeMouseMove);
  document.addEventListener('mouseup', handleSpeedGaugeMouseUp);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  controls.update();
  timeValue += 0.01;
  
  if (rotationEnabled && model) {
    rotationFrame += 1;
    if (rotationFrame % MODEL_ROTATION_STEP_INTERVAL === 0) {
      model.rotation.y += MODEL_ROTATION_STEP_SIZE * rotationSpeed;
    }
  }
  
  if (model) {
    updateHolographicEffect();
  }
  
  // random scan line effect
  if (Math.random() > 0.98) {
    const lineMaterial = new THREE.LineBasicMaterial({
      color: COLORS.base,
      transparent: true,
      opacity: 0.1 + Math.random() * 0.5
    });
    
    const lineGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(2 * 3);
    positions[0] = Math.random() * 2 - 1;
    positions[1] = Math.random() * 2 - 1;
    positions[2] = Math.random() * 2 - 1;
    positions[3] = Math.random() * 2 - 1;
    positions[4] = Math.random() * 2 - 1;
    positions[5] = Math.random() * 2 - 1;
    
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);
    
    // remove line after 1 second
    setTimeout(() => {
      scene.remove(line);
    }, 1000);
  }
 
  // render full scene
  renderer.render(scene, camera);
}

function loadModel(url, fileName) {
  const loader = new GLTFLoader();
  
  if (model && scene) {
    scene.remove(model);
    model = null;
  }
  
  loader.load(
    url,
    (gltf) => {
      model = gltf.scene;
      
      // calculate bounding box
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      // scale model to fit platform diameter
      const platformDiameter = 3.5;
      const maxDimension = Math.max(size.x, size.y, size.z);
      // reduce scaling by 20%
      const scaleFactor = (platformDiameter / maxDimension) * 0.8;
      model.scale.multiplyScalar(scaleFactor);
      
      // center model and align base with platform
      model.position.sub(center.multiplyScalar(scaleFactor));
      const newBox = new THREE.Box3().setFromObject(model);
      const minY = newBox.min.y;
      // align base with platform (y = 0)
      model.position.y -= minY;
      // apply default orientation
      model.rotation.y = DEFAULT_MODEL_ORIENTATION;
      
      scene.add(model);
      modelLoaded = true;
      
      modelStats = calculateModelStats(fileName);
      updateUIStats();
      
      // apply material mode
      applyMaterialMode(viewMode);
      
      // update button states
      updateButtonStates(true);
      
      // adjust camera if needed
      if (SCALE_CAMERA) {
        camera.position.z = platformDiameter * 0.8;
        controls.update();
      }
      
      // only revoke URL if blob URL
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    },
    (xhr) => {
      // Loading progress
      console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
    },
    (error) => {
      console.error('Error loading model:', error);
    }
  );
}

function calculateModelStats(fileName) {
  if (!model) return null;
  
  let vertices = 0;
  let triangles = 0;
  let meshCount = 0;
  const materials = new Set();
  
  model.traverse((child) => {
    if (child.isMesh) {
      meshCount++;
      
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => materials.add(mat));
        } else {
          materials.add(child.material);
        }
      }
      
      if (child.geometry) {
        const geometry = child.geometry;
        if (geometry.index !== null) {
          triangles += geometry.index.count / 3;
        } else if (geometry.attributes.position) {
          triangles += geometry.attributes.position.count / 3;
        }
        
        if (geometry.attributes.position) {
          vertices += geometry.attributes.position.count;
        }
      }
    }
  });
  
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  
  return {
    fileName,
    vertices,
    triangles: Math.floor(triangles),
    meshes: meshCount,
    materials: materials.size,
    dimensions: {
      width: Number.parseFloat(size.x.toFixed(2)),
      height: Number.parseFloat(size.y.toFixed(2)),
      depth: Number.parseFloat(size.z.toFixed(2))
    }
  };
}

function updateUIStats() {
  if (!modelStats) {
    document.getElementById('stats-filename').textContent = '--';
    document.getElementById('stats-meshes').textContent = '--';
    document.getElementById('stats-vertices').textContent = '--';
    document.getElementById('stats-materials').textContent = '--';
    document.getElementById('stats-triangles').textContent = '--';
    document.getElementById('stats-size').textContent = '--';
    return;
  }
  
  // set filename with potential scrolling for long names
  const filenameElement = document.getElementById('stats-filename');
  filenameElement.textContent = modelStats.fileName;
  setupScrollingText(filenameElement, modelStats.fileName);
  
  document.getElementById('stats-meshes').textContent = modelStats.meshes.toString();
  document.getElementById('stats-vertices').textContent = modelStats.vertices.toLocaleString();
  document.getElementById('stats-materials').textContent = modelStats.materials.toString();
  document.getElementById('stats-triangles').textContent = modelStats.triangles.toLocaleString();
  document.getElementById('stats-size').textContent = 
    `${modelStats.dimensions.width}×${modelStats.dimensions.height}×${modelStats.dimensions.depth}`;
}

// todo: this is not fully working
function setupScrollingText(element, text) {
  const parentWidth = element.parentElement.offsetWidth;
  
  const tempSpan = document.createElement('span');
  tempSpan.style.visibility = 'hidden';
  tempSpan.style.position = 'absolute';
  tempSpan.style.whiteSpace = 'nowrap';
  tempSpan.textContent = text;
  document.body.appendChild(tempSpan);
  const textWidth = tempSpan.offsetWidth;
  document.body.removeChild(tempSpan);
  
  // if text fits, no scrolling needed
  if (textWidth <= parentWidth) return;
  
  // Create scrolling container
  const container = document.createElement('div');
  container.className = 'scrolling-text';
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  container.appendChild(textSpan);
  
  // clear the element and add the scrolling container
  element.textContent = '';
  element.appendChild(container);
  
  // setup scrolling animation
  const scrollAmount = textWidth - parentWidth + 10; // Add padding
  let isScrolling = false;
  
  // function to scroll from start to end
  function scrollToEnd() {
    textSpan.classList.remove('paused');
    textSpan.style.transform = `translateX(-${scrollAmount}px)`;
    isScrolling = true;
    
    // wait for the transition to complete, then pause
    setTimeout(() => {
      textSpan.classList.add('paused');
      isScrolling = false;
      
      // pause at the end before scrolling back
      setTimeout(() => {
        scrollToStart();
      }, 1500);
    }, 1500);
  }
  
  // scroll back to start
  function scrollToStart() {
    textSpan.classList.remove('paused');
    textSpan.style.transform = 'translateX(0)';
    isScrolling = true;
    
    setTimeout(() => {
      textSpan.classList.add('paused');
      isScrolling = false;
      
      setTimeout(() => {
        scrollToEnd();
      }, 2000);
    }, 1500);
  }
  
  // start scrolling after an initial delay
  setTimeout(() => {
    scrollToEnd();
  }, 2000);
}

function setMaterialMode(mode) {
  // update UI button states
  document.getElementById('btn-normal').classList.toggle('active', mode === 'normal');
  document.getElementById('btn-holo').classList.toggle('active', mode === 'holo');
  document.getElementById('btn-spider').classList.toggle('active', mode === 'spider');
  
  // update mode state and apply to model
  viewMode = mode;
  if (model) {
    applyMaterialMode(mode);
  }
}

function applyMaterialMode(mode) {
  if (!model) return;
  
  model.traverse((child) => {
    if (child.isMesh && child.material) {
      // save original material for reverting later
      if (mode !== "normal" && !child.userData.originalMaterial) {
        child.userData.originalMaterial = child.material.clone();
      }
      
      if (mode === "spider") {
        // apply spider view (wireframe)
        const spiderMaterial = new THREE.MeshPhongMaterial({
          color: COLORS.base,
          emissive: COLORS.emissive,
          specular: COLORS.specular,
          shininess: 30,
          wireframe: true,
          transparent: true,
          opacity: 0.7,
          flatShading: true
        });
        child.material = spiderMaterial;
      } 
      else if (mode === "holo") {
        // apply holographic view
        const originalColor = child.material.color || new THREE.Color(0xffffff);
        const colorIntensity = (originalColor.r + originalColor.g + originalColor.b) / 3;
        let baseOpacity = 0.5;
        
        if (USE_COLOR_INTENSITY) {
          // use color intensity to determine opacity
          baseOpacity = Math.max(0.3, Math.min(0.8, colorIntensity));
        }
        
        const holoMaterial = new THREE.MeshStandardMaterial({
          color: COLORS.base,
          emissive: COLORS.emissive,
          roughness: 0.2,
          metalness: 0.8,
          transparent: true,
          opacity: baseOpacity
        });
        
        // use size and position to mark important parts for animation
        const bbox = new THREE.Box3().setFromObject(child);
        const size = bbox.getSize(new THREE.Vector3());
        const volume = size.x * size.y * size.z;
        const VOLUME_THRESHOLD = 0.2;
        const isSignificantPart = volume > VOLUME_THRESHOLD;
        child.userData.animateOpacity = isSignificantPart;
        
        child.material = holoMaterial;
      } 
      else if (mode === "normal" && child.userData.originalMaterial) {
        // restore original material
        child.material = child.userData.originalMaterial;
      }
    }
  });
}

function updateHolographicEffect() {
  if (!model) return;
  
  model.traverse((child) => {
    // only animate opacity for parts marked for animation
    if (
      child.isMesh &&
      child.material instanceof THREE.MeshStandardMaterial &&
      child.userData.animateOpacity
    ) {
      const material = child.material;
      const baseOpacity = 0.6;
      
      if (Math.random() > 0.97) {
        const opacityVariation = 0.1;
        const randomFactor = Math.random() * opacityVariation - opacityVariation / 2;
        material.opacity = baseOpacity + randomFactor;
      }
    }
  });
}

function clearModel() {
  if (!scene || !model) return;
  
  scene.remove(model);
  model = null;
  
  modelLoaded = false;
  modelStats = null;
  updateUIStats();
  updateButtonStates(false);
}

function updateButtonStates(enabled) {
  // view mode buttons
  document.getElementById('btn-normal').disabled = !enabled;
  document.getElementById('btn-holo').disabled = !enabled;
  document.getElementById('btn-spider').disabled = !enabled;
  
  // rotation buttons
  document.getElementById('btn-rotate').disabled = !enabled;
  
  // clear model button
  document.getElementById('btn-clear').disabled = !enabled;
  
  // update active states
  document.getElementById('btn-normal').classList.toggle('active', enabled && viewMode === 'normal');
  document.getElementById('btn-holo').classList.toggle('active', enabled && viewMode === 'holo');
  document.getElementById('btn-spider').classList.toggle('active', enabled && viewMode === 'spider');
  
  // update speed gauge
  updateSpeedGaugeState();
}

function calculateTicks() {
  const container = document.getElementById('axis-container');
  if (!container) return;
  
  // clear existing ticks
  const existingTicks = container.querySelectorAll('.tick');
  existingTicks.forEach(tick => tick.remove());
  // get container dimensions
  const { width, height } = container.getBoundingClientRect();
  const TICK_SPACING = 6;
  const numTicksX = Math.floor(width / TICK_SPACING);
  const numTicksY = Math.floor(height / TICK_SPACING);
  
  for (let i = 0; i < numTicksX; i++) {
    const tick = document.createElement('div');
    tick.className = `tick x-tick ${i % 5 === 0 ? 'major-tick' : ''}`;
    tick.style.right = `${(i / (numTicksX - 1)) * 90}%`;
    container.appendChild(tick);
  }
  
  for (let i = 0; i < numTicksY; i++) {
    const tick = document.createElement('div');
    tick.className = `tick y-tick ${i % 5 === 0 ? 'major-tick' : ''}`;
    tick.style.bottom = `${(i / (numTicksY - 1)) * 90}%`;
    container.appendChild(tick);
  }
}

function generateXenoScript() {
  const container = document.getElementById('xenoscript');
  if (!container) return;
  
  const hebrewChars = "אבגדהוזחטיכלמנסעפצקרשת";
  const greekChars = "αβδεζηθλμξπρφχψω";
  const cyrillicChars = "бгджзлфцэюя";
  const alienChars = hebrewChars + greekChars + cyrillicChars;
  
  for (let i = 0; i < 20; i++) {
    const charElement = document.createElement('div');
    charElement.className = 'alien-char';
    
    const randomChar = alienChars[Math.floor(Math.random() * alienChars.length)];
    const left = Math.random() * 90 + 5;
    const top = Math.random() * 90 + 5;
    const opacity = 0.5 + Math.random() * 0.5;
    
    charElement.textContent = randomChar;
    charElement.style.left = `${left}%`;
    charElement.style.top = `${top}%`;
    charElement.style.opacity = opacity;
    
    container.appendChild(charElement);
  }
}

function setupHexaGrid() {
  const container = document.getElementById('hexagrid');
  if (!container) return;
  const activeHexagons = [true, false, true, false, true];
  
  for (let i = 0; i < 5; i++) {
    const hexagon = document.createElement('div');
    hexagon.className = `hexagon ${activeHexagons[i] ? 'active' : ''}`;
    container.appendChild(hexagon);
  }
  
  // randomly toggle hexagon active state every 2 seconds
  setInterval(() => {
    const hexagons = container.querySelectorAll('.hexagon');
    const randomIndex = Math.floor(Math.random() * hexagons.length);
    hexagons[randomIndex].classList.toggle('active');
  }, 2000);
}

function setupSpeedGauge() {
  const speedGauge = document.getElementById('speed-gauge');
  if (!speedGauge) return;
  
  // create speed segments
  SPEED_SEGMENTS.forEach((segValue, idx) => {
    const segment = document.createElement('div');
    segment.className = `speed-gauge-segment ${idx <= getActiveSegmentIndex() ? 'active' : ''}`;
    segment.title = `Set speed to ${segValue.toFixed(2)}`;
    segment.dataset.value = segValue;
    
    if (!modelLoaded || !rotationEnabled) {
      segment.classList.add('disabled');
    }
    
    segment.addEventListener('click', () => {
      if (!modelLoaded || !rotationEnabled) return;
      setRotationSpeed(segValue);
    });
    
    speedGauge.appendChild(segment);
  });
}

function updateSpeedGaugeState() {
  const segments = document.querySelectorAll('.speed-gauge-segment');
  const isEnabled = modelLoaded && rotationEnabled;
  
  segments.forEach(segment => {
    segment.classList.toggle('disabled', !isEnabled);
  });
}

function getActiveSegmentIndex() {
  const segmentWidth = (MODEL_ROTATION_MAX_SPEED - MODEL_ROTATION_MIN_SPEED) / (SPEED_GAUGE_SEGMENTS - 1);
  return Math.round((rotationSpeed - MODEL_ROTATION_MIN_SPEED) / segmentWidth);
}

function setRotationSpeed(speed) {
  rotationSpeed = speed;
  updateSpeedGaugeUI();
}

function updateSpeedGaugeUI() {
  const activeIndex = getActiveSegmentIndex();
  const segments = document.querySelectorAll('.speed-gauge-segment');
  
  segments.forEach((segment, index) => {
    segment.classList.toggle('active', index <= activeIndex);
  });
}

function handleSpeedGaugeMouseDown(e) {
  if (!modelLoaded || !rotationEnabled) return;
  isDragging = true;
  updateSpeedFromMousePosition(e);
  e.preventDefault();
}

function handleSpeedGaugeMouseMove(e) {
  if (!isDragging) return;
  updateSpeedFromMousePosition(e);
}

function handleSpeedGaugeMouseUp() {
  isDragging = false;
}

function updateSpeedFromMousePosition(e) {
  const speedGauge = document.getElementById('speed-gauge');
  if (!speedGauge) return;
  
  const gaugeRect = speedGauge.getBoundingClientRect();
  const relativeX = e.clientX - gaugeRect.left;
  
  // calculate percentage (0-1)
  const percentage = Math.max(0, Math.min(1, relativeX / gaugeRect.width));
  // calculate speed based on percentage
  const newSpeed = MODEL_ROTATION_MIN_SPEED + percentage * (MODEL_ROTATION_MAX_SPEED - MODEL_ROTATION_MIN_SPEED);
  
  setRotationSpeed(newSpeed);
}

function togglePanelDrag() {
  isPanelDragEnabled = !isPanelDragEnabled;
  
  const panel = document.getElementById('interface-panel');
  panel.classList.toggle('draggable-panel', isPanelDragEnabled);
  
  const moveButton = document.getElementById('btn-move-panel');
  moveButton.classList.toggle('active', isPanelDragEnabled);
  moveButton.classList.toggle('verde', isPanelDragEnabled);
  moveButton.classList.toggle('animate-warning-blink', isPanelDragEnabled);
  
  const secondaryText = moveButton.querySelector('.button-secondary-text');
  if (secondaryText) {
    secondaryText.textContent = isPanelDragEnabled ? "Lock/Panel" : "Unlock/Panel";
  }
}

// MARK: 3D object helper funcs

function createPlatformRings() {
  const rings = [];
  
  RING_DIAMETERS.forEach((diameter, idx) => {
    const ringGeometry = new THREE.RingGeometry(
      diameter - RING_THICKNESS[idx] / 2, // inner radius
      diameter + RING_THICKNESS[idx] / 2, // outer radius
      128 // theta segments (roundness of the ring)
    );
    
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: COLORS_ORANGE.darkBase,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: RING_OPACITIES[idx]
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2; // lay flat
    ring.position.y = 0; // at platform level
    
    rings.push(ring);
  });
  
  return rings;
}

function createCross() {
  const outerRingSize = RING_DIAMETERS[RING_DIAMETERS.length - 1];
  const crossSize = outerRingSize * 1;
  const CROSS_OPACITY = 0.6;
  const lineThickness = 0.01;
  
  const horizontalGeometry = new THREE.BoxGeometry(crossSize * 2, 0, lineThickness);
  const horizontalLine = new THREE.Mesh(
    horizontalGeometry,
    new THREE.MeshBasicMaterial({
      color: COLORS_ORANGE.darkBase,
      transparent: true,
      opacity: CROSS_OPACITY
    })
  );
  
  const verticalGeometry = new THREE.BoxGeometry(lineThickness, 0, crossSize * 2);
  const verticalLine = new THREE.Mesh(
    verticalGeometry,
    new THREE.MeshBasicMaterial({
      color: COLORS_ORANGE.darkBase,
      transparent: true,
      opacity: CROSS_OPACITY
    })
  );
  
  const crossGroup = new THREE.Group();
  crossGroup.add(horizontalLine);
  crossGroup.add(verticalLine);
  
  // position at platform level, slightly above to avoid z-fighting
  crossGroup.position.y = 0.0001;
  
  return crossGroup;
}
