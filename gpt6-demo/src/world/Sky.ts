import * as THREE from "three";

/**
 * 程序化日落天空。HDRI 只用于环境光照 / 反射，
 * 可见天空用可控的渐变 + 太阳 + 云带，避免 HDRI 里的草地和建筑穿帮。
 */
export class Sky {
  mesh: THREE.Mesh;
  sunDir: THREE.Vector3;

  constructor(sunDir: THREE.Vector3) {
    this.sunDir = sunDir.clone().normalize();
    const geo = new THREE.SphereGeometry(1350, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: this.sunDir },
        uZenith: { value: new THREE.Color(0x1e3f63) },
        uMid: { value: new THREE.Color(0x8f86a0) },
        uHorizon: { value: new THREE.Color(0xffb37a) },
        uHaze: { value: new THREE.Color(0xffd0a0) },
        uSun: { value: new THREE.Color(0xffe3b8) },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uHaze;
        uniform vec3 uSun;
        uniform float uTime;
        varying vec3 vDir;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
          return v;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.15, 1.0);

          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.32, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.9, h));

          // 太阳光晕
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSun * pow(sd, 6.0) * 0.42;
          col += uSun * pow(sd, 60.0) * 0.9;

          // 太阳本体
          float disc = smoothstep(0.9986, 0.99935, sd);
          col = mix(col, uSun * 3.2, disc);

          // 地平线霞光
          float haze = exp(-max(h, 0.0) * 16.0);
          col = mix(col, uHaze, haze * 0.55);
          col = mix(col, uHaze * 0.9, exp(-max(h, 0.0) * 60.0) * 0.4);

          // 云带（低空薄云）
          vec2 cuv = vec2(atan(d.z, d.x) * 1.6 + uTime * 0.004, d.y * 7.0);
          float cloud = fbm(cuv * vec2(2.4, 3.2));
          cloud = smoothstep(0.52, 0.82, cloud) * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.35, 0.75, h));
          float sunlit = pow(sd, 3.0);
          vec3 cloudCol = mix(vec3(0.42, 0.34, 0.42), vec3(1.0, 0.72, 0.5), 0.35 + sunlit * 0.8);
          col = mix(col, cloudCol, cloud * 0.55);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(t: number, cameraPos: THREE.Vector3) {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    this.mesh.position.copy(cameraPos);
  }
}
