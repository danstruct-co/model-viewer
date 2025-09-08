import { Color, ShaderMaterial } from "three";

export default class RimLightMaterial extends ShaderMaterial {
  constructor(parameters: any = {}) {
    super({
      uniforms: {
        rimColor: { value: new Color(0x868686) },
        rimPower: { value: 2.0 },
        rimIntensity: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        
        #include <common>
        #include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        
        void main() {
          #include <beginnormal_vertex>
          #include <morphnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <defaultnormal_vertex>
          
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          
          vNormal = normalMatrix * objectNormal;
          vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
          vWorldPosition = mvPos.xyz;
          
          gl_Position = projectionMatrix * mvPos;
        }`,
      fragmentShader: `
        uniform vec3 rimColor;
        uniform float rimPower;
        uniform float rimIntensity;
        
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          vec3 normal = normalize(vNormal);
          
          vec3 viewDir = normalize(-vWorldPosition);
          
          float NdotV = dot(normal, viewDir);
          
          float rimFactor = 1.0 - max(0.0, NdotV);
          
          if (rimFactor < 0.7) {
             return;
          }
          
          float rim = pow(rimFactor, rimPower) * rimIntensity;
          vec3 finalColor = rimColor * rim;
          gl_FragColor = vec4(finalColor, rim);
        }`,
      transparent: true,
      blending: 2,
      depthWrite: false,
      ...parameters,
    });

    this.uniforms.rimColor.value = new Color("#868686");
    this.uniforms.rimPower.value = 2.0;
    this.uniforms.rimIntensity.value = 0.6;
  }
}
