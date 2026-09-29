import { Color, ColorRepresentation, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three'
import { AXIS_COLORS } from '../../control/model/screenGizmo'

export interface InfiniteGridHelperOptions {
  size1?: number
  size2?: number
  color?: ColorRepresentation
  distance?: number
  axes?: string
  /** 원점을 지나는 축 선 (종원 2026-09-29 "원점이 어디인지 블렌더처럼") — 평면 두 축을 축 표시와 같은 RGB 로. 기본 꺼짐 */
  axisLines?: boolean
}

export class InfiniteGridHelper extends Mesh {
  constructor(options: InfiniteGridHelperOptions = {}) {
    const { size1 = 10, size2 = 100, color = 'white', distance = 8000, axes = 'xzy', axisLines = false } = options

    const colorObj = color instanceof Color ? color : new Color(color)
    const planeAxes = axes.substr(0, 2)
    const axisColor = (axis: string) => new Color(AXIS_COLORS['xyz'.indexOf(axis)])

    const geometry = new PlaneGeometry(2, 2, 1, 1)

    const material = new ShaderMaterial({
      side: DoubleSide,
      uniforms: {
        uSize1: { value: size1 },
        uSize2: { value: size2 },
        uColor: { value: colorObj },
        uDistance: { value: distance },
        uAxisLines: { value: axisLines ? 1 : 0 },
        uAxisColorA: { value: axisColor(planeAxes[0]) },
        uAxisColorB: { value: axisColor(planeAxes[1]) },
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
        uniform float uAxisLines;
        uniform vec3 uAxisColorA;
        uniform vec3 uAxisColorB;
        
        // 원점을 지나는 축 선 — 화면에서 1.5px 폭(안티에일리어싱), 멀어지면 격자처럼 흐려진다
        float axisLine(float coord) {
          return 1.0 - smoothstep(0.0, 1.5, abs(coord) / max(fwidth(coord), 0.0001));
        }
        
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
          
          vec3 rgb = uColor.rgb;
          float alpha = finalAlpha;
          if (uAxisLines > 0.5) {
            float fade = pow(d, 2.0);
            float lineA = axisLine(worldPosition.${planeAxes[1]}) * fade; // 첫 축 선 = 둘째 좌표가 0 인 곳
            float lineB = axisLine(worldPosition.${planeAxes[0]}) * fade; // 둘째 축 선 = 첫 좌표가 0 인 곳
            rgb = mix(rgb, uAxisColorA, lineA);
            alpha = max(alpha, lineA * 0.9);
            rgb = mix(rgb, uAxisColorB, lineB);
            alpha = max(alpha, lineB * 0.9);
          }
          
          gl_FragColor = vec4(rgb, alpha);
          
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
