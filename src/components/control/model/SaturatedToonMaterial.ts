import { MeshToonMaterial } from "three";

export class SaturatedToonMaterial extends MeshToonMaterial {
  constructor(parameters: any) {
    super(parameters);

    this.onBeforeCompile = (shader) => {
      shader.uniforms.saturation = { value: 1.6 };

      shader.fragmentShader = "uniform float saturation;\n" + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
        
        float luminance = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        float gray = luminance;
        
        float saturationFactor = saturation * (1.0 - smoothstep(0.8, 1.0, luminance));
        saturationFactor = max(saturationFactor, 1.0);
        
        gl_FragColor.rgb = mix(vec3(gray), gl_FragColor.rgb, saturationFactor);`
      );
    };
  }
}
