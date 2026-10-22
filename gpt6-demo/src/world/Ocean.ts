import * as THREE from "three";
import { L } from "./layout";

export class Ocean {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(sunDir: THREE.Vector3) {
    const geo = new THREE.PlaneGeometry(3600, 1800, 120, 80);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSunDir: { value: sunDir.clone().normalize() },
          uDeep: { value: new THREE.Color(0x0a2a36) },
          uShallow: { value: new THREE.Color(0x1a5860) },
          uHorizon: { value: new THREE.Color(0xffb37a) },
          uZenith: { value: new THREE.Color(0x3d5f7d) },
          uSun: { value: new THREE.Color(0xffd2a2) },
        },
      ]),
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        #include <fog_pars_vertex>

        float wav(vec2 p, vec2 d, float f, float s, float a) {
          return sin(dot(p, d) * f + uTime * s) * a;
        }

        void main() {
          vec3 p = position;
          float t = uTime;
          float h = wav(p.xz, normalize(vec2(1.0, 0.30)), 0.055, 0.9, 0.35)
                  + wav(p.xz, normalize(vec2(-0.35, 1.0)), 0.11, 1.4, 0.2)
                  + wav(p.xz, normalize(vec2(0.8, -0.6)), 0.26, 2.1, 0.085)
                  + wav(p.xz, normalize(vec2(1.0, 0.9)), 0.55, 3.0, 0.04);
          p.y += h;

          vec2 d1 = normalize(vec2(1.0, 0.30));
          vec2 d2 = normalize(vec2(-0.35, 1.0));
          vec2 d3 = normalize(vec2(0.8, -0.6));
          float dx = 0.055 * 0.35 * cos(dot(p.xz, d1) * 0.055 + t * 0.9) * d1.x
                   + 0.11 * 0.2 * cos(dot(p.xz, d2) * 0.11 + t * 1.4) * d2.x
                   + 0.26 * 0.085 * cos(dot(p.xz, d3) * 0.26 + t * 2.1) * d3.x;
          float dz = 0.055 * 0.35 * cos(dot(p.xz, d1) * 0.055 + t * 0.9) * d1.y
                   + 0.11 * 0.2 * cos(dot(p.xz, d2) * 0.11 + t * 1.4) * d2.y
                   + 0.26 * 0.085 * cos(dot(p.xz, d3) * 0.26 + t * 2.1) * d3.y;
          vNormalW = normalize(vec3(-dx * 7.0, 1.0, -dz * 7.0));

          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uSun;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        #include <fog_pars_fragment>

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 N = normalize(vNormalW);

          N.x += sin(vWorldPos.x * 1.7 + uTime * 2.2) * 0.035;
          N.z += cos(vWorldPos.z * 1.3 + uTime * 1.9) * 0.035;
          N = normalize(N);

          vec3 R = reflect(-V, N);
          float up = clamp(R.y, 0.0, 1.0);
          vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, up));

          float sd = max(dot(R, uSunDir), 0.0);
          sky += uSun * pow(sd, 6.0) * 0.55;
          sky += uSun * pow(sd, 900.0) * 14.0;

          float fres = 0.03 + 0.97 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
          vec3 body = mix(uDeep, uShallow, clamp(N.y, 0.0, 1.0));
          vec3 col = mix(body, sky, clamp(fres, 0.0, 1.0));

          float shore = smoothstep(46.0, 37.5, vWorldPos.z);
          if (shore > 0.01) {
            float n = hash(floor(vWorldPos.xz * 1.6) + floor(uTime * 1.2));
            col = mix(col, vec3(0.88, 0.84, 0.78), shore * 0.5 * (0.35 + n * 0.65));
          }

          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(500, L.oceanY, 39 + 900);
    this.mesh.frustumCulled = false;
  }

  update(t: number) {
    this.mat.uniforms.uTime.value = t;
  }
}
