import { Color, ColorRepresentation, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three'

export interface InfiniteGridHelperOptions {
  size1?: number
  size2?: number
  color?: ColorRepresentation
  distance?: number
  axes?: string
}

export class InfiniteGridHelper extends Mesh {
  constructor(options: InfiniteGridHelperOptions = {}) {
    const { size1 = 10, size2 = 100, color = 'white', distance = 8000, axes = 'xzy' } = options

    const colorObj = color instanceof Color ? color : new Color(color)
    const planeAxes = axes.substr(0, 2)

    const geometry = new PlaneGeometry(2, 2, 1, 1)

    const material = new ShaderMaterial({
      side: DoubleSide,
      uniforms: {
        uSize1: { value: size1 },
        uSize2: { value: size2 },
        uColor: { value: colorObj },
        uDistance: { value: distance },
      },
      transparent: true,
      depthWrite: false, // Don't write to depth buffer
      vertexShader: `
        varying vec3 worldPosition;
        uniform float uDistance;
        
        void main() {
          vec3 pos = position.${axes} * uDistance;
          pos.${planeAxes} += cameraPosition.${planeAxes};
          
          worldPosition = pos;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 worldPosition;
        
        uniform float uSize1;
        uniform float uSize2;
        uniform vec3 uColor;
        uniform float uDistance;
        
        float getGrid(float size) {
          vec2 r = worldPosition.${planeAxes} / size;
          
          // Anti-aliasing with improved fwidth handling
          vec2 fw = fwidth(r);
          vec2 grid = abs(fract(r - 0.5) - 0.5) / max(fw, 0.001); // Prevent division by zero
          
          // Apply smoothstep for better anti-aliasing
          grid = smoothstep(0.0, 2.0, grid);
          
          float line = min(grid.x, grid.y);
          return 1.0 - min(line, 1.0);
        }
        
        void main() {
          float d = 1.0 - min(distance(cameraPosition.${planeAxes}, worldPosition.${planeAxes}) / uDistance, 1.0);
          
          // Distance-based grid opacity to reduce distant flickering
          float distanceFade = smoothstep(0.0, 0.3, d);
          
          float g1 = getGrid(uSize1) * distanceFade;
          float g2 = getGrid(uSize2) * distanceFade;
          
          // Improved alpha blending to reduce flickering
          float finalAlpha = mix(g2, g1, g1) * pow(d, 2.0); // Reduced power for smoother fade
          finalAlpha = mix(0.3 * finalAlpha, finalAlpha, g2); // Less aggressive mixing
          
          gl_FragColor = vec4(uColor.rgb, finalAlpha);
          
          if (gl_FragColor.a <= 0.01) discard; // Higher threshold to reduce noise
        }
      `,
    })

    super(geometry, material)
    this.frustumCulled = false
    this.renderOrder = -1000
  }

  updateSize1(size: number): void {
    if (this.material instanceof ShaderMaterial) {
      this.material.uniforms.uSize1.value = size
    }
  }

  updateSize2(size: number): void {
    if (this.material instanceof ShaderMaterial) {
      this.material.uniforms.uSize2.value = size
    }
  }

  updateColor(color: ColorRepresentation): void {
    if (this.material instanceof ShaderMaterial) {
      const colorObj = color instanceof Color ? color : new Color(color)
      this.material.uniforms.uColor.value = colorObj
    }
  }

  updateDistance(distance: number): void {
    if (this.material instanceof ShaderMaterial) {
      this.material.uniforms.uDistance.value = distance
    }
  }
}
