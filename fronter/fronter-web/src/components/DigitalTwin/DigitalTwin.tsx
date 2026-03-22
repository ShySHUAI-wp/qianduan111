import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useRobotState } from './useRobotState';
import styles from './DigitalTwin.module.css';

type Props = {
  enabled: boolean;
};

function DigitalTwin({ enabled }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const rigRef = useRef<{
    root?: THREE.Group;
    shoulder?: THREE.Group;
    elbow?: THREE.Group;
    wrist?: THREE.Group;
  }>({});

  const { robotState, hasBackendStream } = useRobotState({ enabled });

  const badgeText = useMemo(() => {
    if (!enabled) return '未连接';
    return hasBackendStream ? '实时数据' : '演示数据';
  }, [enabled, hasBackendStream]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f6f7fb');

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(2.6, 1.8, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.8, 0);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(3, 6, 4);
    dir.castShadow = false;
    scene.add(dir);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 64),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Simple “robot” rig (procedural) — base + arm joints
    const matBody = new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.6, metalness: 0.15 });
    const matAccent = new THREE.MeshStandardMaterial({ color: '#93c5fd', roughness: 0.5, metalness: 0.05 });
    const matDark = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.8, metalness: 0.1 });

    const root = new THREE.Group();
    scene.add(root);

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.8), matBody);
    chassis.position.set(0, 0.18, 0);
    root.add(chassis);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.35), matBody);
    torso.position.set(0, 0.68, 0);
    root.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.22), matAccent);
    head.position.set(0, 1.1, 0);
    root.add(head);

    const makeWheel = () =>
      new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 24), matDark);
    const w1 = makeWheel();
    const w2 = makeWheel();
    const w3 = makeWheel();
    const w4 = makeWheel();
    [w1, w2, w3, w4].forEach((w) => {
      w.rotation.z = Math.PI / 2;
      w.position.y = 0.14;
      root.add(w);
    });
    w1.position.set(0.52, 0.14, 0.33);
    w2.position.set(0.52, 0.14, -0.33);
    w3.position.set(-0.52, 0.14, 0.33);
    w4.position.set(-0.52, 0.14, -0.33);

    // Arm rig
    const shoulder = new THREE.Group();
    shoulder.position.set(0.25, 0.88, 0.0);
    root.add(shoulder);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.12), matAccent);
    upper.position.set(0.28, 0, 0);
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0.55, 0, 0);
    shoulder.add(elbow);

    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.1), matAccent);
    fore.position.set(0.22, 0, 0);
    elbow.add(fore);

    const wrist = new THREE.Group();
    wrist.position.set(0.45, 0, 0);
    elbow.add(wrist);

    const gripper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.18), matDark);
    gripper.position.set(0.1, 0, 0);
    wrist.add(gripper);

    rigRef.current = { root, shoulder, elbow, wrist };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, []);

  // Apply state -> rig animation (kept tiny and extendable)
  useEffect(() => {
    if (!enabled) return;
    const { root, shoulder, elbow, wrist } = rigRef.current;
    if (!root || !shoulder || !elbow || !wrist) return;
    if (!robotState) return;

    const yaw = robotState.base?.yaw ?? 0;
    root.rotation.y = yaw;

    const j = robotState.joints || {};
    // 约定的最小 demo joint map；后端接入时可按 URDF joint name 扩展映射
    const shoulderQ = j.shoulder ?? 0;
    const elbowQ = j.elbow ?? 0;
    const wristQ = j.wrist ?? 0;
    shoulder.rotation.z = shoulderQ;
    elbow.rotation.z = elbowQ;
    wrist.rotation.z = wristQ;
  }, [enabled, robotState]);

  return (
    <div className={styles.wrap}>
      <div className={styles.badge}>{badgeText}</div>
      <div ref={containerRef} className={styles.canvas} />
    </div>
  );
}

export default DigitalTwin;

