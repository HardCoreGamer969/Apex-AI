import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function TrackLine() {
  const groupRef = useRef<THREE.Group>(null);

  const { trackPoints, innerPoints } = useMemo(() => {
    const segments = 120;
    const outer: THREE.Vector3[] = [];
    const inner: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const r = 3.5 + 0.8 * Math.sin(3 * t) + 0.4 * Math.cos(5 * t);
      const ri = r - 0.4;
      outer.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * 0.3 * Math.sin(2 * t), Math.sin(t) * r));
      inner.push(new THREE.Vector3(Math.cos(t) * ri, Math.sin(t) * 0.3 * Math.sin(2 * t), Math.sin(t) * ri));
    }
    return { trackPoints: outer, innerPoints: inner };
  }, []);

  const carRef = useRef<THREE.Mesh>(null);
  const carProgress = useRef(0);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
    carProgress.current = (carProgress.current + delta * 0.12) % 1;
    if (carRef.current) {
      const idx = Math.floor(carProgress.current * (trackPoints.length - 1));
      const pt = trackPoints[idx];
      carRef.current.position.set(pt.x, pt.y + 0.1, pt.z);
    }
  });

  const outerGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(trackPoints), [trackPoints]);
  const innerGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(innerPoints), [innerPoints]);

  return (
    <group ref={groupRef}>
      {/* @ts-expect-error r3f line element */}
      <line geometry={outerGeo}>
        <lineBasicMaterial color="#e11d48" opacity={0.7} transparent />
      </line>
      {/* @ts-expect-error r3f line element */}
      <line geometry={innerGeo}>
        <lineBasicMaterial color="#ffffff" opacity={0.15} transparent />
      </line>
      <mesh ref={carRef}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="#e11d48" />
      </mesh>
    </group>
  );
}

export default function TrackHero() {
  return (
    <Canvas
      camera={{ position: [0, 5, 10], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color="#e11d48" />
      <pointLight position={[-5, 3, -5]} intensity={0.4} color="#f59e0b" />
      <TrackLine />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
    </Canvas>
  );
}
