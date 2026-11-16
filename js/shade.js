// Shared shader patches: caustic light on everything, swim / sway bending, rim light.
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uCausAmt: { value: 1 },
  uCausCol: { value: new THREE.Color(0.62, 0.92, 1.0) },
  uSurfY: { value: 22 },
};

// swim modes: 0 side-to-side (fish), 1 up-down (dolphin), 2 wing flap (manta), 3 jelly pulse, 4 plant sway
export function swimU(o = {}) {
  return {
    uSwim: { value: new THREE.Vector4(o.amp ?? 0.1, o.freq ?? 6, o.k ?? 3, o.phase ?? 0) },
    uSwimB: { value: new THREE.Vector3(o.head ?? 0, o.len ?? 1, o.mode ?? 0) },
  };
}

const CAUS = `
uniform float uTime, uCausAmt, uSurfY; uniform vec3 uCausCol; varying vec3 vCW; varying float vCUp;
float causL(vec2 q, float t){
  float a = sin(q.x*1.7 + t*0.9 + sin(q.y*1.3 + t*0.7)*1.6);
  float b = sin(q.y*1.9 - t*0.8 + sin(q.x*1.1 - t*0.6)*1.6);
  float c = sin((q.x+q.y)*1.3 + t*0.5 + sin(q.x*0.7 - q.y*0.9 + t)*1.2);
  return pow(1.0 - abs((a+b+c)/3.0), 7.0);
}
float caus(vec3 p, float t){ vec2 q = p.xz*0.45 + p.y*0.12; return causL(q, t)*0.7 + causL(q*1.9 + 3.1, t*1.3)*0.45; }
`;

const SWIM = `
{ float ph = uSwim.w;
#ifdef USE_INSTANCING
  ph += instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
#endif
  float md = uSwimB.z;
  if (md < 0.5) { float w = clamp((uSwimB.x - transformed.z) / uSwimB.y, 0.0, 1.0); transformed.x += sin(uTime*uSwim.y + ph - transformed.z*uSwim.z) * uSwim.x * w * w; }
  else if (md < 1.5) { float w = clamp((uSwimB.x - transformed.z) / uSwimB.y, 0.0, 1.0); transformed.y += sin(uTime*uSwim.y + ph - transformed.z*uSwim.z) * uSwim.x * w * w; }
  else if (md < 2.5) { float ax = abs(transformed.x); transformed.y += sin(uTime*uSwim.y + ph - ax*uSwim.z) * uSwim.x * ax * ax; }
  else if (md < 3.5) { float p = sin(uTime*uSwim.y + ph); float top = smoothstep(uSwimB.x - uSwimB.y, uSwimB.x, transformed.y);
    transformed.xz *= 1.0 + p*uSwim.x*top; float below = max(uSwimB.x - uSwimB.y*0.6 - transformed.y, 0.0);
    transformed.x += sin(uTime*uSwim.y*0.5 + ph + transformed.y*uSwim.z)*0.12*below; transformed.z += cos(uTime*uSwim.y*0.4 + ph + transformed.y*uSwim.z)*0.08*below; }
  else { float h = max(transformed.y, 0.0) / uSwimB.y; float bend = pow(h, 1.4) * uSwim.x;
    transformed.x += sin(uTime*uSwim.y + ph + transformed.y*uSwim.z) * bend; transformed.z += cos(uTime*uSwim.y*0.8 + ph*1.3 + transformed.y*uSwim.z*0.7) * bend * 0.6; }
}
`;

// mat: a MeshStandardMaterial / MeshLambertMaterial. o: { swim, rim, caustics, causMul }
export function patch(mat, o = {}) {
  const su = o.swim ? swimU(o.swim) : null;
  const rim = o.rim ? { value: new THREE.Color(o.rim) } : null;
  const causMul = { value: o.causMul ?? 1 };
  const caus = o.caustics !== false;
  mat.userData.swim = su; mat.userData.rim = rim; mat.userData.causMul = causMul;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uCausMul: causMul });
    if (su) Object.assign(sh.uniforms, su);
    if (rim) sh.uniforms.uRim = rim;
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
      uniform float uTime; varying vec3 vCW; varying float vCUp;
      ${su ? 'uniform vec4 uSwim; uniform vec3 uSwimB;' : ''}`);
    if (su) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWIM);
    vs = vs.replace('#include <fog_vertex>', `#include <fog_vertex>
      { vec4 cw = vec4(transformed, 1.0); vec3 cn = objectNormal;
#ifdef USE_INSTANCING
        cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
#endif
        cw = modelMatrix * cw; vCW = cw.xyz; vCUp = normalize(mat3(modelMatrix) * cn).y; }`);
    fs = fs.replace('#include <common>', `#include <common>\n${CAUS}\nuniform float uCausMul;\n${rim ? 'uniform vec3 uRim;' : ''}`);
    fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${caus ? `{ float up = clamp(vCUp*0.75 + 0.25, 0.0, 1.0); float dep = clamp(1.0 - (uSurfY - vCW.y)/48.0, 0.0, 1.0);
        totalEmissiveRadiance += uCausCol * caus(vCW, uTime) * up * dep * uCausAmt * uCausMul * diffuseColor.rgb * 1.9; }` : ''}
      ${rim ? 'totalEmissiveRadiance += uRim * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.6);' : ''}`);
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `rr-${su ? 's' : ''}${rim ? 'r' : ''}${caus ? 'c' : ''}`;
  return mat;
}

export function stdMat(o = {}, p = {}) {
  return patch(new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.75, metalness: 0 }, o)), p);
}
